#ifndef SRC_GRAPH_H
#define SRC_GRAPH_H

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Robot heading (spec 03.1); the values match the 2-bit direction field of
// an edge byte (EDGE_DIR)
typedef enum {
    DIR_NORTH = 0b00,
    DIR_EAST = 0b01,
    DIR_SOUTH = 0b10,
    DIR_WEST = 0b11,
} dir_t;

// One edge byte: weight in bits 2..7, direction in bits 0..1
#define MAX_EDGE_WEIGHT 0x3F // 6-bit weight
#define EDGE_ENCODE(weight, dir) ((((uint8_t)(weight) & MAX_EDGE_WEIGHT) << 2) | ((dir) & 0x03))
#define EDGE_WEIGHT(edge) (((edge) >> 2) & MAX_EDGE_WEIGHT)
#define EDGE_DIR(edge) ((edge) & 0x03)

#define NO_EDGE 0x00 // encoded weight 0 means no edge

typedef uint16_t dist_t;
// Sentinel for "unreachable" in Dijkstra. Edge weights are 6-bit (1..63) and
// a shortest route spans at most 25 edges, so the longest possible route
// weight is 25 * 63 = 1575 and can never reach this sentinel.
#define DIST_INF UINT16_MAX

extern const char* STR_DIR[4];

// Node labels are single letters, so the graph is at most 26 x 26
#define GRAPH_NODE_COUNT_MAX 26
#define GRAPH_SIZE (GRAPH_NODE_COUNT_MAX * GRAPH_NODE_COUNT_MAX)

// Fallback matrix for the dev builds that allow a dummy graph
extern const uint8_t dummy_graph[GRAPH_SIZE];

// Install a matrix downloaded from the server
// @param data GRAPH_SIZE edge bytes, row-major
// @param version server matrix version, 0 is the "not ready" sentinel
// @return ESP_OK, or ESP_ERR_INVALID_ARG on a NULL matrix or version 0
esp_err_t graph_update(const uint8_t* data, uint32_t version);

// Get the installed matrix (weight + direction)
// @param edges set to the matrix when one is installed
// @return true when a matrix is installed
bool graph_get(const uint8_t** edges);

// @return installed matrix version, 0 = no ready graph yet (adam/srv/graph_version)
uint32_t graph_version(void);

// Drop the installed matrix back to "not ready" (version 0). Used when an
// admin reset fails to re-fetch the graph, so the local gates (graph_get,
// graph_ready) see the same state the robot reports on adam/srv/graph_version
// (spec 07.3.2).
void graph_invalidate(void);

// Gate for accepting jobs (spec 07.2) and for the gateway to dispatch
// @return true when a matrix is installed under version != 0
bool graph_ready(void);

#endif // SRC_GRAPH_H
