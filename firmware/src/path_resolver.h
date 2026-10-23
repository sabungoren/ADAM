#ifndef SRC_PATH_RESOLVER_H
#define SRC_PATH_RESOLVER_H

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Maximum node count per navigation path (size of the path queue item).
// The dummy graph and the server example use 19 nodes, 32 is the special case.
// A bigger graph is rejected by the Task Route Finder.
#define NAV_MAX_NODES 32

/* One path ready to execute: the node indexes A.., the length and the
 * recovery flag (result of an admin reset command, also accepted while the
 * status is ERROR). */
typedef struct {
    size_t path[NAV_MAX_NODES];
    size_t len;
    bool recovery;
} nav_path_t;

esp_err_t init_path_resolver(void);

// Non blocking queue fetching (Task Executor)
bool get_nav(nav_path_t* out);

// The Task Executor reports the real arrival on a node (the actual position
// used for the next Dijkstra calculation - spec 7.2)
void path_resolver_set_current(size_t node);

// Current confirmed node (0 = 'A')
size_t path_resolver_current(void);

// Flush the path queue (called by the Task Executor on LINE_LOST, spec 7.2)
void path_resolver_flush_paths(void);

#endif // SRC_PATH_RESOLVER_H
