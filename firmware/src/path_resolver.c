#include "path_resolver.h"

#include "esp_err.h"
#include "esp_log.h"
#include "executor.h"
#include "freertos/FreeRTOS.h"
#include "freertos/idf_additions.h"
#include "freertos/projdefs.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "graph.h"
#include "mqtt.h"
#include "portmacro.h"
#include "protocol.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char* TAG = "path_resolver";

static QueueHandle_t s_path_queue;
static volatile size_t s_current_node = 0; // Node 'A' = 0, boot facing north (spec 03.1)

// Pick the unvisited node with the smallest known distance (Dijkstra helper)
// @return the node index, or -1 when every node is visited or unreachable
static int find_nearest_unvisited_node(const dist_t dist[restrict GRAPH_NODE_COUNT_MAX],
                                       const bool visited[restrict GRAPH_NODE_COUNT_MAX]) {
    dist_t best_distance = DIST_INF;
    int best_node = -1;

    for (int node = 0; node < GRAPH_NODE_COUNT_MAX; node++) {
        if (!visited[node] && dist[node] < best_distance) {
            best_distance = dist[node];
            best_node = node;
        }
    }

    return best_node;
}

// Find the shortest route from source to target (Dijkstra): settle the
// nearest unvisited node, relax its edges until the target settles, then
// walk the predecessor chain back from the target and reverse it into the
// ordered route. The route is [source] alone when source == target.
// @param graph edge matrix, row-major
// @param source start node index
// @param target destination node index
// @param out ordered route, source -> ... -> target
// @return node count of the route, 0 when target is unreachable
static int find_shortest_route(const uint8_t graph[restrict GRAPH_SIZE], size_t source, size_t target,
                               size_t out[restrict GRAPH_NODE_COUNT_MAX]) {
    if (source >= GRAPH_NODE_COUNT_MAX || target >= GRAPH_NODE_COUNT_MAX) {
        return 0;
    }

    dist_t dist[GRAPH_NODE_COUNT_MAX];
    bool visited[GRAPH_NODE_COUNT_MAX] = {0};
    size_t prev[GRAPH_NODE_COUNT_MAX];

    for (size_t node = 0; node < GRAPH_NODE_COUNT_MAX; node++) {
        dist[node] = DIST_INF;
        prev[node] = (size_t)-1;
    }

    // The source has distance 0 to itself
    dist[source] = 0;

    // Each pass settles one node, so the loop ends on its own once every
    // reachable node is settled or the target is reached.
    for (;;) {
        int current = find_nearest_unvisited_node(dist, visited);

        if (current == -1) {
            break; // every reachable node is already settled
        }

        visited[current] = true;

        if ((size_t)current == target) {
            break;
        }

        for (size_t neighbor = 0; neighbor < GRAPH_NODE_COUNT_MAX; neighbor++) {
            uint8_t weight = EDGE_WEIGHT(graph[((size_t)current * GRAPH_NODE_COUNT_MAX) + neighbor]);

            if (weight == NO_EDGE || visited[neighbor]) {
                continue;
            }

            dist_t new_distance = dist[current] + weight;

            if (new_distance < dist[neighbor]) {
                dist[neighbor] = new_distance;
                prev[neighbor] = (size_t)current;
            }
        }
    }

    if (dist[target] == DIST_INF) {
        return 0; // target is unreachable from source
    }

    int node_count = 0;

    while (target != (size_t)-1 && node_count < GRAPH_NODE_COUNT_MAX) {
        out[node_count++] = target;
        target = prev[target];
    }

    for (int i = 0; i < node_count / 2; i++) {
        size_t tmp = out[i];
        out[i] = out[node_count - 1 - i];
        out[node_count - 1 - i] = tmp;
    }

    return node_count;
}

static inline char node_to_char(size_t node) {
    return (char)(node + 'A');
}

static inline size_t char_to_node(char c) {
    return (size_t)(c - 'A');
}

static void log_path(const size_t* path, int node_count, const char* label) {
    // Worst case "A -> B -> ..." for 26 nodes = 126 chars + NUL
    char route[(GRAPH_NODE_COUNT_MAX * 5) + 1];
    int written = 0;
    for (int i = 0; i < node_count && written < (int)sizeof(route) - 5; i++) {
        written += snprintf(route + written, sizeof(route) - written, i ? " -> %c" : "%c", node_to_char(path[i]));
    }
    ESP_LOGI(TAG, "Path '%s': %s", label, route);
}

// Wrap the Dijkstra result into a nav_path_t and queue it for the Task Executor
static void enqueue_nav_path(size_t* path, int node_count, const adam_job_t* job) {
    nav_path_t nav = {
        .len = (size_t)node_count,
    };
    memcpy(nav.path, path, (size_t)node_count * sizeof(size_t));
    memcpy(&nav.job, job, sizeof(adam_job_t));

    // Queue full means queue flooding, drop the oldest item
    if (xQueueSend(s_path_queue, &nav, (TickType_t)0) != pdTRUE) {
        nav_path_t stale;
        xQueueReceive(s_path_queue, &stale, 0);
        xQueueSend(s_path_queue, &nav, 0);
        ESP_LOGW(TAG, "Path queue full, dropping the oldest path");
    }
}

static void path_resolver_task(void* pvParameters) {
    for (;;) {
        const uint8_t* edges = NULL;
        if (!graph_get(&edges)) {
            // No matrix installed yet (boot or fetch failed), retry later
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        // Wait for a command from the server (move or internal job). False
        // only while the MQTT mailbox does not exist yet (startup ordering).
        adam_job_t job;
        if (!mqtt_get_job_blocked(&job)) {
            vTaskDelay(pdMS_TO_TICKS(100));
            continue;
        }

        size_t dest_node;
        if (job.internal) {
            // Auto-park (spec 07.6): always Home 'A', no dwell there - the
            // executor settles straight back to IDLE when the path ends.
            dest_node = 0;
        } else {
            size_t target = char_to_node(job.req.node);
            if (target >= GRAPH_NODE_COUNT_MAX) {
                ESP_LOGW(TAG, "Target node '%c' is outside the graph", job.req.node);
                continue;
            }
            dest_node = target;
        }

        size_t route[GRAPH_NODE_COUNT_MAX];
        int node_count = find_shortest_route(edges, s_current_node, dest_node, route);

        if (node_count == 0) {
            // No route available: report the error and wait (spec 06.2)
            ESP_LOGE(TAG, "No route from %c to %c", node_to_char(s_current_node), node_to_char(dest_node));
            executor_set_error(job.req.id, ADAM_ERR_NO_PATH);
            continue;
        }

        // Log label: the internal auto-park ride always targets Home 'A'.
        // source == target needs no special case: the route is a single node
        // and the Task Executor dwells on it right away (spec 04).
        char label[2] = {job.internal ? 'A' : job.req.node, '\0'};
        enqueue_nav_path(route, node_count, &job);
        log_path(route, node_count, label);

        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

esp_err_t path_resolver_init(void) {
    s_path_queue = xQueueCreate(1, sizeof(nav_path_t));
    if (s_path_queue == NULL) {
        return ESP_ERR_NO_MEM;
    }

    // 3 KB stack, priority 2, pinned to core 0
    if (xTaskCreatePinnedToCore(path_resolver_task, "Task Route Finder", 3072, NULL, 2, NULL, 0) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    return ESP_OK;
}

bool path_resolver_get_nav(nav_path_t* out) {
    if (s_path_queue == NULL) {
        return false;
    }
    return xQueueReceive(s_path_queue, out, 0) == pdTRUE;
}

void path_resolver_set_current(size_t node) {
    s_current_node = node;
}

size_t path_resolver_current(void) {
    return s_current_node;
}

void path_resolver_flush_paths(void) {
    if (s_path_queue != NULL) {
        xQueueReset(s_path_queue);
    }
}
