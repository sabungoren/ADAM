package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"adam-backend/internal/db"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/queue"
	"adam-backend/internal/sse"
)

type CallHandler struct {
	sync.Mutex
	database   *db.DB
	mqttClient *mqtt.GatewayClient
	queueEng   *queue.QueueEngine
	hub        *sse.Hub
	rateLimits map[string]time.Time // key: IP/client_id, val: last call time
}

func NewCallHandler(database *db.DB, mqttClient *mqtt.GatewayClient, queueEng *queue.QueueEngine, hub *sse.Hub) *CallHandler {
	return &CallHandler{
		database:   database,
		mqttClient: mqttClient,
		queueEng:   queueEng,
		hub:        hub,
		rateLimits: make(map[string]time.Time),
	}
}

type CallRequest struct {
	Node     string `json:"node"`
	ClientID string `json:"client_id,omitempty"`
}

func (h *CallHandler) CallNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	var req CallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_payload", "message": "Format JSON tidak valid"})
		return
	}

	targetNode := strings.ToUpper(strings.TrimSpace(req.Node))
	if len(targetNode) != 1 || targetNode[0] < 'A' || targetNode[0] > 'Z' {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_node", "message": "Label node harus 1 huruf A-Z"})
		return
	}

	// 1. Validasi node terhadap graf aktif
	activeGraph, _, err := h.database.GetActiveGraph()
	if err != nil || activeGraph == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no_graph", "message": "Belum ada graf aktif di sistem"})
		return
	}

	nodeExists := false
	for _, n := range activeGraph.Nodes {
		if n == targetNode {
			nodeExists = true
			break
		}
	}
	if !nodeExists {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_node", "message": fmt.Sprintf("Node '%s' tidak ada di graf aktif", targetNode)})
		return
	}

	// 2. Cek Mode Maintenance
	if h.database.GetMaintenance() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "maintenance", "message": "Sistem sedang dalam mode pemeliharaan"})
		return
	}

	// Ambil state robot
	state := h.mqttClient.State()
	state.RLock()
	online := state.Online
	status := state.Status
	cur := state.CurrentNode
	trash := state.Trash
	botVer := state.GraphVersion
	state.RUnlock()

	// Jika mode auto-simulate aktif dan bot belum online, buat bot ready untuk testing
	if !online && h.queueEng.IsAutoSimulate() {
		h.mqttClient.UpdateSimulatedTelemetry("IDLE", "A", "", 100, 10, uint32(activeGraph.Version))
		online = true
		status = "IDLE"
		cur = "A"
		trash = 10
		botVer = uint32(activeGraph.Version)
	}

	// 3. Cek Robot Online & Freshness
	if !online || !h.mqttClient.IsFresh() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "robot_offline", "message": "Robot sedang offline atau tidak ada sinyal heartbeat"})
		return
	}

	// 4. Cek Robot Error
	if status == "ERROR" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "robot_error", "message": "Robot sedang mengalami error dan menunggu reset admin"})
		return
	}

	// 5. Cek Graph Version Match
	if botVer != uint32(activeGraph.Version) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "graph_update",
			"message": fmt.Sprintf("Versi peta robot (v%d) belum cocok dengan server (v%d). Robot harus reboot/reset.", botVer, activeGraph.Version),
		})
		return
	}

	// 6. Cek Kapasitas Sampah
	if trash >= 95 {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "bin_full",
			"message": "Tempat sampah robot penuh (≥95%). Robot menunggu di Home A untuk dikosongkan.",
			"trash": strconv.Itoa(trash),
		})
		return
	}

	// 7. Deduplikasi Target
	// a. Cek apakah robot sudah IDLE di node tersebut
	if status == "IDLE" && cur == targetNode {
		inFlight, _ := h.database.GetActiveInFlightRequest()
		if inFlight == nil {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"node":    targetNode,
				"status":  "already_here",
				"message": fmt.Sprintf("Robot sudah berada di Node %s", targetNode),
			})
			return
		}
	}

	// b. Cek apakah sudah ada request aktif untuk targetNode
	existing, err := h.database.GetActiveRequestForNode(targetNode)
	if err == nil && existing != nil {
		if existing.Status == "queued" {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"request_id":     existing.RequestID,
				"node":           existing.Node,
				"status":         "already_queued",
				"queue_position": existing.QueuePosition,
			})
			return
		}
		if existing.Status == "dispatched" || existing.Status == "serving" {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"request_id": existing.RequestID,
				"node":       existing.Node,
				"status":     "in_progress",
				"message":    fmt.Sprintf("Robot sedang menuju atau melayani Node %s", existing.Node),
			})
			return
		}
	}

	// 8. Rate Limiting per client/IP (10 detik cooldown)
	clientKey := req.ClientID
	if clientKey == "" {
		clientKey = getClientIP(r)
	}

	h.Lock()
	lastCall, ok := h.rateLimits[clientKey]
	if ok && time.Since(lastCall) < 10*time.Second {
		retryAfter := int(10 - time.Since(lastCall).Seconds())
		h.Unlock()
		w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
			"error":       "rate_limited",
			"message":     "Harap tunggu sebelum membuat permintaan baru",
			"retry_after": retryAfter,
		})
		return
	}
	h.rateLimits[clientKey] = time.Now()
	h.Unlock()

	// 9. Cek Kapasitas Antrean (Maksimal 20 request 'queued')
	queuedCount, err := h.database.CountQueuedRequests()
	if err == nil && queuedCount >= 20 {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{
			"error":   "queue_full",
			"message": "Antrean saat ini sudah penuh (maksimal 20 permintaan)",
		})
		return
	}

	// 10. Tambah ke Antrean
	requestID, queuePos, err := h.database.CreateRequest(targetNode, clientKey)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menyimpan permintaan ke antrean"})
		return
	}

	_ = h.database.AddLog("info", "request.queued", &requestID, nil, "", fmt.Sprintf("Panggilan ke Node %s masuk antrean (#%d)", targetNode, queuePos))
	h.queueEng.BroadcastQueueUpdate()

	writeJSON(w, http.StatusAccepted, map[string]interface{}{
		"request_id":     requestID,
		"node":           targetNode,
		"status":         "queued",
		"queue_position": queuePos,
	})
}

func (h *CallHandler) CancelRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	// Extract {id} from path e.g. /api/request/42
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_url"})
		return
	}
	reqIDStr := parts[len(parts)-1]
	reqID, err := strconv.ParseInt(reqIDStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id_not_number"})
		return
	}

	reqView, err := h.database.GetRequest(reqID)
	if err != nil || reqView == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not_found", "message": "Permintaan tidak ditemukan"})
		return
	}

	if reqView.Status != "queued" {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error":   "not_cancellable",
			"message": fmt.Sprintf("Permintaan berstatus '%s' tidak dapat dibatalkan", reqView.Status),
		})
		return
	}

	cancelled, err := h.database.CancelQueuedRequest(reqID)
	if err != nil || !cancelled {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membatalkan permintaan"})
		return
	}

	_ = h.database.AddLog("info", "request.cancelled", &reqID, nil, "", "Panggilan dibatalkan oleh pengguna")

	// Broadcast call result and queue update
	h.hub.Broadcast("call_result", map[string]interface{}{
		"request_id": reqID,
		"node":       reqView.Node,
		"status":     "cancelled",
		"message":    "Panggilan dibatalkan.",
	})
	h.queueEng.BroadcastQueueUpdate()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"request_id": reqID,
		"status":     "cancelled",
	})
}

func getClientIP(r *http.Request) string {
	// Support X-Forwarded-For if behind reverse proxy
	xff := r.Header.Get("X-Forwarded-For")
	if xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}
	return r.RemoteAddr
}

