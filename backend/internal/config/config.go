package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port          int
	Host          string
	DatabasePath  string
	MQTTBroker    string
	MQTTUsername  string
	MQTTPassword  string
	AdminEmail    string
	AdminPassword string
	SessionSecret string
	CorsOrigin    string
	EmbeddedMQTT  bool
}

func LoadConfig() *Config {
	loadDotEnv(".env")

	cfg := &Config{
		Port:          getEnvInt("PORT", 5194),
		Host:          getEnv("HOST", "0.0.0.0"),
		DatabasePath:  getEnv("DATABASE_PATH", "./data/adam.db"),
		MQTTBroker:    getEnv("MQTT_BROKER", "mqtt://127.0.0.1:1883"),
		MQTTUsername:  getEnv("MQTT_USERNAME", "gateway"),
		MQTTPassword:  getEnv("MQTT_PASSWORD", "adam_secret_password"),
		AdminEmail:    getEnv("ADMIN_EMAIL", "smartadam@smartadam.my.id"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "smartadam"),
		SessionSecret: getEnv("SESSION_SECRET", "adam_super_secret_session_key_2026"),
		CorsOrigin:    getEnv("CORS_ORIGIN", "http://localhost:5193"),
		EmbeddedMQTT:  getEnvBool("EMBEDDED_MQTT", true),
	}

	return cfg
}

func loadDotEnv(filepath string) {
	file, err := os.Open(filepath)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`)
			if os.Getenv(key) == "" {
				os.Setenv(key, val)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return
	}
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getEnvInt(key string, defaultVal int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvBool(key string, defaultVal bool) bool {
	if val := os.Getenv(key); val != "" {
		val = strings.ToLower(val)
		return val == "true" || val == "1" || val == "yes"
	}
	return defaultVal
}

