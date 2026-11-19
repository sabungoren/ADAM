package graph

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
)

const (
	MatrixSize = 26
	TotalBytes = MatrixSize * MatrixSize // 676 bytes
)

// Direction constants
const (
	DirNorth = 0 // 00
	DirEast  = 1 // 01
	DirSouth = 2 // 10
	DirWest  = 3 // 11
)

type Edge struct {
	From      string `json:"from"`
	To        string `json:"to"`
	Weight    int    `json:"weight"`
	Direction string `json:"direction"` // "N", "E", "S", "W"
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type GraphData struct {
	Version   int                 `json:"version,omitempty"`
	Nodes     []string            `json:"nodes"`
	Edges     []Edge              `json:"edges"`
	Positions map[string]Position `json:"positions,omitempty"`
}

func DirectionToString(dir int) string {
	switch dir {
	case DirNorth:
		return "N"
	case DirEast:
		return "E"
	case DirSouth:
		return "S"
	case DirWest:
		return "W"
	default:
		return "N"
	}
}

func StringToDirection(s string) (int, error) {
	switch strings.ToUpper(s) {
	case "N", "NORTH", "UTARA":
		return DirNorth, nil
	case "E", "EAST", "TIMUR":
		return DirEast, nil
	case "S", "SOUTH", "SELATAN":
		return DirSouth, nil
	case "W", "WEST", "BARAT":
		return DirWest, nil
	default:
		return 0, fmt.Errorf("arah tidak valid: %s (gunakan N, E, S, atau W)", s)
	}
}

func OppositeDirection(dir int) int {
	switch dir {
	case DirNorth:
		return DirSouth
	case DirSouth:
		return DirNorth
	case DirEast:
		return DirWest
	case DirWest:
		return DirEast
	default:
		return DirNorth
	}
}

// EncodeByte packs weight (bits 2..7) and direction (bits 0..1)
func EncodeByte(weight, direction int) byte {
	if weight <= 0 {
		return 0
	}
	w := byte(weight & 0x3F)      // 6 bits
	d := byte(direction & 0x03)   // 2 bits
	return (w << 2) | d
}

// DecodeByte unpacks weight (bits 2..7) and direction (bits 0..1)
func DecodeByte(b byte) (weight int, direction int) {
	if b == 0 {
		return 0, 0
	}
	weight = int((b >> 2) & 0x3F)
	direction = int(b & 0x03)
	return weight, direction
}

// BuildMatrix converts GraphData into a 676-byte fixed matrix
func BuildMatrix(g *GraphData) ([]byte, error) {
	matrix := make([]byte, TotalBytes)

	nodeMap := make(map[string]bool)
	for _, n := range g.Nodes {
		nodeMap[n] = true
	}

	for _, e := range g.Edges {
		if !nodeMap[e.From] || !nodeMap[e.To] {
			return nil, fmt.Errorf("edge merujuk node yang tidak terdaftar: %s -> %s", e.From, e.To)
		}
		fromIdx := int(e.From[0] - 'A')
		toIdx := int(e.To[0] - 'A')
		if fromIdx < 0 || fromIdx >= MatrixSize || toIdx < 0 || toIdx >= MatrixSize {
			return nil, fmt.Errorf("index node di luar batas: %s, %s", e.From, e.To)
		}

		dir, err := StringToDirection(e.Direction)
		if err != nil {
			return nil, err
		}

		// Forward edge
		fwdByte := EncodeByte(e.Weight, dir)
		matrix[fromIdx*MatrixSize+toIdx] = fwdByte

		// Reverse edge (anti-symmetric opposite direction, same weight)
		revDir := OppositeDirection(dir)
		revByte := EncodeByte(e.Weight, revDir)
		matrix[toIdx*MatrixSize+fromIdx] = revByte
	}

	return matrix, nil
}

// ValidateGraph performs all checks from docs/02-graph.md and docs/06-protocol.md
func ValidateGraph(g *GraphData) error {
	if len(g.Nodes) == 0 {
		return errors.New("nodes tidak boleh kosong")
	}
	if len(g.Nodes) > MatrixSize {
		return fmt.Errorf("jumlah node maksimal adalah %d", MatrixSize)
	}

	hasA := false
	nodeSet := make(map[string]bool)
	for _, n := range g.Nodes {
		if len(n) != 1 {
			return fmt.Errorf("label node harus 1 huruf kapital: '%s'", n)
		}
		ch := n[0]
		if ch < 'A' || ch > 'Z' {
			return fmt.Errorf("label node harus antara 'A'-'Z': '%s'", n)
		}
		if nodeSet[n] {
			return fmt.Errorf("duplikasi label node: '%s'", n)
		}
		nodeSet[n] = true
		if n == "A" {
			hasA = true
		}
	}

	if !hasA {
		return errors.New("node 'A' wajib ada sebagai Home Node")
	}

	// Single node A with no edges is valid
	if len(g.Nodes) == 1 && g.Nodes[0] == "A" && len(g.Edges) == 0 {
		return nil
	}

	// Validate edges
	// Check self-loop, duplicate pairs, weight 1..63, valid directions, max 1 edge per direction per node
	pairMap := make(map[string]bool)
	nodeDirs := make(map[string]map[int]bool)
	for _, n := range g.Nodes {
		nodeDirs[n] = make(map[int]bool)
	}

	adj := make(map[string][]string)

	for _, e := range g.Edges {
		if !nodeSet[e.From] {
			return fmt.Errorf("edge 'from' node '%s' tidak terdaftar dalam nodes", e.From)
		}
		if !nodeSet[e.To] {
			return fmt.Errorf("edge 'to' node '%s' tidak terdaftar dalam nodes", e.To)
		}
		if e.From == e.To {
			return fmt.Errorf("self-loop tidak diizinkan pada node '%s'", e.From)
		}

		// Canonical pair key to check duplicates
		n1, n2 := e.From, e.To
		if n1 > n2 {
			n1, n2 = n2, n1
		}
		pairKey := n1 + "-" + n2
		if pairMap[pairKey] {
			return fmt.Errorf("pasangan edge duplikat antara '%s' dan '%s'", e.From, e.To)
		}
		pairMap[pairKey] = true

		if e.Weight < 1 || e.Weight > 63 {
			return fmt.Errorf("bobot edge (%d) harus berada di rentang 1..63", e.Weight)
		}

		dir, err := StringToDirection(e.Direction)
		if err != nil {
			return err
		}

		// Check max 1 edge per direction for From
		if nodeDirs[e.From][dir] {
			return fmt.Errorf("node '%s' sudah memiliki edge di arah %s", e.From, DirectionToString(dir))
		}
		nodeDirs[e.From][dir] = true

		// Check max 1 edge per direction for To (reverse direction)
		revDir := OppositeDirection(dir)
		if nodeDirs[e.To][revDir] {
			return fmt.Errorf("node '%s' sudah memiliki edge di arah %s (dari koneksi ke '%s')", e.To, DirectionToString(revDir), e.From)
		}
		nodeDirs[e.To][revDir] = true

		adj[e.From] = append(adj[e.From], e.To)
		adj[e.To] = append(adj[e.To], e.From)
	}

	// Verify connectivity from Node "A" using BFS
	visited := make(map[string]bool)
	queue := []string{"A"}
	visited["A"] = true

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		for _, neighbor := range adj[curr] {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}

	for _, n := range g.Nodes {
		if !visited[n] {
			return fmt.Errorf("graf tidak connected: node '%s' tidak dapat dicapai dari Home 'A'", n)
		}
	}

	return nil
}

// Normalize sorts nodes alphabetically
func Normalize(g *GraphData) {
	sort.Strings(g.Nodes)
}

func GraphToJSON(g *GraphData) (string, error) {
	bytes, err := json.Marshal(g)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func JSONToGraph(data string) (*GraphData, error) {
	var g GraphData
	err := json.Unmarshal([]byte(data), &g)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// FindShortestPath calculates the optimal route from startNode to endNode.
// It prioritizes the most direct path (minimum hops / intersection turns)
// followed by minimum cumulative edge weight.
func FindShortestPath(g *GraphData, startNode, endNode string) []string {
	if startNode == "" || endNode == "" {
		return nil
	}
	if startNode == endNode {
		return []string{startNode}
	}
	if g == nil || len(g.Edges) == 0 {
		return []string{startNode, endNode}
	}

	type neighbor struct {
		node   string
		weight int
	}
	adj := make(map[string][]neighbor)
	for _, e := range g.Edges {
		adj[e.From] = append(adj[e.From], neighbor{node: e.To, weight: e.Weight})
		adj[e.To] = append(adj[e.To], neighbor{node: e.From, weight: e.Weight})
	}

	type searchState struct {
		node   string
		hops   int
		weight int
		path   []string
	}

	bestCost := make(map[string]int)
	for _, n := range g.Nodes {
		bestCost[n] = 9999999
	}
	bestCost[startNode] = 0

	queue := []searchState{{node: startNode, hops: 0, weight: 0, path: []string{startNode}}}
	var shortestPath []string
	minTotalCost := 9999999

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		if curr.node == endNode {
			currCost := curr.hops*1000 + curr.weight
			if currCost < minTotalCost {
				minTotalCost = currCost
				shortestPath = curr.path
			}
			continue
		}

		for _, nb := range adj[curr.node] {
			nextHops := curr.hops + 1
			nextWeight := curr.weight + nb.weight
			nextCost := nextHops*1000 + nextWeight

			if nextCost < bestCost[nb.node] {
				bestCost[nb.node] = nextCost
				newPath := make([]string, len(curr.path)+1)
				copy(newPath, curr.path)
				newPath[len(curr.path)] = nb.node

				queue = append(queue, searchState{
					node:   nb.node,
					hops:   nextHops,
					weight: nextWeight,
					path:   newPath,
				})
			}
		}
	}

	if len(shortestPath) == 0 {
		return []string{startNode, endNode}
	}
	return shortestPath
}


