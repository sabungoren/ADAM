# Project A.D.A.M

**Automated Dustbin And Management** — sistem robot tempat sampah otomatis berbasis *Autonomous Mobile Robot* (AMR). Robot bernavigasi menyusuri garis hitam (*line follower*) di area indoor tertutup, mencari rute terpendek dengan **Dijkstra** yang dijalankan langsung di mikrokontroler berdasarkan peta berbobot (*weighted undirected graph*).

## Fitur Utama

* **Navigasi otonom**: Dijkstra lokal di ESP32, peta graf berbobot dengan arah mata angin (max 4 edge per node, 1 edge per arah).
* **Pemanggilan via web**: halaman panggil cepat per node (QR Code di titik fisik), visualisasi peta real-time.
* **Telemetri MQTT**: posisi, status robot, baterai, dan kapasitas sampah — wire format biner 1 byte per pesan.
* **Error & recovery**: deteksi garis hilang/step timeout → motor berhenti, menunggu admin reset (robot kembali ke Home menghadap Utara).
* **Interaksi tempat sampah**: sensor IR tangan di dekat bukaan memperpanjang dwell timer; servo membuka/menutup tutup otomatis.

## Arsitektur Tingkat Tinggi

```text
[ Web Browser Client ]
   |
   +--- (HTTP POST /save, POST /api/call) -> [ Web Server ]
   |<-- (SSE Stream /events) ----------------+
                                             | (MQTT Publish: srv/adam/moveto)
                                             v
                                      [ MQTT Broker ]
                                             |
                                             | (MQTT Status / Pos / Battery / Trash, 1 byte biner)
                                             v
                                       [ Robot A.D.A.M ] --GET /graph.bin--> [ Web Server ]
```

## Dokumentasi Teknis

| Dokumen | Isi |
| :--- | :--- |
| [docs/02-graph.md](docs/02-graph.md) | Model graf berbobot, aturan edge, bit-packing matrix, deteksi node |
| [docs/03-navigation.md](docs/03-navigation.md) | Boot state, heading control, tabel manuver belokan |
| [docs/04-dwell.md](docs/04-dwell.md) | Dwell time & interaksi tempat sampah di node tujuan |
| [docs/05-web.md](docs/05-web.md) | Halaman web, rate limiting, stream real-time via SSE |
| [docs/06-protokol.md](docs/06-protokol.md) | HTTP API + wire format MQTT (kode status/error, QoS, retain) |
| [docs/07-firmware.md](docs/07-firmware.md) | Task FreeRTOS, prioritas/core, error handling & recovery |
| [docs/08-pins.md](docs/08-pins.md) | Pemetaan pin: motor L298N, sensor garis/warna/IR tangan/ultrasonik, servo, ADC baterai |
| [docs/09-roadmap.md](docs/09-roadmap.md) | Pengembangan Phase 2 |
