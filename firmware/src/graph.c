#include "graph.h"
#include "esp_err.h"
#include <stdint.h>
#include <string.h>

const char* STR_DIR[4] = {"north", "east", "south", "west"};

static uint8_t s_matrix[GRAPH_SIZE];
static uint32_t s_version; // 0 = graph not ready, see graph_version()

esp_err_t graph_update(const uint8_t* data, uint32_t version) {
    // Version 0 is the "not ready" sentinel and must never be installed
    if (data == NULL || version == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    memcpy(s_matrix, data, GRAPH_SIZE);
    s_version = version;

    return ESP_OK;
}

bool graph_get(const uint8_t** edges) {
    // s_matrix is a static array, so "installed" is tracked by s_version:
    // 0 means no graph_update() succeeded yet (boot, or every fetch failed).
    // Callers rely on this gate (path_resolver waits for a real matrix).
    if (s_version == 0) {
        return false;
    }
    *edges = s_matrix;
    return true;
}

uint32_t graph_version(void) {
    return s_version;
}

void graph_invalidate(void) {
    s_version = 0;
}

bool graph_ready(void) {
    const uint8_t* edges;
    return graph_version() != 0 && graph_get(&edges);
}

// clang-format off
const uint8_t dummy_graph[GRAPH_SIZE] = {
// A                              B                              C                              D                              E                              F                              G                              H                              I                              J                              K                              L                              M                              N                              O                              P                              Q                              R                              S                              T  U  V  W  X  Y  Z
     0, EDGE_ENCODE(3, DIR_EAST), 0, 0, EDGE_ENCODE(9, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // A
     EDGE_ENCODE(3, DIR_WEST), 0, EDGE_ENCODE(30, DIR_EAST), 0, 0, EDGE_ENCODE(1, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // B
     0, EDGE_ENCODE(30, DIR_WEST), 0, EDGE_ENCODE(6, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // C
     0, 0, EDGE_ENCODE(6, DIR_WEST), 0, 0, 0, 0, EDGE_ENCODE(2, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // D

     EDGE_ENCODE(9, DIR_NORTH), 0, 0, 0, 0, EDGE_ENCODE(26, DIR_EAST), 0, 0, EDGE_ENCODE(5, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // E
     0, EDGE_ENCODE(1, DIR_NORTH), 0, 0, EDGE_ENCODE(26, DIR_WEST), 0, EDGE_ENCODE(47, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // F
     0, 0, 0, 0, 0, EDGE_ENCODE(47, DIR_WEST), 0, EDGE_ENCODE(15, DIR_EAST), 0, 0, EDGE_ENCODE(14, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // G
     0, 0, 0, EDGE_ENCODE(2, DIR_NORTH), 0, 0, EDGE_ENCODE(15, DIR_WEST), 0, 0, 0, 0, EDGE_ENCODE(19, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // H

     0, 0, 0, 0, EDGE_ENCODE(5, DIR_NORTH), 0, 0, 0, 0, EDGE_ENCODE(2, DIR_EAST), 0, 0, EDGE_ENCODE(21, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // I
     0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(2, DIR_WEST), 0, EDGE_ENCODE(8, DIR_EAST), 0, 0, EDGE_ENCODE(33, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // J
     0, 0, 0, 0, 0, 0, EDGE_ENCODE(14, DIR_NORTH), 0, 0, EDGE_ENCODE(8, DIR_WEST), 0, EDGE_ENCODE(4, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // K
     0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(19, DIR_NORTH), 0, 0, EDGE_ENCODE(4, DIR_WEST), 0, 0, 0, 0, EDGE_ENCODE(12, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // L

     0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(21, DIR_NORTH), 0, 0, 0, 0, EDGE_ENCODE(7, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // M
     0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(33, DIR_NORTH), 0, 0, EDGE_ENCODE(7, DIR_WEST), 0, EDGE_ENCODE(40, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // N
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(40, DIR_WEST), 0, EDGE_ENCODE(6, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // O
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(12, DIR_NORTH), 0, 0, EDGE_ENCODE(6, DIR_WEST), 0, EDGE_ENCODE(10, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, 0, // P
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(10, DIR_WEST), 0, EDGE_ENCODE(2, DIR_EAST), 0, 0, 0, 0, 0, 0, 0, 0, // Q
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(2, DIR_WEST), 0, EDGE_ENCODE(13, DIR_NORTH), 0, 0, 0, 0, 0, 0, 0, // R
     0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, EDGE_ENCODE(13, DIR_SOUTH), 0, 0, 0, 0, 0, 0, 0, 0, // S
};
// clang-format on
