#ifndef SRC_MOTOR_H
#define SRC_MOTOR_H

#include "esp_err.h"
#include <stdint.h>

// L298N motor driver pins (table 7 of the analysis)
#define MOTOR_PIN_ENA 14 // PWM speed left
#define MOTOR_PIN_IN1 27 // Left direction 1
#define MOTOR_PIN_IN2 26 // Left direction 2
#define MOTOR_PIN_ENB 32 // PWM speed right
#define MOTOR_PIN_IN3 25 // Right direction 1
#define MOTOR_PIN_IN4 33 // Right direction 2

#define MOTOR_PWM_FREQ_HZ 1000
#define MOTOR_PWM_RESOLUTION 8 // 8-bit (0 - 255)

// Maximum PWM duty per wheel (matches the 8-bit resolution)
#define MOTOR_SPEED_MAX 255

esp_err_t motor_init(void);

// Set the speed of each wheel, -255..255 (negative = backward)
void motor_set_speed(int left, int right);

// Stop immediately (all direction pins low + duty 0)
void motor_halt(void);

// Current heading (DIR_NORTH / DIR_EAST / DIR_SOUTH / DIR_WEST from graph.h)
uint8_t motor_heading(void);

/* Turn the robot on the spot until it faces the target heading (spec 3.2).
 * Blocking: the robot stays in place while turning. */
void motor_turn_to_heading(uint8_t target_dir);

#endif // SRC_MOTOR_H
