#ifndef SRC_WIFI_H
#define SRC_WIFI_H

#include "esp_err.h"
#include <stdbool.h>
#include <stdint.h>

// Start the STA (credentials come from NVS) and wait for the first connect
// attempt to settle
// @return ESP_OK when connected, ESP_FAIL after all retries failed,
//         ESP_ERR_INVALID_STATE when NVS holds no SSID
esp_err_t wifi_init_sta(void);

// Wait up to timeout_ms for the STA to obtain an IP
// @param timeout_ms wait timeout
// @return true if connected before the timeout, false otherwise
bool wifi_wait_connected(uint32_t timeout_ms);

#endif // SRC_WIFI_H
