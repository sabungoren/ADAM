#ifndef SRC_EXECUTOR_H
#define SRC_EXECUTOR_H

#include "esp_err.h"
#include "protocol.h"
#include <stdbool.h>
#include <stddef.h>

// Create the telemetry publish mutex and start the Task Executor
// @return ESP_OK on success
esp_err_t executor_init(void);

// @return current robot status (published wire code, docs/06-protocol.md)
adam_status_t executor_status(void);

// Publish the retained status + [current][next] snapshot. Called from the MQTT
// connect handler before online = 1: at boot the snapshot is the neutral
// IDLE + [A][0] (spec 06.4 boot order), on reconnect it is the live state
// including the active edge during MOVING (spec 07.4).
void executor_publish_telemetry(void);

// Enter ERROR (LINE_LOST / NODE_TIMEOUT / NO_PATH): publish [req_id:2][code:1]
// + current_pos + status, halt the motor, close the lid, flush every queue
// (spec 07.2, 07.3).
// @param req_id the failed job, 0 for an error without a request
// @param reason error code to publish
void executor_set_error(uint16_t req_id, adam_error_t reason);

// Admin reset (spec 07.3.2): only raises a flag that the executor loop consumes
// while the robot is not serving (IDLE or ERROR); during MOVING/DWELL the flag
// is dropped without a response (the gateway rejected it with 409 first).
// The executor is the sole writer of the navigation state, so the MQTT task
// never mutates it directly.
void executor_request_reset(void);

#ifdef ADAM_SENSOR_MOCK
// Sensor-mock support (sensors.c): the edge currently being driven, so the
// mock can derive the simulated line from the real graph instead of a blind
// timer.
// @param from set to the node the edge starts from
// @param to set to the node the edge ends at
// @return true while the executor is MOVING
bool executor_active_edge(size_t* from, size_t* to);
#endif

#endif // SRC_EXECUTOR_H
