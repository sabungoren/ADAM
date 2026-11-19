package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"adam-backend/internal/config"
	"adam-backend/internal/db"
	"adam-backend/internal/graph"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/queue"
	"adam-backend/internal/sse"
)

func setupTestEnvironment(t *testing.T) (*Server, *db.DB, func()) {
	tmpDB := "./test_adam.db"
	_ = os.Remove(tmpDB)

	database, err := db.Open(tmpDB)
	if err != nil {
		t.Fatalf("Gagal open test DB: %v", err)
	}

	_ = database.SeedAdmin("smartadam@smartadam.my.id", "smartadam")

	// Seed sample graph
	sampleGraph := &graph.GraphData{
		Nodes: []string{"A", "B"},
		Edges: []graph.Edge{
			{From: "A", To: "B", Weight: 10, Direction: "E"},
		},
	}
	matrix, _ := graph.BuildMatrix(sampleGraph)
	_, _ = database.SaveNewGraph(sampleGraph, matrix)

	cfg := &config.Config{
		Port:          5194,
		AdminEmail:    "smartadam@smartadam.my.id",
		AdminPassword: "smartadam",
	}

	sseHub := sse.NewHub()
	mqttClient := mqtt.NewGatewayClient("mqtt://127.0.0.1:1883", "gateway", "", sseHub)
	queueEng := queue.NewQueueEngine(database, mqttClient, sseHub)
	queueEng.SetAutoSimulate(true)

	server := NewServer(cfg, database, mqttClient, queueEng, sseHub)

	cleanup := func() {
		database.Close()
		_ = os.Remove(tmpDB)
	}

	return server, database, cleanup
}

func TestHealthzAndGraphBin(t *testing.T) {
	server, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	handler := server.SetupRoutes()

	// 1. Test GET /healthz
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Ekspektasi HTTP 200 pada /healthz, didapat: %d", w.Code)
	}

	// 2. Test GET /graph.bin
	reqBin := httptest.NewRequest(http.MethodGet, "/graph.bin", nil)
	wBin := httptest.NewRecorder()
	handler.ServeHTTP(wBin, reqBin)

	if wBin.Code != http.StatusOK {
		t.Fatalf("Ekspektasi HTTP 200 pada /graph.bin, didapat: %d", wBin.Code)
	}
	if wBin.Body.Len() != 676 {
		t.Fatalf("Ekspektasi body /graph.bin 676 byte, didapat: %d", wBin.Body.Len())
	}
	verHeader := wBin.Header().Get("X-Graph-Version")
	if verHeader == "" || verHeader == "0" {
		t.Fatalf("Header X-Graph-Version tidak boleh kosong atau 0: '%s'", verHeader)
	}
}

func TestAdminAuthAndCall(t *testing.T) {
	server, _, cleanup := setupTestEnvironment(t)
	defer cleanup()

	handler := server.SetupRoutes()

	// 1. Test Admin Login with smartadam@smartadam.my.id / smartadam
	loginBody, _ := json.Marshal(map[string]string{
		"email":    "smartadam@smartadam.my.id",
		"password": "smartadam",
	})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody))
	reqLogin.Header.Set("Content-Type", "application/json")
	wLogin := httptest.NewRecorder()
	handler.ServeHTTP(wLogin, reqLogin)

	if wLogin.Code != http.StatusOK {
		t.Fatalf("Login admin gagal, status: %d, body: %s", wLogin.Code, wLogin.Body.String())
	}

	cookie := wLogin.Result().Cookies()
	if len(cookie) == 0 {
		t.Fatalf("Session cookie adam_session tidak diterima")
	}

	// 2. Test POST /api/call to Node B
	callBody, _ := json.Marshal(map[string]string{
		"node":      "B",
		"client_id": "test-tester-1",
	})
	reqCall := httptest.NewRequest(http.MethodPost, "/api/call", bytes.NewReader(callBody))
	reqCall.Header.Set("Content-Type", "application/json")
	wCall := httptest.NewRecorder()
	handler.ServeHTTP(wCall, reqCall)

	if wCall.Code != http.StatusAccepted && wCall.Code != http.StatusOK {
		t.Fatalf("Ekspektasi call accepted, status: %d, body: %s", wCall.Code, wCall.Body.String())
	}
}

