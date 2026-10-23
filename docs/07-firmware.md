# 7. Arsitektur Firmware (FreeRTOS) & Penanganan Error

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

Firmware dijalankan menggunakan Sistem Operasi Real-Time (**FreeRTOS**) pada mikrokontroler multi-core (misal ESP32).

```text
                   +-------------------+
                   |   Task MQTT       |
                   +---------+---------+
                             |
         +-------------------+-------------------+
         | (Target Node)                         | (Refresh Signal)
         v                                       v
+-------------------+                   +-------------------+
| Task Route Finder |                   |    Task Fetch     |
+--------+----------+                   +--------+----------+
         |                                       |
    (Path Array)                           (Direct Copy)
         v                                       v
+-------------------+                   +-------------------+
|   Task Executor   |==================>|   RAM Graph Data  |
+-------------------+  (Read Matrix)    +-------------------+
```

## 7.1 Alokasi Task & Prioritas

| Task Name | Prioritas | Core Allocation | Responsivitas & Fungsi |
| :--- | :--- | :--- | :--- |
| **`Task Executor`** | **High (3)** | Core 1 | PID Line Follower (100 Hz control loop), pembacaan sensor garis/warna, kontrol motor, dwell timer & sensor interaksi, serta update posisi. |
| **`Task Route Finder`** | Medium (2) | Core 0 | Eksekusi algoritma Dijkstra saat ada item di `Route Queue`. |
| **`Task MQTT`** | Medium (2) | Core 0 | Menangani koneksi socket MQTT (keepalive 30 s, clean session off agar command QoS 1 tidak hilang saat robot disconnect), memasukkan perintah ke `Route Queue`, serta mempublikasikan telemetri baterai/status/posisi berkala. |
| **`Task Fetch`** | Low (1) | Core 0 | Mengambil data biner dari `GET /graph.bin` (tunggu WiFi dapat IP dulu) dan menyalin langsung ke pointer RAM. |

## 7.2 Strategi Error Handling & Recovery Flow (Admin Reset)

1. **Terjadi Kegagalan di Jalan** (garis lepas: `LINE_LOST`, atau step menggantung: `NODE_TIMEOUT`):
   * `Task Executor` mendeteksi anomali → **Motor langsung mati**.
   * Robot berhenti di titik `current_node` terakhir yang berhasil teridentifikasi.
   * `Task Executor` mengosongkan seluruh antrean (*Queue Flush*) — sisa rute dan command `moveto` dibuang.
   * Robot mem-publish kode error 1 byte ke `adam/srv/error` dan status berubah menjadi `ERROR` (`0x03`, lihat [docs/06-protokol.md](06-protokol.md)).
2. **Prosedur Pemulihan (Error Recovery)**:
   * Robot tetap berada di `current_node` sampai menerima instruksi pemulihan.
   * **Admin Action**: Admin mengecek lokasi fisik robot dan mengirim perintah reset via Admin Panel/MQTT (`srv/adam/reset`).
   * Robot mengeksekusi pencarian rute terpendek dari `current_node` tempat ia berhenti saat ini untuk **kembali ke posisi awal/Home (Node A)** dengan arah hadap **Utara**.
   * Setelah tiba di Node A, status robot di-reset kembali ke `IDLE`.

## 7.3 Catatan Perilaku Khusus Task Executor

* **Pengereman halangan (`OBSTACLE`) bersifat internal**: sensor jarak menghentikan motor sementara, dan begitu jalan bebas robot melanjutkan rute — status jaringan tidak berubah (kode `OBSTACLE` tidak pernah di-publish).
* **Anti false-arrival**: setelah tiba di satu node, persimpangan harus menghilang dari pandangan sensor sebelum node berikutnya boleh terdeteksi (mencegah deteksi dobel di node yang sama).
