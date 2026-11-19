package sse

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

type EventMessage struct {
	Event string
	Data  interface{}
}

type Client chan EventMessage

type Hub struct {
	sync.RWMutex
	clients    map[Client]bool
	register   chan Client
	unregister chan Client
	broadcast  chan EventMessage
}

func NewHub() *Hub {
	h := &Hub{
		clients:    make(map[Client]bool),
		register:   make(chan Client),
		unregister: make(chan Client),
		broadcast:  make(chan EventMessage, 64),
	}

	go h.run()
	return h
}

func (h *Hub) run() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.Lock()
			h.clients[client] = true
			h.Unlock()

		case client := <-h.unregister:
			h.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client)
			}
			h.Unlock()

		case msg := <-h.broadcast:
			h.RLock()
			for client := range h.clients {
				select {
				case client <- msg:
				default:
					// Slow client
				}
			}
			h.RUnlock()

		case <-ticker.C:
			// Heartbeat comment event to keep SSE open through proxies
			h.Broadcast("heartbeat", time.Now().Unix())
		}
	}
}

func (h *Hub) Broadcast(event string, data interface{}) {
	h.broadcast <- EventMessage{
		Event: event,
		Data:  data,
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request, getSnapshot func() interface{}) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming tidak didukung", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	client := make(Client, 16)
	h.register <- client

	defer func() {
		h.unregister <- client
	}()

	// Send initial snapshot
	if getSnapshot != nil {
		snap := getSnapshot()
		data, err := json.Marshal(snap)
		if err == nil {
			fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", data)
			flusher.Flush()
		}
	}

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-client:
			if !ok {
				return
			}
			data, err := json.Marshal(msg.Data)
			if err != nil {
				log.Printf("[SSE] Error serialize event %s: %v", msg.Event, err)
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.Event, data)
			flusher.Flush()
		}
	}
}

