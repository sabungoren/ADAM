#ifndef SRC_GRAPH_H
#define SRC_GRAPH_H

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DIR_NORTH 0b00
#define DIR_EAST 0b01
#define DIR_SOUTH 0b10
#define DIR_WEST 0b11

#define EDGE_ENCODE(weight, dir) ((((uint8_t)(weight) & 0x3F) << 2) | ((dir) & 0x03))

#define EDGE_WEIGHT(edge) (((edge) >> 2) & 0x3F)
#define EDGE_DIR(edge) ((edge) & 0x03)

#define MAX_EDGE_WEIGHT 0x3F

#define NO_EDGE 0x00

typedef uint16_t dist_t;
#define DIST_INF UINT16_MAX

extern const char* STR_DIR[4];

// clang-format off
// dummy graph
#define DUMMY_GRAPH_COUNT 19
extern const uint8_t dummy_graph[DUMMY_GRAPH_COUNT][DUMMY_GRAPH_COUNT];
// clang-format on

// Install a new graph matrix (weight + direction), copies `count x count`
// bytes from `data` into RAM. No-op failures leave the current graph intact.
esp_err_t graph_update(const uint8_t* data, size_t count);

// Get the active graph matrix (weight + direction), false if no graph set yet
bool graph_get(const uint8_t** edges, size_t* count);

#endif // SRC_GRAPH_H
