package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"adam-backend/internal/db"

	"golang.org/x/crypto/bcrypt"
)

const SessionCookieName = "adam_session"

type AuthHandler struct {
	database *db.DB
}

func NewAuthHandler(database *db.DB) *AuthHandler {
	return &AuthHandler{database: database}
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Metode tidak diizinkan", http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Format JSON tidak valid"})
		return
	}

	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Email dan password wajib diisi"})
		return
	}

	admin, err := h.database.GetAdminByEmail(req.Email)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Email atau password salah"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Email atau password salah"})
		return
	}

	// Create session
	sessionBytes := make([]byte, 16)
	tokenBytes := make([]byte, 32)
	_, _ = rand.Read(sessionBytes)
	_, _ = rand.Read(tokenBytes)

	sessionID := hex.EncodeToString(sessionBytes)
	token := hex.EncodeToString(tokenBytes)

	if err := h.database.CreateSession(sessionID, token, admin.ID, 7*24*time.Hour); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Gagal membuat sesi"})
		return
	}

	// Set cookie: sessionID:token
	cookieVal := sessionID + ":" + token
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    cookieVal,
		Path:     "/",
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true,
		Secure:   false, // Set true in production behind HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"admin": map[string]interface{}{
			"id":    admin.ID,
			"email": admin.Email,
		},
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(SessionCookieName)
	if err == nil {
		parts := strings.Split(cookie.Value, ":")
		if len(parts) == 2 {
			_ = h.database.DeleteSession(parts[0])
		}
	}

	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	admin := h.getAdminFromRequest(r)
	if admin == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Belum login"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"authenticated": true,
		"admin": map[string]interface{}{
			"id":    admin.ID,
			"email": admin.Email,
		},
	})
}

func (h *AuthHandler) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		admin := h.getAdminFromRequest(r)
		if admin == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Akses admin diperlukan"})
			return
		}
		next(w, r)
	}
}

func (h *AuthHandler) getAdminFromRequest(r *http.Request) *db.Admin {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil
	}

	parts := strings.Split(cookie.Value, ":")
	if len(parts) != 2 {
		return nil
	}

	sessionID, token := parts[0], parts[1]
	admin, err := h.database.ValidateSession(sessionID, token)
	if err != nil {
		return nil
	}

	return admin
}

