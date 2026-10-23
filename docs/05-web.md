# 5. Web Interface & Interaction Strategy

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

Antarmuka web melayani pemanggilan dan visualisasi real-time bagi pengguna melalui integrasi **HTTP**, **Server-Sent Events (SSE)**, dan **MQTT Bridge**.

```text
[ Web Browser Client ]
   |
   +--- (HTTP POST /api/call) ------------> [ Web Server ]
   |<-- (SSE Stream /events) -------------------+ | (MQTT Publish: srv/adam/moveto)
                                                   | v
                                            [ MQTT Broker ]
                                                   |
                                                   | (MQTT Status / Pos / Bat)
                                                   v
                                            [ Robot A.D.A.M ]
```

## 5.1 Halaman Antarmuka Web

1. **Halaman Quick-Call Node (`/cmd/:nodeId`)**:
   * Dioptimalkan untuk **QR Code** yang ditempelkan langsung pada titik fisik/node (misal `/cmd/A`).
   * **1-Click Call Button** untuk memanggil robot ke lokasi node tersebut.
   * Indikator Posisi Real-time Robot, Baterai, & Daftar Antrean (*Queue*) aktif.
2. **Halaman Visualisasi Graf & Peta Interactive (`/map` atau `/viewer`)**:
   * Menampilkan denah graf secara visual (Mode **Read-Only / Non-Editable**).
   * Marker posisi *real-time* robot dan persentase baterai saat ini.
   * **Interactive Click**: Mengklik node mana pun pada canvas/grafik akan memicu panggilan robot ke node tujuan tersebut.
3. **Rate Limiting & Anti-Spam**:
   * Diterapkan di sisi Server API (`POST /api/call`).
   * **Skema**: *Cooldown Window* per Sesi/IP (misal: maksimum 1 permintaan panggilan per 10 detik per pengguna) untuk mencegah *Queue Flooding*.

## 5.2 Stream Real-Time via SSE (`GET /events`)

Server bertindak sebagai **MQTT-to-SSE Bridge** yang mengalirkan pesan telemetri ke seluruh client terhubung:

* **Event `pos_update`**: Mengirimkan lokasi `current_pos` robot.
* **Event `queue_update`**: Mengirimkan isi daftar antrean (*Queue*) saat ini.
* **Event `status_update`**: Mengirimkan status operasional robot (`IDLE`, `MOVING`, `DWELL`, `ERROR`).
* **Event `battery_update`**: Mengirimkan level baterai robot (0 - 100%).
