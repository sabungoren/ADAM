package graph

import (
	"testing"
)

func TestGraphValidationAndMatrix(t *testing.T) {
	// 1. Test Valid Graph
	g := &GraphData{
		Nodes: []string{"A", "B", "C"},
		Edges: []Edge{
			{From: "A", To: "B", Weight: 12, Direction: "N"},
			{From: "B", To: "C", Weight: 5, Direction: "E"},
		},
	}

	if err := ValidateGraph(g); err != nil {
		t.Fatalf("Graf valid gagal divalidasi: %v", err)
	}

	matrix, err := BuildMatrix(g)
	if err != nil {
		t.Fatalf("Gagal membangun matriks: %v", err)
	}
	if len(matrix) != TotalBytes {
		t.Fatalf("Panjang matriks harus %d, didapat %d", TotalBytes, len(matrix))
	}

	// Check A -> B
	// A = 0, B = 1
	aToB := matrix[0*MatrixSize+1]
	wAB, dAB := DecodeByte(aToB)
	if wAB != 12 || dAB != DirNorth {
		t.Fatalf("A->B salah: weight=%d (ekspektasi 12), dir=%d (ekspektasi North 0)", wAB, dAB)
	}

	// Check B -> A (anti-symmetric: South, weight 12)
	bToA := matrix[1*MatrixSize+0]
	wBA, dBA := DecodeByte(bToA)
	if wBA != 12 || dBA != DirSouth {
		t.Fatalf("B->A salah: weight=%d (ekspektasi 12), dir=%d (ekspektasi South 2)", wBA, dBA)
	}

	// 2. Test Invalid: Missing Node A
	invalidMissingA := &GraphData{
		Nodes: []string{"B", "C"},
		Edges: []Edge{
			{From: "B", To: "C", Weight: 5, Direction: "E"},
		},
	}
	if err := ValidateGraph(invalidMissingA); err == nil {
		t.Fatalf("Ekspektasi error karena Node A wajib ada")
	}

	// 3. Test Invalid: Two edges in same direction from node A
	invalidSameDir := &GraphData{
		Nodes: []string{"A", "B", "C"},
		Edges: []Edge{
			{From: "A", To: "B", Weight: 5, Direction: "N"},
			{From: "A", To: "C", Weight: 10, Direction: "N"},
		},
	}
	if err := ValidateGraph(invalidSameDir); err == nil {
		t.Fatalf("Ekspektasi error karena ada 2 edge searah (North) dari Node A")
	}

	// 4. Test Invalid: Disconnected node
	invalidDisconnected := &GraphData{
		Nodes: []string{"A", "B", "C", "D"},
		Edges: []Edge{
			{From: "A", To: "B", Weight: 5, Direction: "N"},
			{From: "B", To: "C", Weight: 10, Direction: "E"},
			// D is disconnected
		},
	}
	if err := ValidateGraph(invalidDisconnected); err == nil {
		t.Fatalf("Ekspektasi error karena Node D terputus dari Home A")
	}
}

func TestFindShortestPathKToB(t *testing.T) {
	g := &GraphData{
		Nodes: []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S"},
		Edges: []Edge{
			{From: "A", To: "B", Weight: 3, Direction: "E"},
			{From: "B", To: "C", Weight: 30, Direction: "E"},
			{From: "C", To: "D", Weight: 6, Direction: "E"},
			{From: "A", To: "E", Weight: 9, Direction: "S"},
			{From: "B", To: "F", Weight: 1, Direction: "S"},
			{From: "D", To: "H", Weight: 2, Direction: "S"},
			{From: "E", To: "F", Weight: 26, Direction: "E"},
			{From: "F", To: "G", Weight: 47, Direction: "E"},
			{From: "G", To: "H", Weight: 15, Direction: "E"},
			{From: "E", To: "I", Weight: 5, Direction: "S"},
			{From: "G", To: "K", Weight: 14, Direction: "S"},
			{From: "H", To: "L", Weight: 19, Direction: "S"},
			{From: "I", To: "J", Weight: 2, Direction: "E"},
			{From: "J", To: "K", Weight: 8, Direction: "E"},
			{From: "K", To: "L", Weight: 4, Direction: "E"},
			{From: "I", To: "M", Weight: 21, Direction: "S"},
			{From: "J", To: "N", Weight: 33, Direction: "S"},
			{From: "L", To: "P", Weight: 12, Direction: "S"},
			{From: "M", To: "N", Weight: 7, Direction: "E"},
			{From: "N", To: "O", Weight: 40, Direction: "E"},
			{From: "O", To: "P", Weight: 6, Direction: "E"},
			{From: "P", To: "Q", Weight: 10, Direction: "E"},
			{From: "Q", To: "R", Weight: 2, Direction: "E"},
			{From: "R", To: "S", Weight: 13, Direction: "N"},
		},
	}

	path := FindShortestPath(g, "K", "B")
	expected := []string{"K", "G", "F", "B"}
	if len(path) != len(expected) {
		t.Fatalf("Panjang path salah: got %v, want %v", path, expected)
	}
	for i := range path {
		if path[i] != expected[i] {
			t.Fatalf("Path salah di indeks %d: got %v, want %v", i, path, expected)
		}
	}
}

