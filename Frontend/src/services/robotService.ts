// ==========================================================================
// SMART ADAM - ROBOT & GRAPH SERVICE (TypeScript)
// Core Dijkstra, 1-Byte Bit-Packing Matrix, and Simulation Engine
// ==========================================================================

import { GraphData, NodeItem, EdgeItem, RobotState, CallRequest, LogItem, CardinalDirection } from '../types';

// Default initial graph: 4 Nodes (Node A = Home Base, B = Stasiun 1, C = Stasiun 2, D = Stasiun 3)
export const DEFAULT_GRAPH: GraphData = {
  nodes: [
    { id: 'A', label: 'Home Base', x: 20, y: 24, isHome: true, colorHex: '#6b7280' },
    { id: 'B', label: 'Stasiun 1 (Alpha)', x: 50, y: 24, isHome: false, colorHex: '#10b981' },
    { id: 'C', label: 'Stasiun 2 (Beta)', x: 80, y: 24, isHome: false, colorHex: '#3b82f6' },
    { id: 'D', label: 'Stasiun 3 (Gamma)', x: 50, y: 66, isHome: false, colorHex: '#f59e0b' },
  ],
  edges: [
    { from: 'A', to: 'B', weight: 8, direction: 1 }, // East (01)
    { from: 'B', to: 'A', weight: 8, direction: 3 }, // West (11)
    { from: 'B', to: 'C', weight: 14, direction: 1 }, // East (01)
    { from: 'C', to: 'B', weight: 14, direction: 3 }, // West (11)
    { from: 'B', to: 'D', weight: 7, direction: 2 }, // South (10)
    { from: 'D', to: 'B', weight: 7, direction: 0 }, // North (00)
  ],
};

// Preset Templates
export const GRAPH_TEMPLATES: Record<string, GraphData> = {
  line: {
    nodes: [
      { id: 'A', label: 'Home Base', x: 20, y: 50, isHome: true, colorHex: '#6b7280' },
      { id: 'B', label: 'Stasiun 1', x: 50, y: 50, isHome: false, colorHex: '#10b981' },
      { id: 'C', label: 'Stasiun 2', x: 80, y: 50, isHome: false, colorHex: '#3b82f6' },
    ],
    edges: [
      { from: 'A', to: 'B', weight: 10, direction: 1 as CardinalDirection },
      { from: 'B', to: 'A', weight: 10, direction: 3 as CardinalDirection },
      { from: 'B', to: 'C', weight: 12, direction: 1 as CardinalDirection },
      { from: 'C', to: 'B', weight: 12, direction: 3 as CardinalDirection },
    ],
  },
  tJunction: DEFAULT_GRAPH,
  grid: {
    nodes: [
      { id: 'A', label: 'Home Base', x: 25, y: 30, isHome: true, colorHex: '#6b7280' },
      { id: 'B', label: 'Stasiun 1', x: 75, y: 30, isHome: false, colorHex: '#10b981' },
      { id: 'C', label: 'Stasiun 2', x: 75, y: 70, isHome: false, colorHex: '#3b82f6' },
      { id: 'D', label: 'Stasiun 3', x: 25, y: 70, isHome: false, colorHex: '#f59e0b' },
    ],
    edges: [
      { from: 'A', to: 'B', weight: 8, direction: 1 as CardinalDirection },
      { from: 'B', to: 'A', weight: 8, direction: 3 as CardinalDirection },
      { from: 'B', to: 'C', weight: 11, direction: 2 as CardinalDirection },
      { from: 'C', to: 'B', weight: 11, direction: 0 as CardinalDirection },
      { from: 'C', to: 'D', weight: 8, direction: 3 as CardinalDirection },
      { from: 'D', to: 'C', weight: 8, direction: 1 as CardinalDirection },
      { from: 'D', to: 'A', weight: 11, direction: 0 as CardinalDirection },
      { from: 'A', to: 'D', weight: 11, direction: 2 as CardinalDirection },
    ],
  },
};

// ==========================================================================
// Dijkstra Shortest Path Solver on Weighted Graph
// ==========================================================================
export function findShortestPath(
  startNode: string,
  endNode: string,
  graph: GraphData
): { path: string[]; distance: number } {
  if (startNode === endNode) {
    return { path: [startNode], distance: 0 };
  }

  const distances: { [key: string]: number } = {};
  const previous: { [key: string]: string | null } = {};
  const unvisited = new Set<string>();

  graph.nodes.forEach((n) => {
    distances[n.id] = Infinity;
    previous[n.id] = null;
    unvisited.add(n.id);
  });

  distances[startNode] = 0;

  while (unvisited.size > 0) {
    let current: string | null = null;
    let lowestDistance = Infinity;

    unvisited.forEach((nodeId) => {
      if (distances[nodeId] < lowestDistance) {
        lowestDistance = distances[nodeId];
        current = nodeId;
      }
    });

    if (current === null || current === endNode || lowestDistance === Infinity) {
      break;
    }

    unvisited.delete(current);

    // Find outgoing edges from current
    const outgoing = graph.edges.filter((e) => e.from === current);
    for (const edge of outgoing) {
      if (!unvisited.has(edge.to)) continue;

      const alt = distances[current] + edge.weight;
      if (alt < distances[edge.to]) {
        distances[edge.to] = alt;
        previous[edge.to] = current;
      }
    }
  }

  // Backtrack path
  const path: string[] = [];
  let curr: string | null = endNode;

  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }

  if (path[0] !== startNode) {
    return { path: [startNode], distance: 0 }; // No path
  }

  return { path, distance: distances[endNode] };
}

// ==========================================================================
// Encode Graph to 1D Byte Array (Matches spec.md bit-packing)
// Bit 7-6: Direction (2 bit), Bit 5-0: Weight (6 bit)
// ==========================================================================
export function encodeGraphMatrix(graph: GraphData): {
  matrix: number[][];
  hexString: string;
  byteCount: number;
} {
  const n = graph.nodes.length;
  const matrix: number[][] = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));

  const nodeMap = new Map<string, number>();
  graph.nodes.forEach((node, idx) => nodeMap.set(node.id, idx));

  graph.edges.forEach((edge) => {
    const u = nodeMap.get(edge.from);
    const v = nodeMap.get(edge.to);
    if (u !== undefined && v !== undefined) {
      // Byte = (Direction << 6) | (Weight & 0x3F)
      const byteVal = ((edge.direction & 0x03) << 6) | (edge.weight & 0x3f);
      matrix[u][v] = byteVal;
    }
  });

  const flatBytes: number[] = [];
  matrix.forEach((row) => row.forEach((b) => flatBytes.push(b)));

  const hexString = flatBytes
    .map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0'))
    .join(', ');

  return {
    matrix,
    hexString,
    byteCount: flatBytes.length,
  };
}

// ==========================================================================
// Export C++ Header Code for ESP32 Firmware
// ==========================================================================
export function generateCppHeader(graph: GraphData): string {
  const { hexString, byteCount } = encodeGraphMatrix(graph);
  const n = graph.nodes.length;
  const nodeNames = graph.nodes.map((n) => `'${n.id}'`).join(', ');

  return `// ==========================================================================
// Smart ADAM (Autonomous Dustbin And Management) - Graph Routing Matrix
// Auto-generated from Web Graph Editor for ESP32 FreeRTOS RAM Storage
// ==========================================================================

#ifndef ADAM_GRAPH_H
#define ADAM_GRAPH_H

#include <Arduino.h>

#define TOTAL_NODES ${n}
#define HOME_NODE 'A'

// Node Names Array
const char NODE_LABELS[TOTAL_NODES] = { ${nodeNames} };

// 1D Compressed Adjacency Matrix (Size: ${byteCount} bytes)
// Encoding: [Bit 7-6: Direction (N=00, E=01, S=10, W=11)] | [Bit 5-0: Weight (1-63)]
const uint8_t PROGMEM GRAPH_MATRIX[${byteCount}] = {
  ${hexString}
};

// Helper function to get edge byte from Node i to Node j
inline uint8_t getEdgeByte(uint8_t fromIdx, uint8_t toIdx) {
  if (fromIdx >= TOTAL_NODES || toIdx >= TOTAL_NODES) return 0;
  return pgm_read_byte(&GRAPH_MATRIX[fromIdx * TOTAL_NODES + toIdx]);
}

inline uint8_t getEdgeWeight(uint8_t byteVal) {
  return byteVal & 0x3F;
}

inline uint8_t getEdgeDirection(uint8_t byteVal) {
  return (byteVal >> 6) & 0x03;
}

#endif // ADAM_GRAPH_H
`;
}
