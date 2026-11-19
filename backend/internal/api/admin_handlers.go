package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"adam-backend/internal/db"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/queue"
	"adam-backend/internal/sse"
)

type AdminHandler struct {
	database   *db.DB
	mqttClient *mqtt.GatewayClient
	queueEng   *queue.QueueEngine
	hub        *sse.Hub
}

func NewAdminHandler(database *db.DB, mqttClient *mqtt.GatewayClient, queueEng *queue.QueueEngine, hub *sse.Hub) *AdminHandler {
	return &AdminHandler{
		database:   database,
		mqttClient: mqttClient,
		queueEng:   queueEng,
		hub:        hub,
	}
}

type MaintenanceRequest struct {
	Enabled bool `json:"enabled"`
}

func (h *AdminHandler) SetMaintenance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	var req MaintenanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Format JSON tidak valid"})
		return
	}

	if err := h.database.SetMaintenance(req.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal menyimpan status maintenance"})
		return
	}

	msg := "Maintenance mode diaktifkan"
	if !req.Enabled {
		msg = "Maintenance mode dinonaktifkan"
	}
	_ = h.database.AddLog("info", "system.maintenance", nil, nil, "", msg)

	h.hub.Broadcast("maintenance_update", req.Enabled)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"maintenance": req.Enabled,
	})
}

// ResetRobot handles POST /api/admin/reset
func (h *AdminHandler) ResetRobot(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	state := h.mqttClient.State()
	state.RLock()
	online := state.Online
	status := state.Status
	state.RUnlock()

	// Jika armada fisik sedang melayani secara aktif dan tidak dalam simulasi, tolak agar aman
	if (status == "MOVING" || status == "DWELL") && online && !h.queueEng.IsAutoSimulate() {
		writeJSON(w, http.StatusConflict, map[string]string{
			"error":   "robot_busy",
			"message": fmt.Sprintf("Robot sedang melayani (%s). Tunggu hingga robot selesai.", status),
		})
		return
	}

	// 1. Publikasikan topik MQTT srv/adam/reset (bila broker terhubung)
	_ = h.mqttClient.PublishReset()

	// 2. Batalkan request yang sedang aktif di DB (in-flight)
	if inFlight, err := h.database.GetActiveInFlightRequest(); err == nil && inFlight != nil {
		_ = h.database.UpdateRequestStatus(inFlight.RequestID, "cancelled", "", "Dibatalkan oleh Admin Reset")
	}

	// 3. Reset state telemetri ke Home A (Utara), status IDLE, kapasitas sampah 0%
	g, _, _ := h.database.GetActiveGraph()
	ver := uint32(1)
	if g != nil {
		ver = uint32(g.Version)
	}

	h.mqttClient.UpdateSimulatedTelemetry("IDLE", "A", "", -1, 0, ver)

	// 4. Siarkan pembaruan antrean & log audit
	h.queueEng.BroadcastQueueUpdate()
	_ = h.database.AddLog("info", "admin.reset", nil, nil, "", "Admin mengeksekusi reset sistem: robot dipulihkan ke Home A (IDLE) dan sampah 0%")

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "reset_success",
		"message": "Armada berhasil direset ke Home A (IDLE). Kapasitas sampah di-nolkan dan graf disinkronkan.",
	})
}

// GetQueue handles GET /api/admin/queue
func (h *AdminHandler) GetQueue(w http.ResponseWriter, r *http.Request) {
	list, err := h.database.GetAllActiveQueue()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membaca antrean"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"requests": list,
	})
}

// ClearQueue handles POST /api/admin/queue/clear
func (h *AdminHandler) ClearQueue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	cancelled, err := h.database.ClearAllQueuedRequests()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal mengosongkan antrean"})
		return
	}

	_ = h.database.AddLog("info", "queue.cleared", nil, nil, "", fmt.Sprintf("Admin mengosongkan antrean (%d dibatalkan)", cancelled))
	h.queueEng.BroadcastQueueUpdate()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"cancelled": cancelled,
	})
}

// GetLogs handles GET /api/admin/logs
func (h *AdminHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	logs, err := h.database.GetLogs(limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membaca log"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"logs": logs,
	})
}

type SimulateRequest struct {
	AutoSimulate *bool   `json:"auto_simulate,omitempty"`
	Online       *bool   `json:"online,omitempty"`
	Status       *string `json:"status,omitempty"`
	Current      *string `json:"current,omitempty"`
	Next         *string `json:"next,omitempty"`
	Battery      *int    `json:"battery,omitempty"`
	Trash        *int    `json:"trash,omitempty"`
	GraphVersion *uint32 `json:"graph_version,omitempty"`
}

// SimulateControl handles POST /api/admin/simulate for testing without hardware
func (h *AdminHandler) SimulateControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	var req SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Format JSON tidak valid"})
		return
	}

	if req.AutoSimulate != nil {
		h.queueEng.SetAutoSimulate(*req.AutoSimulate)
		if *req.AutoSimulate {
			// Aktifkan armada simulasi secara instan agar siap melayani panggilan
			activeGraph, _, _ := h.database.GetActiveGraph()
			var gVer uint32
			if activeGraph != nil {
				gVer = uint32(activeGraph.Version)
			}
			tOnline := true
			stIdle := "IDLE"
			curA := "A"
			emptyNext := ""
			bat100 := 100
			trash10 := 10

			st := h.mqttClient.State()
			st.RLock()
			curOnline := st.Online
			curNode := st.CurrentNode
			curBat := st.Battery
			curTr := st.Trash
			st.RUnlock()

			if !curOnline {
				if curNode != "" {
					curA = curNode
				}
				if curBat > 0 {
					bat100 = curBat
				}
				if curTr >= 0 {
					trash10 = curTr
				}
				h.mqttClient.UpdateSimulatedFields(&tOnline, &stIdle, &curA, &emptyNext, &bat100, &trash10, &gVer)
			}
		} else {
			// Jika dinonaktifkan dan belum ada armada fisik terhubung, matikan status online
			if !h.mqttClient.IsRobotOnline() {
				fOnline := false
				h.mqttClient.UpdateSimulatedFields(&fOnline, nil, nil, nil, nil, nil, nil)
			}
		}
		// Siarkan status auto-simulate ke seluruh client via SSE
		h.hub.Broadcast("auto_simulate_update", *req.AutoSimulate)
	}

	h.mqttClient.UpdateSimulatedFields(
		req.Online,
		req.Status,
		req.Current,
		req.Next,
		req.Battery,
		req.Trash,
		req.GraphVersion,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"auto_simulate": h.queueEng.IsAutoSimulate(),
		"state":         h.mqttClient.State(),
	})
}

// Healthz handles GET /healthz
func (h *AdminHandler) Healthz(w http.ResponseWriter, r *http.Request) {
	state := h.mqttClient.State()
	state.RLock()
	online := state.Online
	status := state.Status
	trash := state.Trash
	botVer := state.GraphVersion
	state.RUnlock()

	activeGraph, _, _ := h.database.GetActiveGraph()
	var gVer int
	if activeGraph != nil {
		gVer = activeGraph.Version
	}

	fresh := h.mqttClient.IsFresh()
	maint := h.database.GetMaintenance()

	ready := online && fresh && status == "IDLE" && !maint && trash < 95 && uint32(gVer) == botVer && gVer > 0

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "ok",
		"timestamp":   time.Now().Format(time.RFC3339),
		"database":    "connected",
		"robot_online": online,
		"fresh":       fresh,
		"maintenance": maint,
		"graph_match": uint32(gVer) == botVer,
		"ready":       ready,
		"robot_state": state,
	})
}

