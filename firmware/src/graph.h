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

// One edge byte: weight in bits 2..7, direction in bits 0..1
#define MAX_EDGE_WEIGHT 0x3F // 6-bit weight
#define EDGE_ENCODE(weight, dir) ((((uint8_t)(weight) & MAX_EDGE_WEIGHT) << 2) | ((dir) & 0x03))
#define EDGE_WEIGHT(edge) (((edge) >> 2) & MAX_EDGE_WEIGHT)
#define EDGE_DIR(edge) ((edge) & 0x03)

#define NO_EDGE 0x00 // encoded weight 0 means no edge

typedef uint16_t dist_t;
#define DIST_INF UINT16_MAX // sentinel for "unreachable" in Dijkstra

extern const char* STR_DIR[4];

// Node labels are single letters, so the graph is at most 26 x 26
#define GRAPH_NODE_COUNT_MAX 26
#define GRAPH_SIZE (GRAPH_NODE_COUNT_MAX * GRAPH_NODE_COUNT_MAX)

// clang-format off
// Fallback matrix for the dev builds that allow a dummy graph
extern const uint8_t dummy_graph[GRAPH_SIZE];
// clang-format on

esp_err_t graph_update(const uint8_t* data, uint32_t version);

// Get the active graph matrix (weight + direction), false if no graph set yet
bool graph_get(const uint8_t** edges);

// Installed matrix version, 0 = no ready graph yet (adam/srv/graph_version)
uint32_t graph_version(void);

// Drop the installed matrix back to "not ready" (version 0). Used when an
// admin reset fails to re-fetch the graph, so the local gates (graph_get,
// graph_ready) see the same state the robot reports on adam/srv/graph_version
// (spec 07.3.2).
void graph_invalidate(void);

// Matrix installed under version != 0: gate for accepting jobs (spec 07.2) and
// for the gateway to dispatch
bool graph_ready(void);

#endif // SRC_GRAPH_H
