# Dokumen Spesifikasi Teknis: Project A.D.A.M

**Automated Dustbin And Management (Autonomous Line-Follower AMRs)**

---

## 1. Ringkasan Sistem

**Project A.D.A.M** (*Automated Dustbin And Management*) adalah sistem robot tempat sampah otomatis berbasis *Autonomous Mobile Robot* (AMR). Robot ini bernavigasi menyusuri garis hitam (*line follower*) di area indoor/outdoor tertutup. Navigasi robot dikendalikan oleh algoritma pencarian rute terpendek (**Dijkstra**) yang dieksekusi secara lokal di mikrokontroler robot berdasarkan peta berbobot (*weighted undirected graph*).

---

## 2. Arsitektur Lingkungan & Model Graf

Lingkungan operasional robot direpresentasikan sebagai **Weighted Undirected Graph G = (V, E)**:

* **Node (V)**: Titik persimpangan garis sekaligus lokasi pemberhentian/panggilan robot.
* **Edge (E)**: Lintasan garis hitam yang menghubungkan antar node.
* **Bobot (W)**: Jarak relatif atau estimasi waktu tempuh (nilai rentang 1 sampai 63).
* **Kapasitas Edge**: Maksimal 4 edge per node, sejajar dengan arah mata angin (**Utara, Timur, Selatan, Barat**).

```text
       [Node A] (Home / Initial Node)
          |
  (N=0)   | (Weight = 12)
          v
       [Node B] <--(E=1, W=5)--> [Node C]
```

### 2.1 Enkoding Memory Data Graf (Bit-Packing Matrix)

Peta disimpan dalam bentuk **Matriks 1D Byte Array** berukuran `N x N` byte, di mana `N` adalah total jumlah node. Setiap elemen matriks (1 byte = 8 bit) merepresentasikan hubungan dari Node i ke Node j:

| Position Bit | Panjang Bit | Deskripsi Data | Rentang Nilai |
| :--- | :--- | :--- | :--- |
| **Bit 0 - 5** | 6 bit | Bobot / Weight Lintasan | 1 - 63 (0 = Tidak ada hubungan/edge) |
| **Bit 6 - 7** | 2 bit | Arah Mata Angin (*Direction*) | `00` (Utara), `01` (Timur), `10` (Selatan), `11` (Barat) |

#### Format Byte Matriks:

```text
  Bit 7   Bit 6   Bit 5   Bit 4   Bit 3   Bit 2   Bit 1   Bit 0
+-------+-------+-------+-------+-------+-------+-------+-------+
|  DIR1 |  DIR0 |  WEIGHT5 ...                          WEIGHT0 |
+-------+-------+-------+-------+-------+-------+-------+-------+
|<-- Direction ->|<----------------- Weight ------------------->|
```

> **Aturan Graf Undirected (Anti-Symmetric Direction)**:
>
> Jika A -> B berarah **Utara (`00`)** dengan bobot `W`, maka B -> A secara otomatis disimpan berarah **Selatan (`10`)** dengan bobot `W` yang sama pada matriks.

### 2.2 Deteksi Fisik Persimpangan (Color Marker Sensing)

Untuk membedakan antara jalur lurus biasa dan titik persimpangan/node:

* Setiap titik persimpangan (*Node*) diberi **marka penanda warna khusus** (*Color Marker*) pada lintasan garis hitam.
* Robot menggunakan **Sensor Warna / Color Sensor Module** yang dipasang bersamaan dengan array sensor *line-follower*.
* Deteksi warna persimpangan akan memicu event `NODE_ARRIVED` pada *Task Executor* untuk mengeksekusi logika belokan/pemberhentian.

---

## 3. Booting & Navigasi Orientasi Hadap (Heading Control)

### 3.1 Inisialisasi Booting (Initial State)

Saat robot pertama kali dinyalakan (*power-on / restart*):

* **Posisi Default**: Node **'A'** (Home Node).
* **Arah Hadap Default**: **Utara** (`00` / `NORTH`).
* Status awal robot diatur ke `IDLE`.

### 3.2 Logika Perubahan Orientasi

Robot menyimpan variabel internal `currentHeading` (Utara, Timur, Selatan, Barat). Saat tiba di persimpangan/node, robot menghitung manuver berbelok berdasarkan selisih arah hadap saat ini dengan arah edge tujuan berikutnya:

```text
Delta Direction = (Target Direction - Current Direction) mod 4
```

| Delta Direction | Manuver Robot | Orientasi Hadap Baru |
| :--- | :--- | :--- |
| `0` (0 derajat) | **Lurus** (*Forward*) | Tetap |
| `1` (90 derajat Kanan) | **Belok Kanan** (*Turn Right*) | `(Current + 1) mod 4` |
| `2` (180 derajat) | **Putar Balik** (*U-Turn*) | `(Current + 2) mod 4` |
| `3` (270 derajat / Kiri) | **Belok Kiri** (*Turn Left*) | `(Current + 3) mod 4` |

---

## 4. Dwell Time & Interaksi Tempat Sampah di Node Tujuan

Saat robot tiba di Node tujuan panggilan:

1. **Pembukaan Tutup Sampah**: Motor servo/aktuator membuka tutup sampah otomatis.
2. **Dwell Timer & Sensor Interaksi**:
   * Timer internal (misal: 15 sampai 30 detik) mulai berjalan.
   * Sensor interaksi proximity/IR pada tempat sampah memantau aktivitas pengguna (membuang sampah).
   * **Aturan Reset Timer**: Jika sensor mendeteksi aktivitas pengguna sebelum timer habis, timer akan diperpanjang/di-reset ulang untuk memberi waktu pengguna membuang sampah.
3. **Penyelesaian Task**:
   * Jika **timer habis** dan **tidak ada lagi interaksi** pengguna yang terdeteksi, tempat sampah otomatis menutup.
   * Robot langsung berpindah mengeksekusi tujuan berikutnya di antrean (*Queue*). Jika antrean kosong, robot kembali ke mode `IDLE`.

---

## 5. Web Interface & Interaction Strategy

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

### 5.1 Halaman Antarmuka Web

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

### 5.2 Stream Real-Time via SSE (`GET /events`)

Server bertindak sebagai **MQTT-to-SSE Bridge** yang mengalirkan pesan telemetri ke seluruh client terhubung:

* **Event `pos_update`**: Mengirimkan lokasi `current_pos` robot.
* **Event `queue_update`**: Mengirimkan isi daftar antrean (*Queue*) saat ini.
* **Event `status_update`**: Mengirimkan status operasional robot (`IDLE`, `MOVING`, `FETCHING`, `ERROR`).
* **Event `battery_update`**: Mengirimkan level baterai robot (0 - 100%).

---

## 6. Protokol Komunikasi & API Endpoints

### 6.1 HTTP API Endpoints (Server)

* **`GET /cmd/:nodeId`** (Client Browser -> Server): Rendisi halaman antarmuka QR-Code.
* **`POST /api/call`** (Client Browser -> Server): Memicu panggilan robot (terdampak *Rate Limit*). Server meneruskannya ke topik MQTT `srv/adam/moveto`.
* **`GET /events`** (Client Browser -> Server): Endpoint SSE untuk pembaruan UI secara *real-time*.
* **`POST /save`** (Admin Panel -> Web Server): Menyimpan struktur graf/peta baru (format JSON).
* **`GET /graph`** (Robot -> Web Server): Digunakan oleh Robot A.D.A.M untuk mendownload matriks biner peta langsung ke RAM.

#### Struktur Data Payload `GET /graph` (Binary Stream):

| Byte Ke- | Field Name | Ukuran | Deskripsi |
| :--- | :--- | :--- | :--- |
| **0** | `Map Version` | 1 Byte | Versi integer peta (misal: `0x0C`) |
| **1** | `Total Nodes (N)` | 1 Byte | Jumlah total node dalam graf (`N`) |
| **2 s/d (N^2 + 1)** | `Matrix Data` | `N x N` Byte | Matriks biner 1D berisi *weight* dan *direction*. |

### 6.2 Spesifikasi Topik MQTT

| Topik MQTT | Direction | Payload | QoS | Retain | Deskripsi |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `srv/adam/moveto` | Server -> Robot | `char` (`'A'`, `'B'`, ...) | 1 | False | Memasukkan target node ke antrean (*Queue*). |
| `srv/adam/refreshgraph` | Server -> Robot | *(empty)* | 1 | False | Pemicu (*trigger*) robot melakukan `GET /graph`. |
| `srv/adam/reset` | Server -> Robot | `char` (`'A'`) | 1 | False | Perintah reset Admin untuk mengembalikan robot ke Node A pasca-error. |
| `adam/srv/current_pos` | Robot -> Server | `char` (`'A'`, `'B'`, ...) | 1 | **True** | Telemetri posisi node robot saat ini. |
| `adam/srv/status` | Robot -> Server | `char` (`'I'`, `'M'`, `'F'`, `'E'`) | 1 | **True** | Status robot: `I` (Idle), `M` (Moving), `F` (Fetching), `E` (Error). |
| `adam/srv/battery` | Robot -> Server | `uint8_t` (`0` - `100`) | 1 | **True** | Telemetri daya baterai robot dalam persentase. |
| `adam/srv/error` | Robot -> Server | `String` | 1 | False | Laporan error (contoh: `"LINE_LOST"`, `"NO_PATH"`). |

---

## 7. Arsitektur Firmware (FreeRTOS) & Penanganan Error

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

### 7.1 Alokasi Task & Prioritas

| Task Name | Prioritas | Core Allocation | Responsivitas & Fungsi |
| :--- | :--- | :--- | :--- |
| **`Task Executor`** | **High (3)** | Core 1 | PID Line Follower (100 Hz control loop), pembacaan sensor warna/IR, kontrol motor, dwell timer & sensor interaksi, serta update posisi. |
| **`Task Route Finder`** | Medium (2) | Core 0 | Eksekusi algoritma Dijkstra saat ada item di `Route Queue`. |
| **`Task MQTT`** | Medium (2) | Core 0 | Menangani koneksi socket MQTT, memasukkan perintah ke `Route Queue`, serta mendistribusikan telemetri baterai/status. |
| **`Task Fetch`** | Low (1) | Core 0 | Mengambil data biner dari `GET /graph` dan menyalin langsung ke pointer RAM. |

### 7.2 Strategi Error Handling & Recovery Flow (Admin Reset)

1. **Terjadi Kegagalan di Jalan** (Misal: Garis terputus/hilang):
   * `Task Executor` mendeteksi anomali -> **Motor langsung mati**.
   * Robot berhenti di titik `current_node` terakhir yang berhasil teridentifikasi.
   * `Task Executor` memanggil `xQueueReset(routeQueue)` untuk mengosongkan seluruh sisa antrean (*Queue Flush*).
   * Status robot berubah menjadi `ERROR` (`'E'`), lalu mempublikasikan laporan ke topik `adam/srv/error`.
2. **Prosedur Pemulihan (Error Recovery)**:
   * Robot tetap berada di `current_node` sampai menerima instruksi pemulihan.
   * **Admin Action**: Admin mengecek lokasi fisik robot dan mengirim perintah reset via Admin Panel/MQTT (`srv/adam/reset`).
   * Robot mengeksekusi pencarian rute terpendek dari `current_node` tempat ia berhenti saat ini untuk **kembali ke posisi awal/Home (Node A)** dengan arah hadap **Utara**.
   * Setelah tiba di Node A, status robot di-reset kembali ke `IDLE`.

---

## 8. Roadmap Pengembangan (Phase 2)

* **Obstacle Avoidance & Safety Distance**: Penambahan sensor jarak (Ultrasonic / Time-of-Flight) untuk mendeteksi halangan fisik di lintasan. Robot akan berhenti sementara, membunyikan indikator suara, dan melanjutkan navigasi secara otomatis jika halangan telah berpindah.
