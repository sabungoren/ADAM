package mqtt

import (
	"log"
	"net"

	mqttserver "github.com/mochi-mqtt/server/v2"
	"github.com/mochi-mqtt/server/v2/hooks/auth"
	"github.com/mochi-mqtt/server/v2/listeners"
)

type EmbeddedBroker struct {
	server *mqttserver.Server
}

func StartEmbeddedBroker() (*EmbeddedBroker, error) {
	// Check if port 1883 is already in use
	ln, err := net.Listen("tcp", "127.0.0.1:1883")
	if err != nil {
		log.Printf("[MQTT Broker] Port 1883 sudah digunakan oleh layanan eksternal (misal: Mosquitto). Melewati embedded broker.")
		return nil, nil
	}
	ln.Close()

	server := mqttserver.New(nil)

	// Allow all connections in embedded dev mode
	_ = server.AddHook(new(auth.AllowHook), nil)

	// TCP Listener for MQTT
	tcp := listeners.NewTCP(listeners.Config{
		ID:      "tcp-1883",
		Address: "0.0.0.0:1883",
	})
	if err := server.AddListener(tcp); err != nil {
		log.Printf("[MQTT Broker] Gagal menambahkan TCP listener: %v", err)
		return nil, err
	}

	// WebSocket Listener on 8083 as defined in docs/10-deployment.md
	wsLn, err := net.Listen("tcp", "0.0.0.0:8083")
	if err == nil {
		wsLn.Close()
		ws := listeners.NewWebsocket(listeners.Config{
			ID:      "ws-8083",
			Address: "0.0.0.0:8083",
		})
		_ = server.AddListener(ws)
	}

	go func() {
		log.Println("[MQTT Broker] Memulai Embedded MQTT Broker pada 0.0.0.0:1883 & ws 0.0.0.0:8083...")
		if err := server.Serve(); err != nil {
			log.Printf("[MQTT Broker] Server dihentikan: %v", err)
		}
	}()

	return &EmbeddedBroker{server: server}, nil
}

func (b *EmbeddedBroker) Close() error {
	if b != nil && b.server != nil {
		return b.server.Close()
	}
	return nil
}

