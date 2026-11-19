#ifndef SRC_SENSORS_H
#define SRC_SENSORS_H

#include "esp_err.h"
#include <stdbool.h>
#include <stdint.h>

// BFD-1000 IR line follower; only the 3 centre channels are wired
#define SENSORS_PIN_LF_LEFT 39
#define SENSORS_PIN_LF_MIDDLE 34
#define SENSORS_PIN_LF_RIGHT 35
#define SENSORS_LINE_COUNT 3

// BFD-1000 digital line outputs are active-low: LOW when the sensor sees the
// black line, HIGH on the white background. Set to 0 for modules that output
// HIGH on black.
#define SENSORS_LINE_ACTIVE_LOW 1

// FC-51 IR hand sensor at the trash opening (LOW = hand/object detected).
// Used by the dwell loop to extend the timer while the user throws trash.
#define SENSORS_PIN_HAND_IR 13

// TCS3200 color sensor (node color marker detection, spec 02.3)
#define SENSORS_PIN_TCS_S0 19
#define SENSORS_PIN_TCS_S1 18
#define SENSORS_PIN_TCS_S2 5
#define SENSORS_PIN_TCS_S3 17
#define SENSORS_PIN_TCS_OUT 16

// HC-SR04 ultrasonic sensor (trash capacity inside the bin, spec 04)
#define SENSORS_PIN_US_TRIG 4
#define SENSORS_PIN_US_ECHO 15

// Calibrate these two distances on the real bin. The sensor is mounted at the
// fixed top of the bin and looks down at the trash surface:
// EMPTY_CM: distance to the bottom when the bin is empty
// FULL_CM: distance to the surface when the bin is considered full
#define SENSORS_TRASH_EMPTY_CM 30.0f
#define SENSORS_TRASH_FULL_CM 5.0f

// Level (0..100) at which the bin counts as full: move requests are rejected
// until the level drops below it again. Kept slightly below 100 so ultrasonic
// noise at the very edge does not flip the decision.
#define SENSORS_TRASH_FULL_PERCENT 95

// Buzzer indicator + battery divider ADC
#define SENSORS_PIN_BUZZER 2
#define SENSORS_PIN_BATTERY_ADC 36 // GPIO36 = ADC1_CH0; channel configured in sensors.c

// Initialize the sensor GPIOs, the battery ADC channel and the TCS3200 output
// scaling (mock builds start the sensor mock task instead)
// @return ESP_OK on success
esp_err_t sensors_init(void);

// Read the 3 BFD-1000 channels (left, middle, right): 1 = line detected
// @param line the array to write the sensor data
void sensors_read_line(int line[SENSORS_LINE_COUNT]);

// Detect a bright color marker under the robot (= node, spec 02.3).
// Measures the pulse width of every RGB channel and reports whether one
// of them is bright enough.
// @return false on a black line or on blank ground.
bool sensors_is_color_marker_present(void);

// @return ultrasonic distance in cm (timeout returns the maximum sensor range)
float sensors_get_ultrasonic_distance_cm(void);

// @return trash capacity 0..100% from the HC-SR04 distance (100 = full)
uint8_t sensors_get_trash_level_percent(void);

// @return true when the hand IR sensor at the trash opening sees a hand (LOW)
bool sensors_is_hand_detected(void);

// Battery level from the voltage divider ADC
// @return battery level 0..100
uint8_t sensors_get_battery_percent(void);

// Blocking buzzer beep
// @param ms beep duration in ms
void sensors_beep(int ms);

#endif // SRC_SENSORS_H
