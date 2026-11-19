package api

import (
	"encoding/json"
	"net/http"

	"adam-backend/internal/config"
	"adam-backend/internal/db"
	"adam-backend/internal/mqtt"
	"adam-backend/internal/queue"
	"adam-backend/internal/sse"
)

type Server struct {
	cfg          *config.Config
	database     *db.DB
	mqttClient   *mqtt.GatewayClient
	queueEng     *queue.QueueEngine
	hub          *sse.Hub
	authHandler  *AuthHandler
	graphHandler *GraphHandler
	callHandler  *CallHandler
	adminHandler *AdminHandler
}

func NewServer(
	cfg *config.Config,
	database *db.DB,
	mqttClient *mqtt.GatewayClient,
	queueEng *queue.QueueEngine,
	hub *sse.Hub,
) *Server {
	return &Server{
		cfg:          cfg,
		database:     database,
		mqttClient:   mqttClient,
		queueEng:     queueEng,
		hub:          hub,
		authHandler:  NewAuthHandler(database),
		graphHandler: NewGraphHandler(database, hub),
		callHandler:  NewCallHandler(database, mqttClient, queueEng, hub),
		adminHandler: NewAdminHandler(database, mqttClient, queueEng, hub),
	}
}

func (s *Server) SetupRoutes() http.Handler {
	mux := http.NewServeMux()

	// Public Endpoints
	mux.HandleFunc("GET /healthz", s.adminHandler.Healthz)
	mux.HandleFunc("GET /graph.bin", s.graphHandler.GetGraphBin)
	mux.HandleFunc("GET /api/graph", s.graphHandler.GetGraphJSON)
	mux.HandleFunc("GET /api/telemetry", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, s.getSSESnapshot())
	})
	mux.HandleFunc("GET /api/queue", func(w http.ResponseWriter, r *http.Request) {
		queueList, err := s.database.GetAllActiveQueue()
		if err != nil || queueList == nil {
			queueList = []db.RequestView{}
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{"queue": queueList})
	})
	mux.HandleFunc("POST /api/call", s.callHandler.CallNode)
	mux.HandleFunc("DELETE /api/request/{id}", s.callHandler.CancelRequest)

	// SSE Stream
	mux.HandleFunc("GET /events", func(w http.ResponseWriter, r *http.Request) {
		s.hub.ServeHTTP(w, r, s.getSSESnapshot)
	})

	// Auth Endpoints
	mux.HandleFunc("POST /api/auth/login", s.authHandler.Login)
	mux.HandleFunc("POST /api/auth/logout", s.authHandler.Logout)
	mux.HandleFunc("GET /api/auth/me", s.authHandler.Me)

	// Admin Endpoints (Require Authentication)
	mux.HandleFunc("POST /save", s.authHandler.RequireAdmin(s.graphHandler.SaveGraph))
	mux.HandleFunc("GET /api/admin/graph/versions", s.authHandler.RequireAdmin(s.graphHandler.GetVersions))
	mux.HandleFunc("POST /api/admin/graph/rollback", s.authHandler.RequireAdmin(s.graphHandler.RollbackGraph))
	mux.HandleFunc("POST /api/admin/maintenance", s.authHandler.RequireAdmin(s.adminHandler.SetMaintenance))
	mux.HandleFunc("POST /api/admin/reset", s.authHandler.RequireAdmin(s.adminHandler.ResetRobot))
	mux.HandleFunc("GET /api/admin/queue", s.authHandler.RequireAdmin(s.adminHandler.GetQueue))
	mux.HandleFunc("POST /api/admin/queue/clear", s.authHandler.RequireAdmin(s.adminHandler.ClearQueue))
	mux.HandleFunc("GET /api/admin/logs", s.authHandler.RequireAdmin(s.adminHandler.GetLogs))
	mux.HandleFunc("POST /api/admin/simulate", s.authHandler.RequireAdmin(s.adminHandler.SimulateControl))
	mux.HandleFunc("GET /api/admin/simulate", s.authHandler.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"auto_simulate": s.queueEng.IsAutoSimulate(),
			"state":         s.mqttClient.State(),
		})
	}))

	// CORS & Logging Middleware
	return s.corsMiddleware(mux)
}

func (s *Server) getSSESnapshot() interface{} {
	state := s.mqttClient.State()
	state.RLock()
	st := state.Status
	cur := state.CurrentNode
	next := state.NextNode
	bat := state.Battery
	tr := state.Trash
	online := state.Online
	botVer := state.GraphVersion
	state.RUnlock()

	activeGraph, _, _ := s.database.GetActiveGraph()
	var gVer int
	if activeGraph != nil {
		gVer = activeGraph.Version
	}

	queueList, _ := s.database.GetAllActiveQueue()
	if queueList == nil {
		queueList = []db.RequestView{}
	}

	fresh := s.mqttClient.IsFresh()
	maint := s.database.GetMaintenance()
	ready := online && fresh && st == "IDLE" && !maint && tr < 95 && uint32(gVer) == botVer && gVer > 0

	return map[string]interface{}{
		"pos": map[string]string{
			"current": cur,
			"next":    next,
		},
		"status":      st,
		"fresh":       fresh,
		"battery":     bat,
		"trash":       tr,
		"online":      online,
		"maintenance": maint,
		"auto_simulate": s.queueEng.IsAutoSimulate(),
		"graph": map[string]interface{}{
			"gateway_version": gVer,
			"robot_version":   botVer,
			"ready":           ready,
		},
		"queue": queueList,
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = s.cfg.CorsOrigin
		}

		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Cookie")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}
