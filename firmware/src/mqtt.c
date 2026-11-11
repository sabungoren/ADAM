#include "mqtt.h"

#include "esp_check.h"
#include "esp_err.h"
#include "esp_event_base.h"
#include "esp_log.h"
#include "esp_system.h"
#include "executor.h"
#include "freertos/idf_additions.h"
#include "freertos/projdefs.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "graph.h"
#include "graph_fetch.h"
#include "mqtt_client.h"
#include "nvs.h"
#include "portmacro.h"
#include "protocol.h"
#include "sdkconfig.h"
#include "sensors.h"
#include <inttypes.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
#    include "esp_crt_bundle.h"
#endif

static const char* TAG = "mqtt";

#define HEARTBEAT_INTERVAL_MS 10000
#define BATTERY_INTERVAL_MS 30000

static QueueHandle_t s_job_queue;
static QueueHandle_t s_msg_queue;

static esp_mqtt_client_handle_t s_client;

// The only periodic messages of the protocol (spec 07.4), low priority so it
// never disturbs the MQTT socket task.
static void mqtt_telemetry_task(void* pvParameters) {
    TickType_t last_battery = xTaskGetTickCount();
    for (;;) {
        // Send the online heartbeat every 10 seconds
        mqtt_publish_u8(MQTT_ONLINE_TOPIC, 0x01, 1, true);

        // Send the battery level every 30 seconds
        TickType_t now = xTaskGetTickCount();
        if ((now - last_battery) >= pdMS_TO_TICKS(BATTERY_INTERVAL_MS)) {
            last_battery = now;
            uint8_t battery = sensors_get_battery_percent();
            mqtt_publish_u8(MQTT_BATTERY_TOPIC, battery, 1, true);
        }

        vTaskDelay(pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS));
    }
}

// online = 0 before a clean disconnect; the LWT only covers abnormal ones
// (spec 06.4). Registered as an esp_restart() shutdown handler, the delay flushes it.
static void publish_offline(void) {
    if (s_client == NULL) {
        return;
    }
    ESP_LOGI(TAG, "Clean disconnect: publishing online = 0");
    mqtt_publish_u8(MQTT_ONLINE_TOPIC, 0x00, 1, true);
    vTaskDelay(pdMS_TO_TICKS(200));
}

// esp-mqtt recycles MQTT_EVENT_DATA buffers when the handler returns, so every
// byte the validation task needs is copied into this queue-safe value first.
#define MQTT_MSG_TOPIC_MAX 32
#define MQTT_MSG_DATA_MAX 4 // command payload max 3 bytes (spec 06.4)

typedef struct {
    char topic[MQTT_MSG_TOPIC_MAX];
    int topic_len;
    char data[MQTT_MSG_DATA_MAX];
    int data_len;
} mqtt_msg_t;

// req_id is 2-byte little-endian (spec 06.4: 34 12 43 -> 0x1234, node 'C')
static uint16_t parse_req_id(const char* data) {
    return (uint16_t)((uint8_t)data[0] | ((uint16_t)(uint8_t)data[1] << 8));
}

// Single writer for adam/srv/ack: [req_id:2 LE][result:1], QoS 1, no retain (spec 06.4)
static void publish_ack(uint16_t req_id, adam_ack_t result) {
    uint8_t payload[3];
    payload[0] = (uint8_t)(req_id & 0xff);
    payload[1] = (uint8_t)(req_id >> 8);
    payload[2] = (uint8_t)result;
    mqtt_publish(MQTT_ACK_TOPIC, (const char*)payload, 3, 1, false);
}

// (req_id, node) dedup: a QoS 1 retry gets DUPLICATE, never a second job (spec 07.2).
// Ring buffer, written by two tasks, cleared on every connect (spec 07.2).
#define DEDUP_CACHE_SIZE 8

typedef struct {
    uint16_t req_id;
    char node;
    bool used;
} dedup_entry_t;

static dedup_entry_t s_dedup[DEDUP_CACHE_SIZE];
static size_t s_dedup_next_index = 0;
static portMUX_TYPE s_dedup_lock = portMUX_INITIALIZER_UNLOCKED;

static bool dedup_has(uint16_t req_id, char node) {
    bool found = false;
    portENTER_CRITICAL(&s_dedup_lock);
    for (size_t i = 0; i < DEDUP_CACHE_SIZE; i++) {
        if (s_dedup[i].used && s_dedup[i].req_id == req_id && s_dedup[i].node == node) {
            found = true;
            break;
        }
    }
    portEXIT_CRITICAL(&s_dedup_lock);
    return found;
}

static void dedup_remember(uint16_t req_id, char node) {
    if (req_id == 0x0000) {
        return; // 0x0000 is reserved (spec 07.5)
    }
    portENTER_CRITICAL(&s_dedup_lock);
    s_dedup[s_dedup_next_index] = (dedup_entry_t){.req_id = req_id, .node = node, .used = true};
    s_dedup_next_index = (s_dedup_next_index + 1) % DEDUP_CACHE_SIZE;
    portEXIT_CRITICAL(&s_dedup_lock);
}

static void dedup_clear(void) {
    portENTER_CRITICAL(&s_dedup_lock);
    memset(s_dedup, 0, sizeof(s_dedup));
    s_dedup_next_index = 0;
    portEXIT_CRITICAL(&s_dedup_lock);
}

static inline bool topic_matches(const mqtt_msg_t* msg, const char* topic) {
    return msg->topic_len == (int)strlen(topic) && memcmp(msg->topic, topic, (size_t)msg->topic_len) == 0;
}

static void mqtt_event_handler(void* handler_args, esp_event_base_t base, int32_t event_id, void* event_data) {
    esp_mqtt_event_handle_t event = event_data;
    esp_mqtt_client_handle_t client = event->client;
    switch ((esp_mqtt_event_id_t)event_id) {
    case MQTT_EVENT_CONNECTED:
        ESP_LOGI(TAG, "MQTT connected");

        // The dedup cache never survives a reconnect (spec 07.2)
        dedup_clear();

        // Connect order (spec 06.4): publish graph_version and the telemetry
        // snapshot (IDLE + [A][0] at boot, the live state on reconnect) before
        // online = 1, so a stale retained MOVING is never visible while the
        // robot comes online. On success graph_version is the fetched version;
        // on failure it stays 0 and the executor reports ERROR right after.
        mqtt_publish_graph_version(graph_version());
        executor_publish_telemetry();
        mqtt_publish_u8(MQTT_ONLINE_TOPIC, 0x01, 1, true);

        // Battery is published here and then every 30 s; trash here and after
        // every dwell (spec 07.4)
        uint8_t battery = sensors_get_battery_percent();
        uint8_t trash = sensors_get_trash_level_percent();
        mqtt_publish_u8(MQTT_BATTERY_TOPIC, battery, 1, true);
        mqtt_publish_u8(MQTT_TRASH_TOPIC, trash, 1, true);

        esp_mqtt_client_subscribe(client, MQTT_MOVE_TOPIC, 1);
        esp_mqtt_client_subscribe(client, MQTT_RESET_TOPIC, 1);
        ESP_LOGI(TAG, "Subscriptions sent");

        break;
    case MQTT_EVENT_DISCONNECTED:
        ESP_LOGI(TAG, "MQTT disconnected");
        break;
    case MQTT_EVENT_SUBSCRIBED:
        if (event->error_handle->error_type == MQTT_ERROR_TYPE_SUBSCRIBE_FAILED) {
            ESP_LOGE(TAG, "Subscription rejected by the broker (msg_id=%d)", event->msg_id);
        }
        break;
    case MQTT_EVENT_DATA: {
        // Copy the bytes out of the event: queueing the event pointer itself
        // would store the first word of the struct, not the pointer.
        mqtt_msg_t msg = {
            .topic_len = event->topic_len,
            .data_len = event->data_len,
        };
        if (msg.topic_len > (int)sizeof(msg.topic)) {
            msg.topic_len = (int)sizeof(msg.topic);
        }
        if (msg.data_len > (int)sizeof(msg.data)) {
            msg.data_len = (int)sizeof(msg.data);
        }
        if (msg.topic_len > 0) {
            memcpy(msg.topic, event->topic, (size_t)msg.topic_len);
        }
        if (msg.data_len > 0) {
            memcpy(msg.data, event->data, (size_t)msg.data_len);
        }

        // A command must never vanish silently: wait for the validation task
        // and, if it still cannot be queued, answer QUEUE_FULL so the gateway
        // does not have to sit out its ack timeout (spec 06.2).
        if (xQueueSend(s_msg_queue, &msg, pdMS_TO_TICKS(100)) != pdTRUE) {
            ESP_LOGE(TAG, "Validation queue full, dropped %.*s", msg.topic_len, msg.topic);
            if (topic_matches(&msg, MQTT_MOVE_TOPIC) && msg.data_len >= 2) {
                publish_ack(parse_req_id(msg.data), ADAM_ACK_QUEUE_FULL);
            }
        }
        break;
    }
    case MQTT_EVENT_ERROR:
        if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
            ESP_LOGE(TAG, "Last error code reported from esp-tls: 0x%x", event->error_handle->esp_tls_last_esp_err);
            ESP_LOGE(TAG, "Last TLS stack error number: 0x%x", event->error_handle->esp_tls_stack_err);
            ESP_LOGE(TAG, "Last captured errno: %d (%s)", event->error_handle->esp_transport_sock_errno,
                     strerror(event->error_handle->esp_transport_sock_errno));
        } else if (event->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
            ESP_LOGE(TAG, "Connection refused error: 0x%x", event->error_handle->connect_return_code);
        } else {
            ESP_LOGE(TAG, "Unknown error type: 0x%x", event->error_handle->error_type);
        }
        break;
    default:
        break;
    }
}

static void mqtt_validate_task(void* pvParameters) {
    for (;;) {
        mqtt_msg_t msg;
        if (xQueueReceive(s_msg_queue, &msg, portMAX_DELAY) == pdTRUE) {
            if (topic_matches(&msg, MQTT_MOVE_TOPIC)) {
                uint16_t req_id = msg.data_len >= 2 ? parse_req_id(msg.data) : 0;

                if (msg.data_len < 3) {
                    // Invalid payload -> INVALID_TARGET (spec 06.4); returning
                    // here would tear down the task and swallow later commands
                    publish_ack(req_id, ADAM_ACK_INVALID_TARGET);
                    continue;
                }

                adam_ack_t ack_status = ADAM_ACK_ACCEPTED;
                adam_job_t job = {
                    .req.id = req_id,
                    .req.node = msg.data[2],
                    .internal = false,
                };

                // Dedup before everything but the payload length, so a QoS 1
                // retry is never taken for a new job (spec 07.2)
                if (job.req.id != 0x0000 && dedup_has(job.req.id, job.req.node)) {
                    publish_ack(job.req.id, ADAM_ACK_DUPLICATE);
                    continue;
                }

                // ERROR or graph not ready (boot/fetch failed) -> NOT_READY (spec 07.2)
                if (executor_status() == ADAM_STATUS_ERROR || !graph_ready()) {
                    publish_ack(job.req.id, ADAM_ACK_NOT_READY);
                    continue;
                }

                if (job.req.node < 'A' || job.req.node > 'Z') {
                    ack_status = ADAM_ACK_INVALID_TARGET;
                    goto publish;
                }
                // Not IDLE or mailbox still holds a job -> BUSY, so the gateway
                // can requeue; a later send failure is QUEUE_FULL (spec 06.2, 07.2)
                if (executor_status() != ADAM_STATUS_IDLE || uxQueueMessagesWaiting(s_job_queue) > 0) {
                    ack_status = ADAM_ACK_BUSY;
                    goto publish;
                }
                uint8_t trash = sensors_get_trash_level_percent();
                if (trash >= SENSORS_TRASH_FULL_PERCENT) {
                    ack_status = ADAM_ACK_TRASH_FULL;
                    mqtt_publish_u8(MQTT_TRASH_TOPIC, trash, 1, true);
                    goto publish;
                }
                if (xQueueSend(s_job_queue, &job, (TickType_t)0) != pdTRUE) {
                    ack_status = ADAM_ACK_QUEUE_FULL;
                    goto publish;
                }
            publish:
                if (ack_status == ADAM_ACK_ACCEPTED) {
                    dedup_remember(job.req.id, job.req.node);
                }
                publish_ack(job.req.id, ack_status);

            } else if (topic_matches(&msg, MQTT_RESET_TOPIC)) {
                adam_status_t status = executor_status();
                if (status != ADAM_STATUS_IDLE && status != ADAM_STATUS_ERROR) {
                    // The reset is only accepted while the robot is not serving
                    // (spec 07.3.2); the gateway rejected it with 409 first, so a
                    // command that still arrives here is logged and dropped.
                    ESP_LOGW(TAG, "Admin reset ignored while serving (status=%d)", (int)status);
                    continue;
                }
                // Reset = state fresh (spec 06.2, 07.3.2): empty the mailbox
                // and the dedup cache (a retried req_id must be judged against
                // the fresh state), then the executor re-fetches the graph and
                // forces [A][0] north. No ack/error is ever sent for a reset.
                mqtt_flush_jobs();
                dedup_clear();
                executor_request_reset();
            }
        }
    }
}

esp_err_t mqtt_app_start(void) {
    // Barrier, not a gate: the boot fetch already ran (main.c calls
    // graph_fetch_init first), so this waits for it to settle and keeps the
    // two TLS sessions from overlapping. A failed fetch must still start the
    // client - ERROR/FETCH_FAILED is reported over MQTT (spec 06.4, 07.2).
    if (!graph_fetch_success()) {
        ESP_LOGW(TAG, "Graph fetch failed, starting MQTT anyway to report ERROR");
    }
    nvs_handle_t nvs_handle;
    // The variable must be named 'ret': the ESP_GOTO_ON_ERROR macro uses it
    esp_err_t ret = nvs_open("mqtt", NVS_READONLY, &nvs_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS namespace mqtt: %s", esp_err_to_name(ret));
        return ret;
    }

    // Filled by nvs_get_str with the size needed for the value (including NUL)
    size_t required_size;
    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.uri", NULL, &required_size), nvs_close_on_error, TAG,
                      "Failed to get NVS required size for %s", "mqtt.uri");
    char mqtt_uri[256];
    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.uri", mqtt_uri, &required_size), nvs_close_on_error, TAG,
                      "Failed to get %s from NVS", "mqtt.uri");

    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.username", NULL, &required_size), nvs_close_on_error, TAG,
                      "Failed to get NVS required size for %s", "mqtt.username");
    char mqtt_username[256];
    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.username", mqtt_username, &required_size), nvs_close_on_error, TAG,
                      "Failed to get %s from NVS", "mqtt.username");

    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.password", NULL, &required_size), nvs_close_on_error, TAG,
                      "Failed to get NVS required size for %s", "mqtt.password");
    char mqtt_password[256];
    ESP_GOTO_ON_ERROR(nvs_get_str(nvs_handle, "mqtt.password", mqtt_password, &required_size), nvs_close_on_error, TAG,
                      "Failed to get %s from NVS", "mqtt.password");

    nvs_close(nvs_handle);

    const esp_mqtt_client_config_t mqtt_cfg = {
        .broker =
            {
                .address.uri = mqtt_uri,

                .verification =
                    {
#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
                        .crt_bundle_attach = esp_crt_bundle_attach,
#endif
                    },
            },
        .credentials =
            {
                .client_id = "adam-robot",
                .username = mqtt_username,
                .authentication.password = mqtt_password,
            },
        .session =
            {
                .keepalive = 30, // seconds
                .disable_clean_session = false,
                .last_will =
                    {
                        .topic = MQTT_ONLINE_TOPIC,
                        .msg = "\x00",
                        .msg_len = 1,
                        .qos = 1,
                        .retain = true,
                    },
            },
        .task =
            {
                .priority = 2,
            },
    };

    // One slot for the message being validated, one for the next arrival
    s_msg_queue = xQueueCreate(2, sizeof(mqtt_msg_t));
    if (s_msg_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }

    // A single pending command is enough: the gateway waits for its ack
    s_job_queue = xQueueCreate(1, sizeof(adam_job_t));
    if (s_job_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (s_client == NULL) {
        return ESP_ERR_NO_MEM;
    }
    ESP_RETURN_ON_ERROR(esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL), TAG,
                        "Failed to register MQTT event handler");
    ESP_RETURN_ON_ERROR(esp_mqtt_client_start(s_client), TAG, "Failed to start MQTT");

    // 3 KB stack, priority 1, core 0 for both helper tasks
    if (xTaskCreatePinnedToCore(mqtt_validate_task, "Event Validation", 3072, NULL, 1, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    if (xTaskCreatePinnedToCore(mqtt_telemetry_task, "Task Telemetry", 3072, NULL, 1, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    ESP_RETURN_ON_ERROR(esp_register_shutdown_handler(publish_offline), TAG, "Failed to register shutdown handler");

    return ESP_OK;

nvs_close_on_error:
    nvs_close(nvs_handle);
    return ret;
}

void mqtt_publish(const char* topic, const char* data, int len, int qos, int retain) {
    if (s_client == NULL) {
        return;
    }
    esp_mqtt_client_publish(s_client, topic, data, len, qos, retain);
}

void mqtt_publish_u8(const char* topic, uint8_t data, int qos, int retain) {
    if (s_client == NULL) {
        return;
    }
    esp_mqtt_client_publish(s_client, topic, (const char*)&data, 1, qos, retain);
}

void mqtt_publish_graph_version(uint32_t version) {
    uint8_t payload[4] = {
        (uint8_t)(version & 0xff),
        (uint8_t)((version >> 8) & 0xff),
        (uint8_t)((version >> 16) & 0xff),
        (uint8_t)((version >> 24) & 0xff),
    };
    mqtt_publish(MQTT_GRAPH_VERSION_TOPIC, (const char*)payload, 4, 1, true);
    ESP_LOGI(TAG, "Graph version published: %" PRIu32, version);
}

bool mqtt_get_job_blocked(adam_job_t* job) {
    // The Route Finder may start before mqtt_app_start() created the queue
    if (s_job_queue == NULL) {
        return false;
    }
    return xQueueReceive(s_job_queue, job, portMAX_DELAY) == pdTRUE;
}

void mqtt_flush_jobs(void) {
    if (s_job_queue != NULL) {
        xQueueReset(s_job_queue);
    }
}

void mqtt_enqueue_internal_home(void) {
    // The mailbox belongs to the gateway's moveto while it holds a job; the
    // auto-park retry happens on the next IDLE settle, so a drop is harmless.
    if (s_job_queue == NULL || uxQueueMessagesWaiting(s_job_queue) > 0) {
        return;
    }
    adam_job_t job = {
        .req.id = 0,
        .req.node = 'A',
        .internal = true,
    };
    if (xQueueSend(s_job_queue, &job, (TickType_t)0) != pdTRUE) {
        ESP_LOGW(TAG, "Auto-park job dropped: mailbox busy");
    }
}
