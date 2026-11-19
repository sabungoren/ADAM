package queue

import (
	"fmt"
	"log"
	"sync"
	"time"

	"adam-backend/internal/db"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/sse"
)

type QueueEngine struct {
	sync.Mutex
	database       *db.DB
	mqttClient     *mqtt.GatewayClient
	hub            *sse.Hub
	stopChan       chan struct{}
	activeReqID    uint16
	activeID       int64
	dispatchedTime time.Time
	ackReceived    bool
	autoSimulate   bool // If robot is offline, can auto-simulate for easy testing
}

func NewQueueEngine(database *db.DB, mqttClient *mqtt.GatewayClient, hub *sse.Hub) *QueueEngine {
	qe := &QueueEngine{
		database:     database,
		mqttClient:   mqttClient,
		hub:          hub,
		stopChan:     make(chan struct{}),
		autoSimulate: false, // Disabled by default; antrean bersih dan hanya memproses jika robot online
	}

	// Wire MQTT callbacks
	mqttClient.SetCallbacks(qe.HandleAck, qe.HandleError)

	return qe
}

func (qe *QueueEngine) SetAutoSimulate(enabled bool) {
	qe.Lock()
	qe.autoSimulate = enabled
	qe.Unlock()
}

func (qe *QueueEngine) IsAutoSimulate() bool {
	qe.Lock()
	defer qe.Unlock()
	return qe.autoSimulate
}

func (qe *QueueEngine) Start() {
	go qe.loop()
}

func (qe *QueueEngine) Stop() {
	close(qe.stopChan)
}

func (qe *QueueEngine) loop() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-qe.stopChan:
			return
		case <-ticker.C:
			if qe.IsAutoSimulate() {
				qe.mqttClient.KeepSimulatedAlive()
			}
			qe.evaluateQueue()
			qe.evaluateInFlight()
		}
	}
}

func (qe *QueueEngine) evaluateQueue() {
	qe.Lock()
	defer qe.Unlock()

	// 1. Check if there is already an active in-flight request
	inFlight, err := qe.database.GetActiveInFlightRequest()
	if err != nil {
		log.Printf("[Queue Engine] Error cek in-flight: %v", err)
		return
	}
	if inFlight != nil {
		// Already handling a job
		return
	}

	// 2. Check if there are queued requests
	oldest, err := qe.database.GetOldestQueuedRequest()
	if err != nil || oldest == nil {
		return
	}

	// 3. Gate checks from docs/06-protocol.md
	// Check Maintenance
	if qe.database.GetMaintenance() {
		return
	}

	// Check Active Graph Version
	activeGraph, _, err := qe.database.GetActiveGraph()
	if err != nil || activeGraph == nil {
		return
	}

	state := qe.mqttClient.State()
	state.RLock()
	online := state.Online
	lastHeartbeat := state.LastHeartbeat
	status := state.Status
	trash := state.Trash
	botGraphVer := state.GraphVersion
	state.RUnlock()

	// If autoSimulate is true and robot is not online, simulate robot online and ready
	if !online && qe.autoSimulate {
		qe.mqttClient.UpdateSimulatedTelemetry("IDLE", "A", "", 100, 10, uint32(activeGraph.Version))
		online = true
		lastHeartbeat = time.Now()
		status = "IDLE"
		trash = 10
		botGraphVer = uint32(activeGraph.Version)
	}

	// Check Online & Heartbeat (<= 30s)
	if !online || time.Since(lastHeartbeat) > 30*time.Second {
		return
	}

	// Check Status IDLE
	if status != "IDLE" {
		return
	}

	// Check Trash level < 95%
	if trash >= 95 {
		log.Printf("[Queue Engine] Tempat sampah penuh (%d%%). Menolak dispatch.", trash)
		return
	}

	// Check Graph Version Match
	if botGraphVer != uint32(activeGraph.Version) || botGraphVer == 0 {
		log.Printf("[Queue Engine] Versi graf robot (%d) tidak cocok dengan gateway (%d)", botGraphVer, activeGraph.Version)
		return
	}

	// 4. Dispatch the job
	wireReqID := uint16(oldest.RequestID & 0xFFFF)
	if wireReqID == 0 {
		wireReqID = 1
	}

	if err := qe.database.MarkDispatched(oldest.RequestID, int(wireReqID)); err != nil {
		log.Printf("[Queue Engine] Gagal tandai dispatched: %v", err)
		return
	}

	qe.activeReqID = wireReqID
	qe.activeID = oldest.RequestID
	qe.dispatchedTime = time.Now()
	qe.ackReceived = false

	log.Printf("[Queue Engine] Dispatch request_id=%d (req_id=0x%04X) ke Node %s", oldest.RequestID, wireReqID, oldest.Node)
	_ = qe.database.AddLog("info", "request.dispatched", &oldest.RequestID, func(i int) *int { return &i }(int(wireReqID)), "", fmt.Sprintf("moveto terkirim ke robot (target Node %s)", oldest.Node))

	// Send via MQTT
	sendErr := qe.mqttClient.PublishMoveTo(wireReqID, oldest.Node)
	if sendErr != nil {
		log.Printf("[Queue Engine] Info MQTT publish: %v", sendErr)
	}

	// Hanya simulasikan pergerakan robot jika Mode Auto-Simulate diaktifkan oleh admin!
	// Jika nonaktif, gateway hanya mengirim MQTT ke armada fisik dan tidak mensimulasikan pergerakan.
	if qe.autoSimulate {
		qe.mqttClient.SimulateRobotFlow(wireReqID, oldest.Node, activeGraph)
	}

	qe.BroadcastQueueUpdate()
}

func (qe *QueueEngine) evaluateInFlight() {
	qe.Lock()
	defer qe.Unlock()

	inFlight, err := qe.database.GetActiveInFlightRequest()
	if err != nil || inFlight == nil {
		return
	}

	now := time.Now()
	state := qe.mqttClient.State()
	state.RLock()
	status := state.Status
	cur := state.CurrentNode
	next := state.NextNode
	state.RUnlock()

	// 1. Check completion: Robot is IDLE at target node
	if inFlight.Status == "serving" && status == "IDLE" && cur == inFlight.Node && next == "" {
		qe.completeRequest(inFlight.RequestID, inFlight.Node, "done", fmt.Sprintf("Robot selesai di Node %s.", inFlight.Node))
		return
	}

	// 2. Ack Timeout (10 seconds)
	if inFlight.Status == "dispatched" && !qe.ackReceived && inFlight.DispatchedAt != nil {
		if now.Sub(*inFlight.DispatchedAt) > 10*time.Second {
			log.Printf("[Queue Engine] ACK timeout untuk request_id=%d. Melakukan rekonsiliasi...", inFlight.RequestID)
			// Reconciliation rules from docs/06-protocol.md
			if status == "MOVING" && next == inFlight.Node {
				_ = qe.database.UpdateRequestStatus(inFlight.RequestID, "serving", "", "")
				qe.ackReceived = true
			} else if status == "DWELL" && cur == inFlight.Node {
				_ = qe.database.UpdateRequestStatus(inFlight.RequestID, "serving", "", "")
				qe.ackReceived = true
			} else if status == "IDLE" && cur == inFlight.Node {
				qe.completeRequest(inFlight.RequestID, inFlight.Node, "done", fmt.Sprintf("Robot selesai di Node %s.", inFlight.Node))
				return
			} else if status == "ERROR" {
				qe.completeRequest(inFlight.RequestID, inFlight.Node, "failed", "Robot dalam status ERROR")
				return
			}
		}
	}

	// 3. Job Deadline (3 minutes)
	if inFlight.DispatchedAt != nil && now.Sub(*inFlight.DispatchedAt) > 3*time.Minute {
		log.Printf("[Queue Engine] Job deadline (3m) terlampaui untuk request_id=%d", inFlight.RequestID)
		qe.completeRequest(inFlight.RequestID, inFlight.Node, "failed", "Robot tidak menyelesaikan panggilan dalam batas waktu 3 menit.")
		return
	}
}

func (qe *QueueEngine) completeRequest(requestID int64, node, status, message string) {
	_ = qe.database.UpdateRequestStatus(requestID, status, "", message)
	_ = qe.database.AddLog("info", "request."+status, &requestID, nil, "", message)

	qe.activeID = 0
	qe.activeReqID = 0

	// Broadcast call result
	qe.hub.Broadcast("call_result", map[string]interface{}{
		"request_id": requestID,
		"node":       node,
		"status":     status,
		"message":    message,
	})

	qe.BroadcastQueueUpdate()
}

func (qe *QueueEngine) HandleAck(reqID uint16, result byte) {
	qe.Lock()
	defer qe.Unlock()

	inFlight, err := qe.database.GetActiveInFlightRequest()
	if err != nil || inFlight == nil {
		return
	}

	if uint16(inFlight.ReqID) != reqID {
		return
	}

	qe.ackReceived = true

	switch result {
	case mqtt.AckAccepted:
		_ = qe.database.UpdateRequestStatus(inFlight.RequestID, "serving", "", "")
		_ = qe.database.AddLog("info", "robot.ack", &inFlight.RequestID, func(i int) *int { return &i }(int(reqID)), "ACCEPTED", "Job diterima ke mailbox robot")
		qe.BroadcastQueueUpdate()

	case mqtt.AckBusy:
		// Return to queued
		_ = qe.database.UpdateRequestStatus(inFlight.RequestID, "queued", "", "")
		qe.BroadcastQueueUpdate()

	case mqtt.AckDuplicate:
		_ = qe.database.UpdateRequestStatus(inFlight.RequestID, "serving", "", "")
		qe.BroadcastQueueUpdate()

	case mqtt.AckQueueFull, mqtt.AckInvalidTarget, mqtt.AckTrashFull:
		msg := fmt.Sprintf("Panggilan ditolak robot: %s", mqtt.AckToString(result))
		qe.completeRequest(inFlight.RequestID, inFlight.Node, "failed", msg)
	}
}

func (qe *QueueEngine) HandleError(reqID uint16, code byte) {
	qe.Lock()
	defer qe.Unlock()

	codeStr := mqtt.ErrorToString(code)
	log.Printf("[Queue Engine] Robot melaporkan error: %s (req_id=0x%04X)", codeStr, reqID)

	inFlight, _ := qe.database.GetActiveInFlightRequest()
	if inFlight != nil {
		msg := fmt.Sprintf("Robot error %s: panggilan dibatalkan.", codeStr)
		qe.completeRequest(inFlight.RequestID, inFlight.Node, "failed", msg)
	}

	// Policy per docs/06-protocol.md §6.3:
	// Cancel all queued requests when robot errors
	cancelled, err := qe.database.ClearAllQueuedRequests()
	if err == nil && cancelled > 0 {
		log.Printf("[Queue Engine] Membatalkan %d request antrean karena robot ERROR", cancelled)
	}

	qe.BroadcastQueueUpdate()
}

func (qe *QueueEngine) BroadcastQueueUpdate() {
	queueList, err := qe.database.GetAllActiveQueue()
	if err == nil {
		qe.hub.Broadcast("queue_update", queueList)
	}
}

