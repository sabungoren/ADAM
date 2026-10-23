#include "executor.h"

#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/idf_additions.h"
#include "freertos/projdefs.h"
#include "dwell.h"
#include "graph.h"
#include "motor.h"
#include "mqtt.h"
#include "path_resolver.h"
#include "sensors.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

static const char* TAG = "executor";

/* Robot status wire codes (adam_status_t, docs/06-protokol.md):
 * IDLE/MOVING/DWELL/ERROR are published, OBSTACLE (FC-51 brake) is internal
 * only and never published.
 * s_state below is the *scheduler* state (what the task loop does),
 * s_status is the published wire status. */
typedef enum {
    STATE_IDLE,
    STATE_MOVING,
    STATE_ERROR,
} exec_state_t;

static volatile exec_state_t s_state = STATE_IDLE;
static volatile adam_status_t s_status = ADAM_STATUS_IDLE;

// PID line follower constants (base speed 160, Kp 45, Kd 18)
#define PID_BASE_SPEED 160
#define PID_KP 45.0f
#define PID_KD 18.0f
#define PID_LOOP_MS 10 // 100 Hz control loop (spec 7.1)

// Node detection: the 3-IR junction must be seen several times in a row
#define NODE_JUNCTION_RUNS 3
// Navigation errors: line lost while MOVING (spec 7.2) and step timeout
#define LINE_LOST_MS 500
#define STEP_TIMEOUT_MS 30000
// FC-51 obstacle brake: beep at most once per interval
#define OBSTACLE_BEEP_MS 300

static nav_path_t s_nav;
static size_t s_step = 0;

static float s_last_error = 0.0f;

// Junction counter of the node detection (spec 2.2)
static int s_junction_run = 0;
// Color marker validation of the junction that is currently counted
static bool s_junction_valid = false;

static inline int64_t now_ms(void) {
    return esp_timer_get_time() / 1000;
}

static int64_t s_step_deadline = 0;
static int64_t s_no_line_since = -1;
static int64_t s_last_obstacle_beep = 0;
static bool s_obstacle_latched = false;
// Anti false-arrival latch: after an arrival the junction has to leave the
// sensor view before the next node may be detected
static bool s_wait_clear = false;

// Serial log name only - never sent on the wire (docs/06-protokol.md)
static const char* err_name(adam_error_t err) {
    switch (err) {
    case ADAM_ERR_NO_PATH:
        return "NO_PATH";
    case ADAM_ERR_LINE_LOST:
        return "LINE_LOST";
    case ADAM_ERR_NODE_TIMEOUT:
        return "NODE_TIMEOUT";
    default:
        return "UNKNOWN";
    }
}

adam_status_t executor_status(void) {
    return s_status;
}

// Publish the status, but only when it actually changed
static void publish_status(adam_status_t status) {
    static int s_published = -1;
    if (s_published == (int)status) {
        return;
    }
    s_published = (int)status;
    uint8_t wire = (uint8_t)status;
    mqtt_publish(MQTT_STATUS_TOPIC, (const char*)&wire, 1, 1, true);
}

static void publish_pos(size_t node) {
    char c = (char)(node + 'A');
    mqtt_publish(MQTT_CURRENT_POS_TOPIC, &c, 1, 1, true);
    ESP_LOGI(TAG, "Position published: node %c", c);
}

void executor_set_error(adam_error_t reason) {
    if (s_state == STATE_ERROR) {
        return;
    }
    s_state = STATE_ERROR;

    // Spec 7.2: stop the motor and flush every queue
    motor_halt();
    path_resolver_flush_paths();
    mqtt_flush_jobs();

    uint8_t code = (uint8_t)reason;
    mqtt_publish(MQTT_ERROR_TOPIC, (const char*)&code, 1, 1, false);
    publish_status(ADAM_STATUS_ERROR);
    s_status = ADAM_STATUS_ERROR;
    ESP_LOGE(TAG, "ERROR: %s, robot stopped and waits for an admin reset (spec 7.2)", err_name(reason));
}

/* Start a new step: turn the robot to the edge direction (spec 3.2),
 * reset the deadline and send the MOVING status.
 * Fails when the edge is not valid in the graph. */
static bool move_begin_step(void) {
    size_t from = s_nav.path[s_step - 1];
    size_t to = s_nav.path[s_step];

    const uint8_t* edges;
    size_t count;
    if (!graph_get(&edges, &count) || from >= count || to >= count) {
        return false;
    }

    uint8_t edge = edges[(from * count) + to];
    if (EDGE_WEIGHT(edge) == NO_EDGE) {
        return false;
    }

    motor_turn_to_heading(EDGE_DIR(edge));

    s_step_deadline = now_ms() + STEP_TIMEOUT_MS;
    s_no_line_since = -1;
    s_last_error = 0.0f;

    ESP_LOGI(TAG, "Step %d/%d: %c -> %c dir %s", (int)s_step, (int)s_nav.len - 1, (int)(from + 'A'), (int)(to + 'A'),
             STR_DIR[EDGE_DIR(edge)]);
    return true;
}

// Line pattern summary: bitmask of the 3 sensors (bit0 left, bit1 middle, bit2 right)
static inline int line_pattern(int l, int m, int r) {
    return (l & 1) | ((m & 1) << 1) | ((r & 1) << 2);
}

// One MOVING iteration: PID, obstacle brake, node detection, LINE_LOST, timeout
static void moving_tick(void) {
    int l, m, r;
    sensors_line_read(&l, &m, &r);
    int pattern = line_pattern(l, m, r);

    // FC-51 safety brake: stop on an obstacle, continue when the way is free
    if (sensors_obstacle_detected()) {
        motor_halt();
        if (!s_obstacle_latched) {
            s_obstacle_latched = true;
            ESP_LOGW(TAG, "OBSTACLE (FC-51)! Motor stopped temporarily");
        }
        if (now_ms() - s_last_obstacle_beep > OBSTACLE_BEEP_MS) {
            s_last_obstacle_beep = now_ms();
            sensors_buzzer_beep(60);
        }
        return;
    }
    if (s_obstacle_latched) {
        s_obstacle_latched = false;
        ESP_LOGW(TAG, "No obstacle anymore, resuming navigation");
    }

    // LINE_LOST (spec 7.2): no sensor sees the line
    if (pattern == 0) {
        if (s_no_line_since < 0) {
            s_no_line_since = now_ms();
        } else if (now_ms() - s_no_line_since > LINE_LOST_MS) {
            ESP_LOGE(TAG, "Line lost (3 sensors blank > %d ms)", LINE_LOST_MS);
            executor_set_error(ADAM_ERR_LINE_LOST);
            return;
        }
    } else {
        s_no_line_since = -1;
    }

    // PID line follower: line error -1..1 with differential steering
    float error = 0.0f;
    if ((pattern & 0b001) && !(pattern & 0b100)) {
        error = -1.0f; // line under the left sensor
    } else if ((pattern & 0b100) && !(pattern & 0b001)) {
        error = 1.0f; // line under the right sensor
    }

    float p = PID_KP * error;
    float d = PID_KD * (error - s_last_error);
    s_last_error = error;

    motor_set_speed(PID_BASE_SPEED - (int)(p + d), PID_BASE_SPEED + (int)(p + d));

    // Node arrival detection (spec 2.2): the 3 IR sensors see the line at the
    // same time (Wokwi fallback), validated by the TCS3200 color marker.
    // After one arrival the junction has to leave the sensors first (s_wait_clear).
    bool node_detected = false;

    if (s_wait_clear && pattern != 0b111) {
        s_wait_clear = false;
    }

    if (!s_wait_clear && pattern == 0b111) {
        if (s_junction_run == 0) {
            s_junction_valid = sensors_color_marker_present();
        }
        s_junction_run++;
        if (s_junction_run >= NODE_JUNCTION_RUNS) {
            node_detected = true;
        }
    } else if (pattern != 0b111) {
        s_junction_run = 0;
        s_junction_valid = false;
    }

    if (!node_detected) {
        // Step timeout: the node was not reached
        if (now_ms() > s_step_deadline) {
            ESP_LOGE(TAG, "Step %d/%d not finished within %d ms", (int)s_step, (int)s_nav.len - 1, STEP_TIMEOUT_MS);
            executor_set_error(ADAM_ERR_NODE_TIMEOUT);
            return;
        }
        return; // not there yet, keep running the PID
    }

    // Valid node arrival
    motor_halt();
    ESP_LOGI(TAG, "NODE DETECTED (marker: %s)", s_junction_valid ? "TCS3200 color" : "3-IR junction fallback");

    size_t to = s_nav.path[s_step];
    s_junction_run = 0;
    s_junction_valid = false;
    s_wait_clear = true;
    publish_pos(to);
    path_resolver_set_current(to);
    s_step++;

    // Home (Node A): face north again (spec 3.1 and 7.2)
    if (to == 0) {
        motor_turn_to_heading(DIR_NORTH);
    }

    if (s_step >= s_nav.len) {
        // Path finished
        s_junction_run = 0;

        if (!s_nav.recovery) {
            // Dwell on the target node (spec 4) after a normal ride
            publish_status(ADAM_STATUS_DWELL);
            s_status = ADAM_STATUS_DWELL;
            dwell_run();
        }
        s_status = ADAM_STATUS_IDLE;
        publish_status(ADAM_STATUS_IDLE);
        s_state = STATE_IDLE;
        ESP_LOGI(TAG, "%s navigation finished, back to IDLE", s_nav.recovery ? "Recovery" : "Normal");
        return;
    }

    // Continue with the next edge
    if (!move_begin_step()) {
        executor_set_error(ADAM_ERR_NO_PATH);
        return;
    }
}

// One IDLE iteration: take a path from the Route Finder and start navigating
static void idle_tick(void) {
    nav_path_t nav;
    if (!get_nav(&nav)) {
        vTaskDelay(pdMS_TO_TICKS(50));
        return;
    }

    if (nav.len == 0 || nav.len > NAV_MAX_NODES) {
        ESP_LOGW(TAG, "Invalid path (len=%d), dropped", (int)nav.len);
        return;
    }

    s_nav = nav;
    s_step = 1;
    s_wait_clear = true; // do not detect a node while still on the start node

    if (s_nav.len == 1) {
        // Target = current position: dwell right away (spec 4), without moving
        publish_status(ADAM_STATUS_DWELL);
        s_status = ADAM_STATUS_DWELL;
        dwell_run();
        s_status = ADAM_STATUS_IDLE;
        publish_status(ADAM_STATUS_IDLE);
        ESP_LOGI(TAG, "Already on the target node, dwell finished");
        return;
    }

    s_status = ADAM_STATUS_MOVING;
    publish_status(ADAM_STATUS_MOVING);
    if (!move_begin_step()) {
        executor_set_error(ADAM_ERR_NO_PATH);
    }
}

static void executor(void* pvParameters) {
    ESP_LOGI(TAG, "Task Executor ON: PID 100 Hz (Kp=%d, Kd=%d), core 1, prio 3", (int)PID_KP, (int)PID_KD);

    publish_status(ADAM_STATUS_IDLE);

    for (;;) {
        switch (s_state) {
        case STATE_MOVING:
            moving_tick();
            vTaskDelay(pdMS_TO_TICKS(PID_LOOP_MS));
            break;

        case STATE_IDLE:
            idle_tick();
            break;

        case STATE_ERROR:
            // Spec 7.2: the robot stays on current_node and waits for the admin.
            // Only a 'recovery' path (from the reset command) is accepted.
            motor_halt();
            {
                nav_path_t nav;
                bool got = get_nav(&nav);
                if (got && nav.recovery && nav.len >= 1) {
                    ESP_LOGW(TAG, "Recovery: admin reset route accepted (%d nodes)", (int)nav.len);
                    s_nav = nav;
                    s_wait_clear = true;

                    if (nav.len == 1) { // Reset while already on Home: only fix the heading
                        motor_turn_to_heading(DIR_NORTH);
                        s_status = ADAM_STATUS_IDLE;
                        publish_status(ADAM_STATUS_IDLE);
                        s_state = STATE_IDLE;
                        ESP_LOGI(TAG, "Recovery finished (already on Home)");
                        break;
                    }

                    s_step = 1;
                    s_state = STATE_MOVING;
                    s_status = ADAM_STATUS_MOVING;
                    publish_status(ADAM_STATUS_MOVING);
                    if (!move_begin_step()) {
                        executor_set_error(ADAM_ERR_NO_PATH);
                    }
                } else if (got) {
                    ESP_LOGW(TAG, "Non recovery path ignored while in ERROR");
                } else {
                    vTaskDelay(pdMS_TO_TICKS(200));
                }
            }
            break;

        default:
            break;
        }
    }
}

esp_err_t init_executor(void) {
    if (xTaskCreatePinnedToCore(executor, "Task Executor", 4096, NULL, 3, NULL, 1) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
