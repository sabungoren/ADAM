# 6. Protokol Komunikasi & API Endpoints

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

## 6.1 HTTP API Endpoints (Server)

| Endpoint | Arah | Status | Deskripsi |
| :--- | :--- | :--- | :--- |
| **`GET /graph.bin`** | Robot → Server | ✅ diimplementasi | Robot A.D.A.M mengunduh matriks biner peta langsung ke RAM. Header membawa metadata, body murni matriks biner. |
| **`POST /save`** | Admin Panel → Server | ✅ diimplementasi | Menyimpan struktur graf/peta baru, lalu memicu robot mengunduh ulang via topik MQTT `srv/adam/refreshgraph`. |
| **`POST /api/call`** | Browser → Server | 🕒 dijadwalkan | Memicu panggilan robot; server meneruskannya ke topik MQTT `srv/adam/moveto`. Terkena *Rate Limit*. |
| **`GET /cmd/:nodeId`** | Browser → Server | 🕒 dijadwalkan | Halaman antarmuka panggil terkait tombol QR-Code di node fisik. |
| **`GET /events`** | Browser → Server | 🕒 dijadwalkan | SSE untuk pembaruan UI secara *real-time* (lihat [docs/05-web.md](05-web.md)). |

### Struktur Response `GET /graph.bin`:

| HTTP Header | Deskripsi |
| :--- | :--- |
| **`Content-Type: application/octet-stream`** | Body adalah stream biner matriks (`N x N` byte: *weight* di bit 2-7, *direction* di bit 0-1 — lihat [docs/02-graph.md](02-graph.md)). |
| **`X-Graph-Version`** | Versi integer peta (misal: `1`). |
| **`X-Graph-Nodes`** | Jumlah total node dalam graf (`N`), ukuran matriks `N x N`. |
| **`X-Graph-Edge-Count`** | Jumlah edge pada graf. |

### Format Body `POST /save`

Body JSON berisi satu field `text` dengan format teks per baris: `<Dari> <Tujuan> <Bobot> <Arah>`, contoh:

```json
{ "text": "A B 12 N\nB C 5 E\nB A 12 S" }
```

Server memvalidasi aturan graf (anti-simetris arah, maksimal satu edge per arah mata angin per node), menyimpan sebagai JSON, menaikkan `X-Graph-Version`, dan mem-publish `srv/adam/refreshgraph`.

## 6.2 Spesifikasi Topik MQTT (Wire Format 1 Byte)

### Prinsip Wire Format

* Payload perintah & telemetri adalah **biner mentah (raw bytes)**, bukan teks. MQTT dijalankan mesin-ke-mesin tanpa pembaca manusia, sehingga tidak ada biaya *encode/decode* string di robot dan perubahan state cukup satu assignment byte.
* Nama kode tetap disediakan untuk **log serial** (`err_name()` di `executor.c`) dan untuk **UI web** — konversi enum → nama terjadi satu kali di server/frontend (`protocol.ts`), bukan di robot.
* **Kode bersifat append-only**: nilai yang sudah dirilis tidak pernah diubah; kode baru ditambahkan di akhir tabel; `0` selalu berarti `NONE/UNKNOWN`; penerima wajib **mengabaikan kode yang tidak dikenal**, bukan crash.
* `current_pos` dan `moveto` memakai **ASCII huruf node** (`'A'`, `'B'`, ...) karena node memang beridentitas huruf sejak boot — tetap 1 byte dan sekaligus masih terbaca saat debug di konsol broker.

### Tabel Topik

| Topik MQTT | Direction | Payload | QoS | Retain | Deskripsi |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `srv/adam/moveto` | Server → Robot | 1 byte ASCII (`'A'`, `'B'`, ...) | 1 | False | Memasukkan target node ke antrean (*Queue*). |
| `srv/adam/reset` | Server → Robot | *(kosong)* | 1 | False | Admin reset: robot kembali ke Home Node `A` dengan arah hadap Utara (spesifikasi 7.2). |
| `srv/adam/refreshgraph` | Server → Robot | *(kosong)* | 1 | False | Trigger robot melakukan `GET /graph.bin`. |
| `adam/srv/current_pos` | Robot → Server | 1 byte ASCII (`'A'`, `'B'`, ...) | 1 | **True** | Telemetri posisi node robot saat ini. |
| `adam/srv/status` | Robot → Server | 1 byte kode status | 1 | **True** | Status operasional robot (tabel di bawah). |
| `adam/srv/battery` | Robot → Server | 1 byte (`0`–`100`) | 1 | **True** | Persentase daya baterai; `100` maksimum. |
| `adam/srv/error` | Robot → Server | 1 byte kode error | 1 | False | Laporan alasan robot masuk state ERROR (tabel di bawah). |

### Kode `adam/srv/status`

| Kode (hex) | Nama | Arti |
| :--- | :--- | :--- |
| `0x00` | `IDLE` | Menunggu target / antrean kosong |
| `0x01` | `MOVING` | Menyusuri garis antar node |
| `0x02` | `DWELL` | Berhenti di node tujuan (dwell, spesifikasi 4) |
| `0x03` | `ERROR` | Berhenti, menunggu admin reset |

> Kode `0x04` (`OBSTACLE`) ada di firmware tetap **internal only — tidak pernah di-publish**: pengereman halangan tidak mengubah status jaringan (lihat [docs/07-firmware.md](07-firmware.md)).

### Kode `adam/srv/error`

| Kode (hex) | Nama | Arti |
| :--- | :--- | :--- |
| `0x00` | `NONE` | Tidak ada error (*tidak di-publish*) |
| `0x01` | `NO_PATH` | Tidak ada rute valid ke target (graf kosong/rusak, edge hilang) |
| `0x02` | `LINE_LOST` | Kelima sensor garis BFD-1000 kosong > threshold (spec 7.2) |
| `0x03` | `NODE_TIMEOUT` | Tahap menuju node berikutnya tidak selesai dalam waktu batas (spec 7.2) |

### Contoh Byte di Broker

```text
srv/adam/moveto      payload 0x43          -> target node 'C'
adam/srv/status      payload 0x02          -> DWELL
adam/srv/error       payload 0x01          -> NO_PATH
adam/srv/battery     payload 0x57          -> 87%
```

### Referensi Implementasi

Firmware: `src/mqtt.h` (enum `adam_status_t`, `adam_error_t`), `src/executor.c` (menerbitkan kode). Frontend (rencananya): `src/lib/protocol.ts` memetakan kode → nama untuk UI.
