#include "motor.h"

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/idf_additions.h"
#include "freertos/projdefs.h"
#include <stddef.h>

static const char* TAG = "motor";

// Internal robot heading (spec 3.1): always north at boot and changed
// only through motor_turn_to_heading()
static volatile uint8_t s_heading = DIR_NORTH;

/* Turn calibration: speed and duration of the 90 degree turn, the 180
 * degree turn and the settle time before and after the maneuver. */
#define TURN_SPEED_90 180
#define TURN_SPEED_UTURN 185
#define TURN_TIME_90_MS 420
#define TURN_TIME_UTURN_MS 850
#define TURN_PRE_SETTLE_MS 150
#define TURN_POST_SETTLE_MS 150

// Motor LEDC channels (one shared timer, 1 kHz, 8-bit)
#define MOTOR_LEDC_TIMER LEDC_TIMER_0
#define MOTOR_LEDC_CH_LEFT LEDC_CHANNEL_0
#define MOTOR_LEDC_CH_RIGHT LEDC_CHANNEL_1

// Write a logic level on a motor output pin
static void pin_write(int pin, int level) {
    gpio_set_level((gpio_num_t)pin, level);
}

// Drive a single wheel: set the direction pins from the speed sign, then the PWM duty
static void motor_drive(int in1, int in2, ledc_channel_t channel, int speed) {
    if (speed >= 0) {
        pin_write(in1, 1);
        pin_write(in2, 0);
    } else {
        pin_write(in1, 0);
        pin_write(in2, 1);
        speed = -speed;
    }

    ledc_set_duty(LEDC_LOW_SPEED_MODE, channel, (uint32_t)speed);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, channel);
}

esp_err_t motor_init(void) {
    // L298N direction pins
    const gpio_config_t dir_cfg = {
        .pin_bit_mask =
            (1ULL << MOTOR_PIN_IN1) | (1ULL << MOTOR_PIN_IN2) | (1ULL << MOTOR_PIN_IN3) | (1ULL << MOTOR_PIN_IN4),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&dir_cfg), TAG, "motor gpio failed");

    // ENA/ENB PWM channels from a single timer (1kHz, 8-bit)
    const ledc_timer_config_t timer = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .timer_num = MOTOR_LEDC_TIMER,
        .duty_resolution = MOTOR_PWM_RESOLUTION,
        .freq_hz = MOTOR_PWM_FREQ_HZ,
        .clk_cfg = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&timer), TAG, "ledc timer failed");

    const ledc_channel_config_t channels[] = {
        {
            .gpio_num = MOTOR_PIN_ENA,
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .channel = MOTOR_LEDC_CH_LEFT,
            .intr_type = LEDC_INTR_DISABLE,
            .timer_sel = MOTOR_LEDC_TIMER,
            .duty = 0,
            .hpoint = 0,
        },
        {
            .gpio_num = MOTOR_PIN_ENB,
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .channel = MOTOR_LEDC_CH_RIGHT,
            .intr_type = LEDC_INTR_DISABLE,
            .timer_sel = MOTOR_LEDC_TIMER,
            .duty = 0,
            .hpoint = 0,
        },
    };
    for (size_t i = 0; i < 2; i++) {
        ESP_RETURN_ON_ERROR(ledc_channel_config(&channels[i]), TAG, "ledc channel %d failed", (int)i);
    }

    motor_halt();
    s_heading = DIR_NORTH;

    ESP_LOGI(TAG, "L298N ready (PWM %d Hz, %d-bit), heading %s", MOTOR_PWM_FREQ_HZ, MOTOR_PWM_RESOLUTION,
             STR_DIR[s_heading]);
    return ESP_OK;
}

void motor_set_speed(int left, int right) {
    if (left > MOTOR_SPEED_MAX) {
        left = MOTOR_SPEED_MAX;
    }
    if (left < -MOTOR_SPEED_MAX) {
        left = -MOTOR_SPEED_MAX;
    }
    if (right > MOTOR_SPEED_MAX) {
        right = MOTOR_SPEED_MAX;
    }
    if (right < -MOTOR_SPEED_MAX) {
        right = -MOTOR_SPEED_MAX;
    }

    motor_drive(MOTOR_PIN_IN1, MOTOR_PIN_IN2, MOTOR_LEDC_CH_LEFT, left);
    motor_drive(MOTOR_PIN_IN3, MOTOR_PIN_IN4, MOTOR_LEDC_CH_RIGHT, right);
}

void motor_halt(void) {
    pin_write(MOTOR_PIN_IN1, 0);
    pin_write(MOTOR_PIN_IN2, 0);
    pin_write(MOTOR_PIN_IN3, 0);
    pin_write(MOTOR_PIN_IN4, 0);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_LEDC_CH_LEFT, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_LEDC_CH_LEFT);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, MOTOR_LEDC_CH_RIGHT, 0);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, MOTOR_LEDC_CH_RIGHT);
}

uint8_t motor_heading(void) {
    return s_heading;
}

void motor_turn_to_heading(uint8_t target_dir) {
    uint8_t target = (uint8_t)(target_dir & 0x03);

    // Delta = (Target - Current) mod 4 (spec 3.2)
    int delta = (target - s_heading + 4) % 4;
    if (delta == 0) {
        return; // keep going straight
    }

    motor_halt();
    vTaskDelay(pdMS_TO_TICKS(TURN_PRE_SETTLE_MS));

    if (delta == 1) {
        // Turn right 90 degrees (new heading = (cur+1) mod 4)
        motor_set_speed(TURN_SPEED_90, -TURN_SPEED_90);
        vTaskDelay(pdMS_TO_TICKS(TURN_TIME_90_MS));
    } else if (delta == 2) {
        // Turn around 180 degrees (U-Turn)
        motor_set_speed(TURN_SPEED_UTURN, -TURN_SPEED_UTURN);
        vTaskDelay(pdMS_TO_TICKS(TURN_TIME_UTURN_MS));
    } else {
        // Turn left 90 degrees (delta 3)
        motor_set_speed(-TURN_SPEED_90, TURN_SPEED_90);
        vTaskDelay(pdMS_TO_TICKS(TURN_TIME_90_MS));
    }

    motor_halt();
    vTaskDelay(pdMS_TO_TICKS(TURN_POST_SETTLE_MS));
    s_heading = target;

    ESP_LOGI(TAG, "Turned to %s (delta %d)", STR_DIR[s_heading], delta);
}
