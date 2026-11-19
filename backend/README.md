# Project A.D.A.M - Backend Gateway (Golang)

Gateway server dan bridge MQTT untuk mengorkestrasi armada robot *Autonomous Mobile Robot (AMR)* tempat sampah otomatis.

## Fitur Utama
* **REST API & SSE**: Endpoint `/api/call`, `/save`, `/graph.bin`, `/events` (Server-Sent Events untuk streaming telemetri).
* **Database SQLite WAL**: Persistensi akun admin, sesi login, graf, antrean FIFO, dan log audit di `data/adam.db`.
* **MQTT Gateway Client**: Berkomunikasi langsung dengan robot melalui topik MQTT biner (`srv/adam/moveto`, `adam/srv/*`).
* **Embedded MQTT Broker**: Menyediakan broker MQTT lokal bawaan (port 1883 & ws 8083) sehingga sistem dapat langsung berjalan tanpa perlu install Mosquitto terpisah di lingkungan dev.
* **Simulator Robot**: Memungkinkan pengujian menyeluruh (*end-to-end testing*) tanpa perlu perangkat keras fisik menyala.

## Konfigurasi (`.env`)
```ini
PORT=5194
HOST=0.0.0.0
DATABASE_PATH=./data/adam.db
MQTT_BROKER=mqtt://127.0.0.1:1883
MQTT_USERNAME=gateway
MQTT_PASSWORD=adam_secret_password
ADMIN_EMAIL=smartadam@smartadam.my.id
ADMIN_PASSWORD=smartadam
SESSION_SECRET=adam_super_secret_session_key_2026
CORS_ORIGIN=http://localhost:5193
EMBEDDED_MQTT=true
```

## Menjalankan Server
```bash
go run main.go
# Atau jalankan binary yang sudah di-compile:
./adam-gateway.exe
```
Server akan aktif di `http://localhost:5194`.

