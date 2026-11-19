package mqtt

import (
	"fmt"
	"log"
	"sync"
	"time"

	"adam-backend/internal/graph"
	"adam-backend/internal/sse"

	pahomqtt "github.com/eclipse/paho.mqtt.golang"
)

type RobotState struct {
	sync.RWMutex
	Online        bool      `json:"online"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	Status        string    `json:"status"` // IDLE, MOVING, DWELL, ERROR
	CurrentNode   string    `json:"current"`
	NextNode      string    `json:"next"`
	Battery       int       `json:"battery"`
	Trash         int       `json:"trash"`
	GraphVersion  uint32    `json:"graph_version"`
}

type AckCallback func(reqID uint16, result byte)
type ErrorCallback func(reqID uint16, code byte)

type GatewayClient struct {
	client        pahomqtt.Client
	state         *RobotState
	hub           *sse.Hub
	brokerURL     string
	username      string
	password      string
	onAck         AckCallback
	onError       ErrorCallback
	reconnectStop chan struct{}
}

func NewGatewayClient(brokerURL, username, password string, hub *sse.Hub) *GatewayClient {
	gc := &GatewayClient{
		state: &RobotState{
			Online:        false,
			LastHeartbeat: time.Time{},
			Status:        "IDLE",
			CurrentNode:   "A",
			NextNode:      "",
			Battery:       100,
			Trash:         0,
			GraphVersion:  0,
		},
		hub:           hub,
		brokerURL:     brokerURL,
		username:      username,
		password:      password,
		reconnectStop: make(chan struct{}),
	}

	return gc
}

func (gc *GatewayClient) SetCallbacks(onAck AckCallback, onError ErrorCallback) {
	gc.onAck = onAck
	gc.onError = onError
}

func (gc *GatewayClient) State() *RobotState {
	return gc.state
}

func (gc *GatewayClient) IsRobotOnline() bool {
	gc.state.RLock()
	defer gc.state.RUnlock()
	return gc.state.Online && time.Since(gc.state.LastHeartbeat) <= 30*time.Second
}

func (gc *GatewayClient) IsFresh() bool {
	gc.state.RLock()
	defer gc.state.RUnlock()
	if !gc.state.Online {
		return false
	}
	return time.Since(gc.state.LastHeartbeat) <= 30*time.Second
}

func (gc *GatewayClient) Connect() error {
	opts := pahomqtt.NewClientOptions()
	opts.AddBroker(gc.brokerURL)
	opts.SetClientID("adam-gateway")
	if gc.username != "" {
		opts.SetUsername(gc.username)
		opts.SetPassword(gc.password)
	}
	opts.SetCleanSession(false)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetAutoReconnect(true)

	opts.SetOnConnectHandler(func(c pahomqtt.Client) {
		log.Printf("[MQTT Gateway] Terhubung ke broker MQTT: %s", gc.brokerURL)
		gc.subscribeAll(c)
	})

	opts.SetConnectionLostHandler(func(c pahomqtt.Client, err error) {
		log.Printf("[MQTT Gateway] Koneksi terputus: %v. Mencoba rekoneksi...", err)
	})

	client := pahomqtt.NewClient(opts)
	token := client.Connect()
	if token.Wait() && token.Error() != nil {
		log.Printf("[MQTT Gateway] Gagal konek awal ke %s: %v (akan dicoba berkala di background)", gc.brokerURL, token.Error())
		go gc.backgroundConnect(client)
	} else {
		gc.client = client
	}

	// Heartbeat monitoring loop
	go gc.monitorFreshness()

	return nil
}

func (gc *GatewayClient) backgroundConnect(client pahomqtt.Client) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-gc.reconnectStop:
			return
		case <-ticker.C:
			token := client.Connect()
			if token.Wait() && token.Error() == nil {
				gc.client = client
				log.Println("[MQTT Gateway] Berhasil terhubung ke broker MQTT di background!")
				return
			}
		}
	}
}

func (gc *GatewayClient) subscribeAll(c pahomqtt.Client) {
	topic := "adam/srv/#"
	token := c.Subscribe(topic, 1, func(client pahomqtt.Client, msg pahomqtt.Message) {
		gc.handleIncomingMessage(msg.Topic(), msg.Payload())
	})
	if token.Wait() && token.Error() != nil {
		log.Printf("[MQTT Gateway] Gagal subscribe ke %s: %v", topic, token.Error())
	} else {
		log.Printf("[MQTT Gateway] Berhasil subscribe ke %s", topic)
	}
}

func (gc *GatewayClient) handleIncomingMessage(topic string, payload []byte) {
	switch topic {
	case TopicOnline:
		gc.state.Lock()
		if len(payload) > 0 && payload[0] == 0x01 {
			gc.state.Online = true
			gc.state.LastHeartbeat = time.Now()
			gc.state.Unlock()
			gc.hub.Broadcast("online_update", true)
			gc.hub.Broadcast("fresh_update", true)
		} else {
			gc.state.Online = false
			gc.state.Unlock()
			gc.hub.Broadcast("online_update", false)
			gc.hub.Broadcast("fresh_update", false)
		}

	case TopicStatus:
		if len(payload) > 0 {
			st := StatusToString(payload[0])
			gc.state.Lock()
			gc.state.Status = st
			gc.state.Unlock()
			gc.hub.Broadcast("status_update", st)
		}

	case TopicCurrentPos:
		cur, next, err := DecodeCurrentPos(payload)
		if err == nil {
			gc.state.Lock()
			gc.state.CurrentNode = cur
			gc.state.NextNode = next
			gc.state.Unlock()
			gc.hub.Broadcast("pos_update", map[string]string{
				"current": cur,
				"next":    next,
			})
		}

	case TopicBattery:
		if len(payload) > 0 {
			bat := int(payload[0])
			gc.state.Lock()
			gc.state.Battery = bat
			gc.state.Unlock()
			gc.hub.Broadcast("battery_update", bat)
		}

	case TopicTrash:
		if len(payload) > 0 {
			tr := int(payload[0])
			gc.state.Lock()
			gc.state.Trash = tr
			gc.state.Unlock()
			gc.hub.Broadcast("trash_update", tr)
		}

	case TopicGraphVersion:
		ver, err := DecodeGraphVersion(payload)
		if err == nil {
			gc.state.Lock()
			gc.state.GraphVersion = ver
			gc.state.Unlock()
			gc.hub.Broadcast("graph_update", map[string]interface{}{
				"robot_version": ver,
			})
		}

	case TopicAck:
		reqID, result, err := DecodeAck(payload)
		if err == nil {
			log.Printf("[MQTT Gateway] Diterima ACK: req_id=0x%04X, result=%s", reqID, AckToString(result))
			if gc.onAck != nil {
				gc.onAck(reqID, result)
			}
		}

	case TopicError:
		reqID, code, err := DecodeError(payload)
		if err == nil {
			log.Printf("[MQTT Gateway] Diterima ERROR: req_id=0x%04X, code=%s", reqID, ErrorToString(code))
			gc.hub.Broadcast("error_update", map[string]interface{}{
				"req_id": reqID,
				"code":   ErrorToString(code),
			})
			if gc.onError != nil {
				gc.onError(reqID, code)
			}
		}
	}
}

func (gc *GatewayClient) monitorFreshness() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	lastReportedFresh := false

	for range ticker.C {
		fresh := gc.IsFresh()
		if fresh != lastReportedFresh {
			lastReportedFresh = fresh
			gc.hub.Broadcast("fresh_update", fresh)
		}
	}
}

func (gc *GatewayClient) PublishMoveTo(reqID uint16, node string) error {
	if gc.client == nil || !gc.client.IsConnected() {
		return fmt.Errorf("MQTT client tidak terhubung")
	}
	payload := EncodeMoveTo(reqID, node)
	token := gc.client.Publish(TopicMoveTo, 1, false, payload)
	if token.WaitTimeout(3*time.Second) && token.Error() != nil {
		return token.Error()
	}
	log.Printf("[MQTT Gateway] Dipublish MoveTo: req_id=0x%04X, target=%s", reqID, node)
	return nil
}

func (gc *GatewayClient) PublishReset() error {
	if gc.client == nil || !gc.client.IsConnected() {
		return fmt.Errorf("MQTT client tidak terhubung")
	}
	token := gc.client.Publish(TopicReset, 1, false, []byte{})
	if token.WaitTimeout(3*time.Second) && token.Error() != nil {
		return token.Error()
	}
	log.Printf("[MQTT Gateway] Dipublish Reset ke robot")
	return nil
}

// KeepSimulatedAlive ensures heartbeat timestamp is kept fresh while simulation is active
func (gc *GatewayClient) KeepSimulatedAlive() {
	gc.state.Lock()
	if gc.state.Online {
		gc.state.LastHeartbeat = time.Now()
	}
	gc.state.Unlock()
}

// UpdateSimulatedFields updates only specific simulated fields without overwriting others
func (gc *GatewayClient) UpdateSimulatedFields(online *bool, status, current, next *string, battery, trash *int, graphVersion *uint32) {
	gc.state.Lock()
	if online != nil {
		gc.state.Online = *online
		if *online {
			gc.state.LastHeartbeat = time.Now()
		}
	} else if gc.state.Online {
		gc.state.LastHeartbeat = time.Now()
	}

	if status != nil && *status != "" {
		gc.state.Status = *status
	}
	if current != nil && *current != "" {
		gc.state.CurrentNode = *current
	}
	if next != nil {
		gc.state.NextNode = *next
	}
	if battery != nil && *battery >= 0 {
		b := *battery
		if b > 100 {
			b = 100
		}
		gc.state.Battery = b
	}
	if trash != nil && *trash >= 0 {
		t := *trash
		if t > 100 {
			t = 100
		}
		gc.state.Trash = t
	}
	if graphVersion != nil && *graphVersion > 0 {
		gc.state.GraphVersion = *graphVersion
	}

	curOnline := gc.state.Online
	curStatus := gc.state.Status
	curNode := gc.state.CurrentNode
	curNext := gc.state.NextNode
	curBat := gc.state.Battery
	curTrash := gc.state.Trash
	curVer := gc.state.GraphVersion
	gc.state.Unlock()

	// Broadcast
	gc.hub.Broadcast("online_update", curOnline)
	gc.hub.Broadcast("fresh_update", curOnline)
	gc.hub.Broadcast("status_update", curStatus)
	gc.hub.Broadcast("pos_update", map[string]string{"current": curNode, "next": curNext})
	gc.hub.Broadcast("battery_update", curBat)
	gc.hub.Broadcast("trash_update", curTrash)
	gc.hub.Broadcast("graph_update", map[string]interface{}{"robot_version": curVer})
}

// UpdateSimulatedTelemetry manual update (used for robot simulation or testing)
func (gc *GatewayClient) UpdateSimulatedTelemetry(status, current, next string, battery, trash int, graphVersion uint32) {
	var pOnline *bool
	var pStatus *string
	var pCur *string
	var pNext *string
	var pBat *int
	var pTrash *int
	var pVer *uint32

	tOnline := true
	pOnline = &tOnline

	if status != "" {
		pStatus = &status
	}
	if current != "" {
		pCur = &current
	}
	if next != "" {
		pNext = &next
	} else if status == "IDLE" || status == "DWELL" || status == "ERROR" {
		empty := ""
		pNext = &empty
	}
	if battery >= 0 {
		pBat = &battery
	}
	if trash >= 0 {
		pTrash = &trash
	}
	if graphVersion > 0 {
		pVer = &graphVersion
	}

	gc.UpdateSimulatedFields(pOnline, pStatus, pCur, pNext, pBat, pTrash, pVer)
}

// SimulateRobotFlow generates realistic robot response traversing the graph node-by-node along connected edges
func (gc *GatewayClient) SimulateRobotFlow(reqID uint16, targetNode string, g *graph.GraphData) {
	go func() {
		time.Sleep(500 * time.Millisecond)
		// 1. Send Ack ACCEPTED
		if gc.onAck != nil {
			gc.onAck(reqID, AckAccepted)
		}

		gc.state.Lock()
		cur := gc.state.CurrentNode
		bat := gc.state.Battery
		tr := gc.state.Trash
		gc.state.Unlock()

		if cur == "" {
			cur = "A"
		}

		// Calculate optimal path along connected edges (fewest hops, lowest weight)
		path := graph.FindShortestPath(g, cur, targetNode)
		log.Printf("[Simulation] Rute armada dari Node %s ke Node %s: %v", cur, targetNode, path)

		// Kurangi baterai 1% per perjalanan (minimum 5%)
		if bat > 5 {
			bat -= 1
		}

		// 2. Bergerak tahap demi tahap (hop-by-hop) melewati node yang saling terhubung langsung
		stMoving := "MOVING"
		for i := 0; i < len(path)-1; i++ {
			u := path[i]
			v := path[i+1]
			log.Printf("[Simulation] Bergerak dari Node %s menuju Node %s", u, v)
			gc.UpdateSimulatedFields(nil, &stMoving, &u, &v, &bat, nil, nil)
			time.Sleep(2 * time.Second)
		}

		// 3. Tiba di target dan Dwell (tutup terbuka untuk buang sampah)
		stDwell := "DWELL"
		emptyNext := ""
		log.Printf("[Simulation] Tiba di target Node %s (DWELL - Tutup Terbuka)", targetNode)
		gc.UpdateSimulatedFields(nil, &stDwell, &targetNode, &emptyNext, nil, nil, nil)
		time.Sleep(3 * time.Second)

		// 4. Tutup wadah tertutup, sampah bertambah 3% (maks 100%)
		if tr < 98 {
			tr += 3
		}

		// 5. Selesai, kembali ke status IDLE di node target
		stIdle := "IDLE"
		log.Printf("[Simulation] Selesai di Node %s (IDLE - Siap melayani)", targetNode)
		gc.UpdateSimulatedFields(nil, &stIdle, &targetNode, &emptyNext, nil, &tr, nil)
	}()
}

func (gc *GatewayClient) Close() {
	close(gc.reconnectStop)
	if gc.client != nil && gc.client.IsConnected() {
		gc.client.Disconnect(250)
	}
}
