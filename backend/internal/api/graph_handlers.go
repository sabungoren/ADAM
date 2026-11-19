package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"adam-backend/internal/db"
	"adam-backend/internal/graph"
	"adam-backend/internal/sse"
)

type GraphHandler struct {
	database *db.DB
	hub      *sse.Hub
}

func NewGraphHandler(database *db.DB, hub *sse.Hub) *GraphHandler {
	return &GraphHandler{database: database, hub: hub}
}

// GetGraphBin serves the 676-byte binary graph for the ESP32 robot
func (h *GraphHandler) GetGraphBin(w http.ResponseWriter, r *http.Request) {
	g, matrixBlob, err := h.database.GetActiveGraph()
	if err != nil || len(matrixBlob) != graph.TotalBytes {
		http.Error(w, "Graf belum tersedia", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(matrixBlob)))
	w.Header().Set("X-Graph-Version", strconv.Itoa(g.Version))
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(matrixBlob)
}

// GetGraphJSON serves active graph JSON for the web canvas/editor
func (h *GraphHandler) GetGraphJSON(w http.ResponseWriter, r *http.Request) {
	g, _, err := h.database.GetActiveGraph()
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Graf belum tersedia"})
		return
	}

	writeJSON(w, http.StatusOK, g)
}

// SaveGraph handles POST /save (Admin only)
func (h *GraphHandler) SaveGraph(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	// 1. Prerequisite check: Maintenance must be enabled
	if !h.database.GetMaintenance() {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error": "maintenance",
			"message": "Mode maintenance harus diaktifkan sebelum menyimpan graf baru",
		})
		return
	}

	// 2. Prerequisite check: No active or queued requests
	hasRequests, err := h.database.HasActiveOrQueuedRequests()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal memeriksa antrean"})
		return
	}
	if hasRequests {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error": "active_request_or_queue_not_empty",
			"message": "Antrean harus kosong dan tidak boleh ada job aktif saat menyimpan graf",
		})
		return
	}

	var input graph.GraphData
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Format JSON graf tidak valid"})
		return
	}

	// Validate graph topology
	if err := graph.ValidateGraph(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid_graph",
			"message": err.Error(),
		})
		return
	}

	graph.Normalize(&input)

	// Build 676-byte matrix
	matrix, err := graph.BuildMatrix(&input)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "matrix_build_failed",
			"message": err.Error(),
		})
		return
	}

	newVersion, err := h.database.SaveNewGraph(&input, matrix)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menyimpan versi graf ke database"})
		return
	}

	_ = h.database.AddLog("info", "graph.saved", nil, nil, "", fmt.Sprintf("Versi graf baru dibuat: v%d (nodes: %d, edges: %d)", newVersion, len(input.Nodes), len(input.Edges)))

	// Broadcast graph update
	h.hub.Broadcast("graph_update", map[string]interface{}{
		"gateway_version": newVersion,
		"ready":           false, // Pending robot reboot/reset
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"version":    newVersion,
		"node_count": len(input.Nodes),
		"edge_count": len(input.Edges),
		"status":     "pending_reboot",
	})
}

// GetVersions handles GET /api/admin/graph/versions
func (h *GraphHandler) GetVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := h.database.GetGraphVersions()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membaca riwayat graf"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"versions": versions,
	})
}

type RollbackRequest struct {
	Version int `json:"version"`
}

// RollbackGraph handles POST /api/admin/graph/rollback
func (h *GraphHandler) RollbackGraph(w http.ResponseWriter, r *http.Request) {
	// Prerequisite checks
	if !h.database.GetMaintenance() {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Mode maintenance harus aktif sebelum rollback"})
		return
	}

	hasRequests, _ := h.database.HasActiveOrQueuedRequests()
	if hasRequests {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Antrean harus kosong sebelum rollback"})
		return
	}

	var req RollbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Version <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Versi target tidak valid"})
		return
	}

	newVersion, err := h.database.RollbackGraph(req.Version)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	_ = h.database.AddLog("info", "graph.rollback", nil, nil, "", fmt.Sprintf("Rollback ke konfigurasi v%d menghasilkan versi baru v%d", req.Version, newVersion))

	h.hub.Broadcast("graph_update", map[string]interface{}{
		"gateway_version": newVersion,
		"ready":           false,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"version": newVersion,
		"status":  "pending_reboot",
	})
}

