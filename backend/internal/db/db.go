package db

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"adam-backend/internal/graph"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

type Admin struct {
	ID           int64
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

type VersionMeta struct {
	Version   int       `json:"version"`
	NodeCount int       `json:"node_count"`
	EdgeCount int       `json:"edge_count"`
	CreatedAt time.Time `json:"created_at"`
}

type RequestView struct {
	RequestID     int64      `json:"request_id"`
	Node          string     `json:"node"`
	ClientID      string     `json:"client_id,omitempty"`
	Status        string     `json:"status"`
	QueuePosition *int       `json:"queue_position"`
	ReqID         int        `json:"req_id"`
	CreatedAt     time.Time  `json:"created_at"`
	DispatchedAt  *time.Time `json:"dispatched_at,omitempty"`
}

type LogEntry struct {
	ID        int64     `json:"id"`
	TS        time.Time `json:"ts"`
	Level     string    `json:"level"`
	Event     string    `json:"event"`
	RequestID *int64    `json:"request_id,omitempty"`
	ReqID     *int      `json:"req_id,omitempty"`
	Code      string    `json:"code,omitempty"`
	Message   string    `json:"message"`
}

func Open(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("gagal membuat folder database: %w", err)
		}
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("gagal membuka database: %w", err)
	}

	conn.SetMaxOpenConns(1) // Single writer for SQLite

	if _, err := conn.Exec(SchemaSQL); err != nil {
		conn.Close()
		return nil, fmt.Errorf("gagal inisialisasi schema: %w", err)
	}

	// Auto-migration for positions_json
	_, _ = conn.Exec("ALTER TABLE graph_versions ADD COLUMN positions_json TEXT DEFAULT '{}'")

	d := &DB{conn: conn}
	return d, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) Conn() *sql.DB {
	return d.conn
}

// SeedAdmin ensures the default admin exists
func (d *DB) SeedAdmin(email, password string) error {
	var count int
	err := d.conn.QueryRow("SELECT COUNT(*) FROM admins WHERE email = ?", email).Scan(&count)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = d.conn.Exec("INSERT INTO admins (email, password_hash) VALUES (?, ?)", email, string(hash))
	return err
}

// GetAdminByEmail fetches admin record
func (d *DB) GetAdminByEmail(email string) (*Admin, error) {
	var a Admin
	err := d.conn.QueryRow("SELECT id, email, password_hash, created_at FROM admins WHERE email = ?", email).
		Scan(&a.ID, &a.Email, &a.PasswordHash, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Sessions
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (d *DB) CreateSession(sessionID, token string, adminID int64, duration time.Duration) error {
	tokenHash := HashToken(token)
	expiresAt := time.Now().Add(duration)
	_, err := d.conn.Exec("INSERT INTO sessions (id, token_hash, admin_id, expires_at) VALUES (?, ?, ?, ?)",
		sessionID, tokenHash, adminID, expiresAt)
	return err
}

func (d *DB) ValidateSession(sessionID, token string) (*Admin, error) {
	tokenHash := HashToken(token)
	var a Admin
	var expiresAt time.Time
	err := d.conn.QueryRow(`
		SELECT a.id, a.email, a.created_at, s.expires_at 
		FROM sessions s 
		JOIN admins a ON s.admin_id = a.id 
		WHERE s.id = ? AND s.token_hash = ?`, sessionID, tokenHash).
		Scan(&a.ID, &a.Email, &a.CreatedAt, &expiresAt)
	if err != nil {
		return nil, err
	}
	if time.Now().After(expiresAt) {
		_ = d.DeleteSession(sessionID)
		return nil, errors.New("sesi kedaluwarsa")
	}
	return &a, nil
}

func (d *DB) DeleteSession(sessionID string) error {
	_, err := d.conn.Exec("DELETE FROM sessions WHERE id = ?", sessionID)
	return err
}

// Maintenance Mode
func (d *DB) GetMaintenance() bool {
	var val string
	err := d.conn.QueryRow("SELECT value FROM settings WHERE key = 'maintenance_mode'").Scan(&val)
	if err != nil {
		return false
	}
	return val == "true" || val == "1"
}

func (d *DB) SetMaintenance(enabled bool) error {
	val := "false"
	if enabled {
		val = "true"
	}
	_, err := d.conn.Exec(`INSERT INTO settings (key, value) VALUES ('maintenance_mode', ?) 
		ON CONFLICT(key) DO UPDATE SET value = ?`, val, val)
	return err
}

// Active Graph
func (d *DB) GetActiveGraph() (*graph.GraphData, []byte, error) {
	var version int
	err := d.conn.QueryRow("SELECT version FROM graph WHERE id = 1").Scan(&version)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, errors.New("belum ada graf aktif")
		}
		return nil, nil, err
	}

	var nodesJSON, edgesJSON, positionsJSON string
	var matrixBlob []byte
	err = d.conn.QueryRow("SELECT nodes_json, edges_json, matrix_blob, COALESCE(positions_json, '{}') FROM graph_versions WHERE version = ?", version).
		Scan(&nodesJSON, &edgesJSON, &matrixBlob, &positionsJSON)
	if err != nil {
		return nil, nil, err
	}

	var nodes []string
	if err := json.Unmarshal([]byte(nodesJSON), &nodes); err != nil {
		return nil, nil, err
	}
	var edges []graph.Edge
	if err := json.Unmarshal([]byte(edgesJSON), &edges); err != nil {
		return nil, nil, err
	}
	var positions map[string]graph.Position
	if err := json.Unmarshal([]byte(positionsJSON), &positions); err != nil {
		positions = make(map[string]graph.Position)
	}

	g := &graph.GraphData{
		Version:   version,
		Nodes:     nodes,
		Edges:     edges,
		Positions: positions,
	}

	return g, matrixBlob, nil
}

func (d *DB) SaveNewGraph(g *graph.GraphData, matrix []byte) (int, error) {
	tx, err := d.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var maxVersion int
	err = tx.QueryRow("SELECT COALESCE(MAX(version), 0) FROM graph_versions").Scan(&maxVersion)
	if err != nil {
		return 0, err
	}
	newVersion := maxVersion + 1

	nodesJSON, err := json.Marshal(g.Nodes)
	if err != nil {
		return 0, err
	}
	edgesJSON, err := json.Marshal(g.Edges)
	if err != nil {
		return 0, err
	}
	positionsJSON, err := json.Marshal(g.Positions)
	if err != nil {
		positionsJSON = []byte("{}")
	}

	_, err = tx.Exec(`INSERT INTO graph_versions (version, node_count, edge_count, nodes_json, edges_json, matrix_blob, positions_json) 
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newVersion, len(g.Nodes), len(g.Edges), string(nodesJSON), string(edgesJSON), matrix, string(positionsJSON))
	if err != nil {
		return 0, err
	}

	_, err = tx.Exec(`INSERT INTO graph (id, version, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP) 
		ON CONFLICT(id) DO UPDATE SET version = ?, updated_at = CURRENT_TIMESTAMP`,
		newVersion, newVersion)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return newVersion, nil
}

func (d *DB) GetGraphVersions() ([]VersionMeta, error) {
	rows, err := d.conn.Query("SELECT version, node_count, edge_count, created_at FROM graph_versions ORDER BY version DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []VersionMeta
	for rows.Next() {
		var vm VersionMeta
		if err := rows.Scan(&vm.Version, &vm.NodeCount, &vm.EdgeCount, &vm.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, vm)
	}
	return list, nil
}

func (d *DB) RollbackGraph(targetVersion int) (int, error) {
	var nodesJSON, edgesJSON, positionsJSON string
	var matrixBlob []byte
	var nodeCount, edgeCount int
	err := d.conn.QueryRow("SELECT node_count, edge_count, nodes_json, edges_json, matrix_blob, COALESCE(positions_json, '{}') FROM graph_versions WHERE version = ?", targetVersion).
		Scan(&nodeCount, &edgeCount, &nodesJSON, &edgesJSON, &matrixBlob, &positionsJSON)
	if err != nil {
		return 0, fmt.Errorf("versi graf target %d tidak ditemukan: %w", targetVersion, err)
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var maxVersion int
	err = tx.QueryRow("SELECT COALESCE(MAX(version), 0) FROM graph_versions").Scan(&maxVersion)
	if err != nil {
		return 0, err
	}
	newVersion := maxVersion + 1

	_, err = tx.Exec(`INSERT INTO graph_versions (version, node_count, edge_count, nodes_json, edges_json, matrix_blob, positions_json) 
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		newVersion, nodeCount, edgeCount, nodesJSON, edgesJSON, matrixBlob, positionsJSON)
	if err != nil {
		return 0, err
	}

	_, err = tx.Exec(`UPDATE graph SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`, newVersion)
	if err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return newVersion, nil
}

// Queue & Requests
func (d *DB) HasActiveOrQueuedRequests() (bool, error) {
	var count int
	err := d.conn.QueryRow("SELECT COUNT(*) FROM requests WHERE status IN ('queued', 'dispatched', 'serving')").Scan(&count)
	return count > 0, err
}

func (d *DB) CountQueuedRequests() (int, error) {
	var count int
	err := d.conn.QueryRow("SELECT COUNT(*) FROM requests WHERE status = 'queued'").Scan(&count)
	return count, err
}

func (d *DB) GetActiveRequestForNode(node string) (*RequestView, error) {
	var rv RequestView
	err := d.conn.QueryRow(`SELECT request_id, node, client_id, status, req_id, created_at, dispatched_at 
		FROM requests 
		WHERE node = ? AND status IN ('queued', 'dispatched', 'serving') 
		LIMIT 1`, node).
		Scan(&rv.RequestID, &rv.Node, &rv.ClientID, &rv.Status, &rv.ReqID, &rv.CreatedAt, &rv.DispatchedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if rv.Status == "queued" {
		pos, _ := d.GetQueuePosition(rv.RequestID)
		rv.QueuePosition = &pos
	}

	return &rv, nil
}

func (d *DB) GetQueuePosition(requestID int64) (int, error) {
	var pos int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM requests 
		WHERE status = 'queued' AND (created_at < (SELECT created_at FROM requests WHERE request_id = ?) 
		OR (created_at = (SELECT created_at FROM requests WHERE request_id = ?) AND request_id <= ?))`,
		requestID, requestID, requestID).Scan(&pos)
	return pos, err
}

func (d *DB) CreateRequest(node, clientID string) (int64, int, error) {
	res, err := d.conn.Exec("INSERT INTO requests (node, client_id, status) VALUES (?, ?, 'queued')", node, clientID)
	if err != nil {
		return 0, 0, err
	}
	reqID, err := res.LastInsertId()
	if err != nil {
		return 0, 0, err
	}
	pos, err := d.GetQueuePosition(reqID)
	return reqID, pos, err
}

func (d *DB) GetRequest(requestID int64) (*RequestView, error) {
	var rv RequestView
	err := d.conn.QueryRow(`SELECT request_id, node, client_id, status, req_id, created_at, dispatched_at 
		FROM requests WHERE request_id = ?`, requestID).
		Scan(&rv.RequestID, &rv.Node, &rv.ClientID, &rv.Status, &rv.ReqID, &rv.CreatedAt, &rv.DispatchedAt)
	if err != nil {
		return nil, err
	}
	if rv.Status == "queued" {
		pos, _ := d.GetQueuePosition(requestID)
		rv.QueuePosition = &pos
	}
	return &rv, nil
}

func (d *DB) GetActiveInFlightRequest() (*RequestView, error) {
	var rv RequestView
	err := d.conn.QueryRow(`SELECT request_id, node, client_id, status, req_id, created_at, dispatched_at 
		FROM requests 
		WHERE status IN ('dispatched', 'serving') 
		ORDER BY dispatched_at ASC LIMIT 1`).
		Scan(&rv.RequestID, &rv.Node, &rv.ClientID, &rv.Status, &rv.ReqID, &rv.CreatedAt, &rv.DispatchedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &rv, nil
}

func (d *DB) GetOldestQueuedRequest() (*RequestView, error) {
	var rv RequestView
	err := d.conn.QueryRow(`SELECT request_id, node, client_id, status, req_id, created_at 
		FROM requests 
		WHERE status = 'queued' 
		ORDER BY created_at ASC, request_id ASC LIMIT 1`).
		Scan(&rv.RequestID, &rv.Node, &rv.ClientID, &rv.Status, &rv.ReqID, &rv.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	pos, _ := d.GetQueuePosition(rv.RequestID)
	rv.QueuePosition = &pos
	return &rv, nil
}

func (d *DB) MarkDispatched(requestID int64, wireReqID int) error {
	_, err := d.conn.Exec("UPDATE requests SET status = 'dispatched', req_id = ?, dispatched_at = CURRENT_TIMESTAMP WHERE request_id = ?",
		wireReqID, requestID)
	return err
}

func (d *DB) UpdateRequestStatus(requestID int64, status string, errorCode, message string) error {
	var err error
	if status == "done" || status == "failed" || status == "cancelled" {
		_, err = d.conn.Exec(`UPDATE requests SET status = ?, error_code = ?, message = ?, completed_at = CURRENT_TIMESTAMP 
			WHERE request_id = ?`, status, errorCode, message, requestID)
	} else {
		_, err = d.conn.Exec(`UPDATE requests SET status = ?, error_code = ?, message = ? WHERE request_id = ?`,
			status, errorCode, message, requestID)
	}
	return err
}

func (d *DB) CancelQueuedRequest(requestID int64) (bool, error) {
	res, err := d.conn.Exec("UPDATE requests SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'queued'", requestID)
	if err != nil {
		return false, err
	}
	rows, err := res.RowsAffected()
	return rows > 0, err
}

func (d *DB) ClearAllQueuedRequests() (int64, error) {
	res, err := d.conn.Exec("UPDATE requests SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE status = 'queued'")
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (d *DB) GetAllActiveQueue() ([]RequestView, error) {
	rows, err := d.conn.Query(`SELECT request_id, node, client_id, status, req_id, created_at, dispatched_at 
		FROM requests 
		WHERE status IN ('queued', 'dispatched', 'serving') 
		ORDER BY CASE status 
			WHEN 'serving' THEN 1 
			WHEN 'dispatched' THEN 2 
			WHEN 'queued' THEN 3 
		END, created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []RequestView
	posCounter := 1
	for rows.Next() {
		var rv RequestView
		if err := rows.Scan(&rv.RequestID, &rv.Node, &rv.ClientID, &rv.Status, &rv.ReqID, &rv.CreatedAt, &rv.DispatchedAt); err != nil {
			return nil, err
		}
		if rv.Status == "queued" {
			p := posCounter
			rv.QueuePosition = &p
			posCounter++
		}
		list = append(list, rv)
	}
	return list, nil
}

// Logs
func (d *DB) AddLog(level, event string, requestID *int64, reqID *int, code, message string) error {
	_, err := d.conn.Exec(`INSERT INTO logs (level, event, request_id, req_id, code, message) 
		VALUES (?, ?, ?, ?, ?, ?)`, level, event, requestID, reqID, code, message)
	return err
}

func (d *DB) GetLogs(limit int) ([]LogEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := d.conn.Query(`SELECT id, ts, level, event, request_id, req_id, code, message 
		FROM logs ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []LogEntry
	for rows.Next() {
		var le LogEntry
		if err := rows.Scan(&le.ID, &le.TS, &le.Level, &le.Event, &le.RequestID, &le.ReqID, &le.Code, &le.Message); err != nil {
			return nil, err
		}
		list = append(list, le)
	}
	return list, nil
}

