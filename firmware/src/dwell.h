#ifndef SRC_DWELL_H
#define SRC_DWELL_H

#include "esp_err.h"

// Dwell duration on the target node (spec 4: 15 - 30 seconds)
#define DWELL_TIME_MS 15000
// Trash lid servo angles
#define DWELL_SERVO_OPEN_DEG 90
#define DWELL_SERVO_CLOSE_DEG 0

esp_err_t dwell_init(void);

/* Dwell procedure on the target node (spec 4, blocking):
 * 1) open the lid with the servo, 2) run the dwell timer and reset it
 * whenever user activity is detected (ultrasonic delta > 3 cm),
 * 3) close the lid again.
 * Called from Task Executor while the robot is standing on the node. */
void dwell_run(void);

#endif // SRC_DWELL_H
