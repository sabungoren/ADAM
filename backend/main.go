package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"adam-backend/internal/api"
	"adam-backend/internal/config"
	"adam-backend/internal/db"
	"adam-backend/internal/graph"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/queue"
	"adam-backend/internal/sse"
)

func main() {
	log.Println("====================================================")
	log.Println("🚀 Memulai Project A.D.A.M - Gateway & Backend Server")
	log.Println("====================================================")

	// 1. Load Config
	cfg := config.LoadConfig()
	log.Printf("[Config] Port: %d | Host: %s | DB: %s", cfg.Port, cfg.Host, cfg.DatabasePath)

	// 2. Init SQLite
	database, err := db.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("[FATAL] Gagal inisialisasi SQLite: %v", err)
	}
	defer database.Close()
	log.Println("[Database] SQLite berhasil dimuat dalam mode WAL.")

	// Bersihkan antrean lama agar tidak ada request palsu / lingering dari sesi tes
	_, _ = database.Conn().Exec("DELETE FROM requests WHERE status IN ('queued', 'dispatched', 'serving')")

	// 3. Seed Default Admin
	if err := database.SeedAdmin(cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Printf("[WARN] Gagal seed admin: %v", err)
	} else {
		log.Printf("[Auth] Akun admin default terdaftar: %s", cfg.AdminEmail)
	}

	// 4. Seed Default Graph from docs/graph-dummy.png if none exists or if older default
	activeG, _, err := database.GetActiveGraph()
	if err != nil || activeG == nil || len(activeG.Nodes) < 5 {
		log.Println("[Graph] Menginisialisasi peta graf standar Project A.D.A.M (19 Node A s.d. S)...")
		dummyGraph := &graph.GraphData{
			Nodes: []string{
				"A", "B", "C", "D",
				"E", "F", "G", "H",
				"I", "J", "K", "L",
				"M", "N", "O", "P", "Q", "R", "S",
			},
			Edges: []graph.Edge{
				// Row 0
				{From: "A", To: "B", Weight: 3, Direction: "E"},
				{From: "B", To: "C", Weight: 30, Direction: "E"},
				{From: "C", To: "D", Weight: 6, Direction: "E"},
				// Verticals Row 0 -> Row 1
				{From: "A", To: "E", Weight: 9, Direction: "S"},
				{From: "B", To: "F", Weight: 1, Direction: "S"},
				{From: "D", To: "H", Weight: 2, Direction: "S"},
				// Row 1
				{From: "E", To: "F", Weight: 26, Direction: "E"},
				{From: "F", To: "G", Weight: 47, Direction: "E"},
				{From: "G", To: "H", Weight: 15, Direction: "E"},
				// Verticals Row 1 -> Row 2
				{From: "E", To: "I", Weight: 5, Direction: "S"},
				{From: "G", To: "K", Weight: 14, Direction: "S"},
				{From: "H", To: "L", Weight: 19, Direction: "S"},
				// Row 2
				{From: "I", To: "J", Weight: 2, Direction: "E"},
				{From: "J", To: "K", Weight: 8, Direction: "E"},
				{From: "K", To: "L", Weight: 4, Direction: "E"},
				// Verticals Row 2 -> Row 3
				{From: "I", To: "M", Weight: 21, Direction: "S"},
				{From: "J", To: "N", Weight: 33, Direction: "S"},
				{From: "L", To: "P", Weight: 12, Direction: "S"},
				// Row 3
				{From: "M", To: "N", Weight: 7, Direction: "E"},
				{From: "N", To: "O", Weight: 40, Direction: "E"},
				{From: "O", To: "P", Weight: 6, Direction: "E"},
				{From: "P", To: "Q", Weight: 10, Direction: "E"},
				{From: "Q", To: "R", Weight: 2, Direction: "E"},
				// Row 3 -> Up to S
				{From: "R", To: "S", Weight: 13, Direction: "N"},
			},
			Positions: map[string]graph.Position{
				"A": {X: 120, Y: 120},
				"B": {X: 280, Y: 120},
				"C": {X: 440, Y: 120},
				"D": {X: 600, Y: 120},

				"E": {X: 120, Y: 260},
				"F": {X: 280, Y: 260},
				"G": {X: 440, Y: 260},
				"H": {X: 600, Y: 260},

				"I": {X: 120, Y: 400},
				"J": {X: 280, Y: 400},
				"K": {X: 440, Y: 400},
				"L": {X: 600, Y: 400},

				"M": {X: 120, Y: 540},
				"N": {X: 280, Y: 540},
				"O": {X: 440, Y: 540},
				"P": {X: 600, Y: 540},
				"Q": {X: 740, Y: 540},
				"R": {X: 880, Y: 540},
				"S": {X: 880, Y: 400},
			},
		}
		if matrix, err := graph.BuildMatrix(dummyGraph); err == nil {
			ver, _ := database.SaveNewGraph(dummyGraph, matrix)
			log.Printf("[Graph] Graf standar A.D.A.M berhasil diinisialisasi (Versi: %d, 19 Node)", ver)
		} else {
			log.Printf("[Graph] Error inisialisasi graf: %v", err)
		}
	} else {
		log.Printf("[Graph] Graf aktif ditemukan: Versi %d (%d nodes, %d edges)", activeG.Version, len(activeG.Nodes), len(activeG.Edges))
	}

	// 5. Embedded MQTT Broker (Optional / Fallback)
	var embeddedBroker *mqtt.EmbeddedBroker
	if cfg.EmbeddedMQTT {
		embeddedBroker, _ = mqtt.StartEmbeddedBroker()
		if embeddedBroker != nil {
			defer embeddedBroker.Close()
		}
	}

	// 6. SSE Hub
	sseHub := sse.NewHub()
	log.Println("[SSE Hub] Server-Sent Events hub aktif.")

	// 7. MQTT Gateway Client
	mqttClient := mqtt.NewGatewayClient(cfg.MQTTBroker, cfg.MQTTUsername, cfg.MQTTPassword, sseHub)
	if err := mqttClient.Connect(); err != nil {
		log.Printf("[WARN] MQTT connect warning: %v", err)
	}
	defer mqttClient.Close()

	// 8. Queue & Dispatcher Engine
	queueEngine := queue.NewQueueEngine(database, mqttClient, sseHub)
	queueEngine.Start()
	defer queueEngine.Stop()
	log.Println("[Queue Engine] Dispatcher antrean aktif.")

	// 9. API Router & Server
	server := api.NewServer(cfg, database, mqttClient, queueEngine, sseHub)
	handler := server.SetupRoutes()

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	httpServer := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second, // Long write timeout for SSE
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("🌐 HTTP API Gateway mendengarkan di http://localhost:%d", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[FATAL] HTTP server error: %v", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("\n[Shutdown] Menutup layanan Project A.D.A.M...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("[Shutdown] Error saat shutdown HTTP server: %v", err)
	}

	log.Println("[Shutdown] Server selesai dinonaktifkan.")
}

