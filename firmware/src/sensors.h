#ifndef SRC_SENSORS_H
#define SRC_SENSORS_H

#include "esp_err.h"
#include <stdbool.h>
#include <stdint.h>

// BFD-1000 5-channel IR line follower (S1 = leftmost, S5 = rightmost)
#define SENSORS_PIN_LF_S1 34
#define SENSORS_PIN_LF_S2 35
#define SENSORS_PIN_LF_S3 39
#define SENSORS_PIN_LF_S4 21
#define SENSORS_PIN_LF_S5 22
#define SENSORS_LINE_COUNT 5

/* BFD-1000 digital line outputs are active-low: LOW when the sensor sees the
 * black line, HIGH on the white background. Set to 0 for modules that output
 * HIGH on black. */
#define SENSORS_LINE_ACTIVE_LOW 1

// BFD-1000 "Near" obstacle output (LOW = obstacle)
#define SENSORS_PIN_NEAR 13

// TCS3200 color sensor (node color marker detection - spec 2.2)
#define SENSORS_PIN_TCS_S0 19
#define SENSORS_PIN_TCS_S1 18
#define SENSORS_PIN_TCS_S2 5
#define SENSORS_PIN_TCS_S3 17
#define SENSORS_PIN_TCS_OUT 16

// HC-SR04 ultrasonic sensor (user activity while dwelling - spec 4)
#define SENSORS_PIN_US_TRIG 4
#define SENSORS_PIN_US_ECHO 15

// Buzzer indicator + battery divider ADC
#define SENSORS_PIN_BUZZER 2
#define SENSORS_PIN_BATTERY_ADC 36 // GPIO36 = ADC1_CH0

esp_err_t sensors_init(void);

// Read the 5 BFD-1000 channels, left to right (S1..S5): 1 = line detected
void sensors_line_read(int line[SENSORS_LINE_COUNT]);

/* Detect a bright color marker under the robot (= junction node, spec 2.2).
 * Measures the pulse width of every RGB channel and reports whether one
 * of them is bright enough. false on a black line or on blank ground. */
bool sensors_color_marker_present(void);

// Ultrasonic distance in cm (timeout returns the maximum sensor range)
float sensors_ultrasonic_distance_cm(void);

// true when an obstacle is detected in front (BFD-1000 Near LOW)
bool sensors_obstacle_detected(void);

// Battery level 0-100% from the voltage divider ADC
uint8_t sensors_battery_percent(void);

// Blocking buzzer beep
void sensors_buzzer_beep(int ms);

#endif // SRC_SENSORS_H
