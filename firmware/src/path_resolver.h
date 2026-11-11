#ifndef SRC_PATH_RESOLVER_H
#define SRC_PATH_RESOLVER_H

#include "esp_err.h"
#include "graph.h"
#include "protocol.h"
#include <stdbool.h>
#include <stddef.h>

// Max nodes per navigation path: a graph holds at most 26 labels 'A'..'Z'
// (spec 02.1); a bigger graph is rejected by the Route Finder.
#define NAV_MAX_NODES GRAPH_NODE_COUNT_MAX

// One path ready to execute: node indexes ('A' = 0), its length and the job
// behind it (an admin reset is also accepted while the status is ERROR)
typedef struct {
    adam_job_t job;
    size_t path[NAV_MAX_NODES];
    size_t len;
} nav_path_t;

// Start the Route Finder task (Task Route Finder)
// @return ESP_OK on success
esp_err_t path_resolver_init(void);

// Fetch the next queued path without blocking (Task Executor)
// @param out the fetched path, valid only when true is returned
// @return true when a path was fetched
bool path_resolver_get_nav(nav_path_t* out);

// The Task Executor reports the real arrival on a node (the actual position
// used for the next Dijkstra calculation, spec 07.2)
// @param node confirmed node index (0 = 'A')
void path_resolver_set_current(size_t node);

// @return current confirmed node (0 = 'A')
size_t path_resolver_current(void);

// Flush the path queue (called by the Task Executor on LINE_LOST, spec 07.2)
void path_resolver_flush_paths(void);

#endif // SRC_PATH_RESOLVER_H
