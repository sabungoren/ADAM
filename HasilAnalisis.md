# LAPORAN ANALISIS SISTEM, KEPUTUSAN ARSITEKTUR, DAN TELAAH SPESIFIKASI TEKNIS
## Proyek Ujian Akhir Semester Mata Kuliah Internet of Things (IoT)
### Sistem Smart ADAM (Autonomous Dustbin And Management) - Kelompok 1

---

### Informasi Kelompok & Proyek
* **Kelompok:** Kelompok 1 (Kelas IoT 24E)
* **Judul Proyek:** Smart ADAM (Autonomous Dustbin And Management)
* **Anggota Kelompok (8 Mahasiswa):**
  1. Adam Rahmatulloh
  2. M Ilham Jazuli
  3. M Thoriq Dhiyaul Haq
  4. M Anwar Ismail
  5. A Hisyammuddin
  6. A Shobrun Jamil
  7. Ramzi Pandu Ma'arif
  8. M Jazaul Aufi
* **Platform Kontroler:** ESP32 Development Board (Dual Core 240 MHz, Wi-Fi & Bluetooth)
* **Inventaris Alat dan Bahan (Lengkap & Terverifikasi):**
  - ESP32 Development Board
  - Breadboard
  - Kabel Jumper Male-to-Male & Male-to-Female
  - Sensor Line Follower IR 3–5 Channel
  - Sensor Ultrasonik HC-SR04
  - Sensor IR Obstacle FC-51
  - Motor DC Gearbox + Roda (4 set)
  - Driver Motor DC L298N
  - Sasis Robot 4 Roda
  - Servo Motor SG90 / MG995
  - Baterai Li-ion 18650 (2-3 Slot) + Holder Baterai
  - Sensor Warna RGB TCS3200

---

## 1. Konsensus Tim dan Klarifikasi Dokumen `spec.md`

Berdasarkan diskusi internal kelompok, telah disepakati klarifikasi penting mengenai pembagian ruang lingkup proyek:

> **Klarifikasi Ruang Lingkup:**
> Dokumen `spec.md` dirancang secara spesifik sebagai **Subsistem Navigasi & Mobilitas Robot (Robot Motion Engine)**, yaitu bagaimana robot bergerak di atas garis, membaca graf lintasan, dan bernavigasi secara mandiri di mikrokontroler. 
> Dokumen tersebut sengaja **tidak mencakup seluruh sistem aplikasi** agar arsitektur database cloud dan pertukaran data IoT tetap **sangat ringan (Ultra-Lightweight Database)**, hemat memori RAM pada ESP32, dan tidak membebani kuota jaringan Wi-Fi saat demonstrasi di kelas.

Seluruh anggota kelompok menyetujui pembagian modular ini dengan pendekatan **Decoupled System Architecture** (Pemisahan Tanggung Jawab antar Modul):

```
+---------------------------------------------------------------------------------------+
|                                ARSITEKTUR TERPADU SMART ADAM                          |
+---------------------------------------------------------------------------------------+
|  [ MODUL 1: FRONTEND WEB & USER ]  <───>  [ MODUL 2: LIGHTWEIGHT IOT DATABASE ]       |
|  - 3 Profil User (Hijau, Biru, Kuning)    - Format Data Ringkas (1 - 4 Byte Payload)  |
|  - Dashboard 3 Tombol Utama               - Antrean Panggilan FIFO Sederhana          |
|  - Tombol Deteksi Volume Sampah           - Bridge MQTT / REST API Minimalis          |
+---------------------------------------------------------------------------------------+
                                        │
                                        │ (WiFi Socket: MQTT / Telemetri Ringkas)
                                        ▼
+---------------------------------------------------------------------------------------+
|                           [ MODUL 3 & 4: ROBOT HARDWARE & FIRMWARE ]                  |
|  [ MODUL 3: MOTION ENGINE (spec.md) ]       [ MODUL 4: DUSTBIN & SENSING ]            |
|  - Navigasi Graf & Dijkstra Lokal (RAM)     - HC-SR04 Deteksi Tangan (Servo Buka)     |
|  - PID Line Follower di FreeRTOS Core 1     - HC-SR04 Internal Ukur Volume Sampah     |
|  - Sensor TCS3200 Deteksi Marka Stasiun     - FC-51 Anti-Tabrak (Safety Stop Lokal)   |
+---------------------------------------------------------------------------------------+
```

---

## 2. Desain Database Ultra-Ringan (Lightweight Database Strategy)

Sesuai kesepakatan kelompok agar database sesederhana dan seringan mungkin, sistem menghindari query relasional yang kompleks atau struktur JSON bersarang (*deeply nested*).

### 2.1 Mengapa Database Menjadi Jauh Lebih Ringan?
1. **Graf Peta Disimpan Lokal di RAM ESP32:** Struktur lintasan (bobot edge dan arah mata angin) tidak disimpan atau di-query berulang kali ke database. Database cloud hanya perlu tahu kode node tujuan (misal: `'B'`, `'C'`, atau `'D'`). Komputasi rute Dijkstra diselesaikan 100% di dalam mikrokontroler ESP32.
2. **Ukuran Payload Sangat Kecil (1 s.d. 4 Byte):** Menggunakan karakter tunggal atau nilai integer sederhana (misal status `'I'`, `'M'`, `'F'`, `'E'`, level sampah `0`–`100`).
3. **Pemberhentian Darurat Bersifat Lokal:** Sensor anti-tabrak FC-51 memutus aliran PWM motor langsung di firmware tanpa perlu menunggu perintah dari server/database.

### 2.2 Skema Data Ringkas (Minimalist State Machine)

Hanya terdapat 3 entitas data sederhana di database/broker:

#### A. Status Robot (`robot_state`) &mdash; Ukuran: ~40 Byte
```json
{
  "pos": "A",
  "status": "I",
  "trash": 32,
  "bat": 85
}
```
*Keterangan Field:*
* `pos`: Lokasi node saat ini (`'A'` = Home, `'B'` = User 1, `'C'` = User 2, `'D'` = User 3).
* `status`: Kondisi operasional (`'I'` = Idle, `'M'` = Moving, `'F'` = Fetching/Serving, `'E'` = Error, `'O'` = Obstacle).
* `trash`: Persentase kapasitas sampah (0 s.d. 100%).
* `bat`: Persentase baterai robot (0 s.d. 100%).

#### B. Antrean Panggilan (`call_queue`) &mdash; Ukuran: ~15 Byte
Antrean ringkas berupa array karakter node tujuan dengan aturan FIFO (*First-In, First-Out*):
```json
{
  "queue": ["B", "C"]
}
```

#### C. Master Pengguna (`users`) &mdash; Bersifat Statis di Sisi Frontend Web
Data pengguna disimpan langsung di sisi client (Local Web Storage / Config File Frontend), sehingga tidak membebani pembacaan ke cloud database.

---

## 3. Analisis dan Argumen: Pemilihan Jumlah User (2 User vs 3 User)

Dosen pembimbing sebelumnya menyarankan **2 User**, namun tim kelompok telah sepakat menerapkan **3 User**. Berikut adalah landasan argumen teknisnya:

### 3.1 Evaluasi Komparatif

| Parameter Evaluasi | Opsi 2 User (Saran Dosen) | Opsi 3 User (Kesepakatan Tim) |
| :--- | :--- | :--- |
| **Korelasi dengan Graf `spec.md`** | Kurang optimal. Graf hanya 3 node (Home, User 1, User 2), rute Dijkstra terlalu sepele. | **Sangat Sesuai**. Membentuk graf 4 node (A = Home, B = User 1, C = User 2, D = User 3) yang mendemonstrasikan algoritma Dijkstra secara nyata. |
| **Fungsi Sensor Warna TCS3200** | Rendah. Membedakan 2 titik henti cukup menggunakan sensor garis biasa (counting intersection). | **Fungsional Penuh**. Membaca 3 warna spesifik marka stasiun: Hijau (User 1), Biru (User 2), dan Kuning/Merah (User 3). |
| **Beban Kueri Database** | Sangat ringan. | **Tetap Sangat Ringan**. Menggunakan antrean karakter tunggal (`["B", "C", "D"]`) dengan selisih beban memori kurang dari 10 byte. |
| **Proporsionalitas 8 Anggota** | Terlalu sederhana untuk tim beranggotakan 8 mahasiswa. | **Tepat dan Seimbang**. Beban kerja firmware, hardware, backend, web, dan mekanik terbagi merata. |
| **Strategi Mitigasi (Fallback Plan)** | Tidak ada tantangan teknis. | Jika saat demo arena fisik kelas sempit, User 3 dapat di-disable dari web menjadi 2 User tanpa mengubah kode robot. |

### 3.2 Pemetaan Identitas Pengguna & Node Graf

| Label User | ID Pengguna | Node Graf (`spec.md`) | Warna Dashboard & Hex | Lokasi Stasiun | Marka Fisik Lantai (TCS3200) |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **User 1** | `USR-01` | **Node B** | **Hijau Emerald** (`#10B981`) | Meja Alpha (Sisi Kiri) | Pita Warna Hijau |
| **User 2** | `USR-02` | **Node C** | **Biru Laut** (`#3B82F6`) | Meja Beta (Sisi Tengah) | Pita Warna Biru |
| **User 3** | `USR-03` | **Node D** | **Kuning Amber** (`#F59E0B`) | Meja Gamma (Sisi Kanan) | Pita Warna Kuning / Merah |
| *Home Base* | `BASE-00` | **Node A** | Abu-Abu Netral (`#6B7280`) | Titik Parkir Utama | Garis Hitam Melintang Tebal |

---

## 4. Analisis Antarmuka Website Frontend

### 4.1 Desain Dashboard dan 3 Tombol Utama

Dashboard dirancang bersih, intuitif, dan responsif dengan status telemetri yang diperbarui secara langsung melalui koneksi ringan (SSE / WebSocket):

```text
+-----------------------------------------------------------------------------------------+
|                              SMART ADAM - IOT CONTROL PANEL                             |
|  Koneksi: [ONLINE]  |  Posisi: [Node A - HOME]  |  Baterai: [85%]  |  Level Tong: [32%] |
+-----------------------------------------------------------------------------------------+
|  PROFIL AKTIF:   [ (1) USR-01 (Hijau) ]   [*(2) USR-02 (Biru)*]   [ (3) USR-03 (Kuning) ]|
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|    +--------------------------+       +--------------------------+                      |
|    |  [TOMBOL 1]              |       |  [TOMBOL 2]              |                      |
|    |  PANGGIL ADAM KE SINI    |       |  SELESAI & KEMBALI BASE  |                      |
|    |  (Aksen Warna User Aktif)|       |  (Kirim Pulang ke Home)  |                      |
|    +--------------------------+       +--------------------------+                      |
|                                                                                         |
|    +-------------------------------------------------------------+                      |
|    |  [TOMBOL 3] DETEKSI VOLUME SAMPAH REAL-TIME                 |                      |
|    |  (Memicu pembacaan ultrasonik & pembaruan kapasitas tong)   |                      |
|    +-------------------------------------------------------------+                      |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
|  STATUS SISTEM:                                                                         |
|  - Kapasitas Wadah : [========>                         ] 32% (Status: AMAN)            |
|  - Rintangan Depan : [TIDAK ADA HALANGAN]                                               |
|  - Antrean Panggilan: 1. USR-02 (Sedang dilayani)  |  2. USR-01 (Menunggu)              |
+-----------------------------------------------------------------------------------------+
```

### 4.2 Logika Operasional 3 Tombol Dashboard

1. **Tombol 1 &mdash; Panggil ADAM ke Sini:**
   * Mengirim target node stasiun pengguna aktif (contoh: `'C'` untuk User 2) ke database antrean.
   * Tombol otomatis menampilkan status *Queued* jika robot sedang bergerak menuju stasiun lain.
   * Berwarna sesuai identitas user aktif (Hijau/Biru/Kuning).

2. **Tombol 2 &mdash; Selesai & Kembali ke Home Base:**
   * Digunakan saat pengguna selesai membuang sampah sebelum *dwell timer* habis.
   * Servo tempat sampah segera menutup rapat, dan robot melanjutkan ke stasiun berikutnya di antrean atau pulang ke Node A (Home).

3. **Tombol 3 &mdash; Deteksi Volume Sampah Real-Time:**
   * Memicu pembacaan instan (*on-demand*) sensor ultrasonik internal wadah sampah.
   * Bilah kapasitas terbagi menjadi 3 indikator visual:
     * **0% s.d. 50% (Hijau):** Kapasitas aman.
     * **51% s.d. 80% (Kuning):** Kapasitas mendekati penuh.
     * **> 80% (Merah):** Peringatan sampah penuh (Panggilan robot dikunci sementara di dashboard hingga bak sampah dikosongkan).

---

## 5. Rincian Subsistem Hardware dan Navigasi Robot

### 5.1 Integrasi Spesifikasi `spec.md` (Motion Engine)
* **Graf Undirected Berbobot:** Graf 4 node direpresentasikan dalam matriks biner 1D ringkas di RAM ESP32 (1 byte per relasi: 2 bit arah mata angin + 6 bit bobot jarak).
* **Algoritma Dijkstra Lokal:** Saat ada node tujuan baru di antrean, `Task Route Finder` (Core 0 FreeRTOS) menghitung rute terpendek dalam hitungan milidetik.
* **Kendali Jalur Berbasis PID & Garis:** `Task Executor` (Core 1 FreeRTOS, loop 100 Hz) mengatur PWM motor DC L298N agar robot tetap stabil di atas garis hitam.
* **Deteksi Titik Henti Stasiun:** Sensor TCS3200 memvalidasi warna pita di persimpangan lantai untuk memastikan robot telah tiba di stasiun pemanggil yang benar.

### 5.2 Subsistem Tempat Sampah & Pengaman Halangan (Dustbin & Safety)
* **Buka-Tutup Tutup Otomatis (HC-SR04 Eksternal):** Mendeteksi keberadaan tangan pengguna pada jarak < 15 cm. Servo membuka tutup 90° dan memulai *dwell timer* (15 detik). Jika ada gerakan tangan lagi, timer di-reset otomatis.
* **Pengukuran Volume Sampah (HC-SR04 Internal):** Ditempatkan di bawah tutup bagian dalam, memancarkan gelombang suara ke tumpukan sampah untuk menghitung persentase volume terisi.
* **Anti-Tabrak Seketika (Sensor FC-51):** Dipasang di bagian depan sasis robot. Saat mendeteksi benda/kaki pada jarak < 10 cm, sensor langsung memutus daya motor via interupsi digital lokal untuk mencegah tabrakan fisik.

---

## 6. Pemetaan Pinout GPIO ESP32 dan Manajemen Daya

Berikut adalah pemetaan pin lengkap pada papan ESP32 (38-pin version):

| Modul / Komponen | Pin Sinyal Modul | Pin GPIO ESP32 | Mode Operasi | Fungsi Utama |
| :--- | :--- | :---: | :--- | :--- |
| **Driver Motor L298N** | ENA (PWM Motor Kiri) | `GPIO 14` | Output (LEDC) | Pengatur kecepatan motor kiri |
| | IN1 & IN2 (Arah Kiri) | `GPIO 27`, `GPIO 26` | Output Digital | Logika arah maju/mundur roda kiri |
| | ENB (PWM Motor Kanan) | `GPIO 32` | Output (LEDC) | Pengatur kecepatan motor kanan |
| | IN3 & IN4 (Arah Kanan) | `GPIO 25`, `GPIO 33` | Output Digital | Logika arah maju/mundur roda kanan |
| **Sensor Line Follower** | Sensor Kiri (IR 1) | `GPIO 34` | Input Digital | Deteksi garis sisi kiri |
| | Sensor Tengah (IR 2) | `GPIO 35` | Input Digital | Pemandu garis tengah |
| | Sensor Kanan (IR 3) | `GPIO 39` (VN) | Input Digital | Deteksi garis sisi kanan |
| **Sensor Warna TCS3200** | S0, S1 (Frekuensi) | `GPIO 19`, `GPIO 18` | Output Digital | Pengaturan penskalaan frekuensi |
| | S2, S3 (Filter Warna) | `GPIO 5`, `GPIO 17` | Output Digital | Pemilihan filter Merah, Hijau, Biru |
| | OUT (Output Pulsa) | `GPIO 16` | Input (Interupsi) | Pembacaan frekuensi warna marka |
| **Sensor Ultrasonik HC-SR04** | Trig Pin | `GPIO 4` | Output Digital | Pemicu pulsa 10 µs |
| | Echo Pin | `GPIO 15` | Input (*Divider*) | Penerima pantulan sinyal (5V ke 3.3V) |
| **Sensor Obstacle FC-51** | OUT Digital | `GPIO 13` | Input Digital | Rem darurat anti-tabrak (`LOW` = Stop) |
| **Servo Motor** | Signal PWM | `GPIO 23` | Output (LEDC) | Buka (90°) dan tutup (0°) tempat sampah |
| **Buzzer Indikator** | Positif Buzzer | `GPIO 2` | Output Digital | Sinyal suara kedatangan dan peringatan |

### Manajemen Catu Daya (Mencegah Brownout Reset)
* **Daya Motor & Servo:** Menggunakan 2 cell baterai 18650 secara seri (7.4V – 8.4V) ke terminal daya driver L298N.
* **Daya Mikrokontroler & Sensor:** Output regulator 5V dari modul L298N dihubungkan ke pin `VIN` ESP32, HC-SR04, dan TCS3200.
* **Penyatuan Ground (*Common Ground*):** Seluruh jalur ground (Baterai, L298N, Servo, dan ESP32) **wajib disatukan** pada rel breadboard untuk menjaga stabilitas level logika digital.

---

## 7. Matriks Pembagian Tugas Anggota Kelompok 1 (8 Mahasiswa)

Beban kerja dibagi secara jelas sesuai bidang keahlian dan komponen yang ditangani:

| No | Nama Mahasiswa | Peran Proyek | Rincian Tanggung Jawab Teknis |
| :---: | :--- | :--- | :--- |
| 1 | **Adam Rahmatulloh** | Project Leader & Hardware Assembly | Integrasi mekanik, sasis 4 roda, pengkabelan breadboard, dan jalur distribusi daya. |
| 2 | **M Ilham Jazuli** | Frontend UI/UX Developer | Pembuatan dashboard web 3 User, 3 tombol kontrol utama, visualisasi bar volume sampah. |
| 3 | **M Thoriq Dhiyaul Haq** | Backend & IoT Bridge Engineer | Setup broker MQTT / Database ringan, antrean panggilan FIFO, endpoint pemicu volume. |
| 4 | **M Anwar Ismail** | Firmware: Line Follower & PID | Algoritma *Task Executor* di Core 1 ESP32, kalibrasi PID motor L298N saat belok. |
| 5 | **A Hisyammuddin** | Firmware: Sensor Warna TCS3200 | Pemrograman pembacaan marka warna stasiun persimpangan, sinkronisasi dengan graf rute. |
| 6 | **A Shobrun Jamil** | Firmware: Ultrasonik & Volume | Logika pengukuran volume sampah HC-SR04, mekanisme buka-tutup servo, dan *dwell timer*. |
| 7 | **Ramzi Pandu Ma'arif** | Safety, Obstacle & Mekanik Tong | Pemasangan sensor anti-tabrak FC-51, fabrikasi wadah tempat sampah dan dudukan servo. |
| 8 | **M Jazaul Aufi** | QA Tester, Demo Prep & Dokumen | Pengujian sistem di lintasan, dokumentasi video demonstrasi UAS, dan laporan akhir. |

---

## 8. Kesimpulan Akhir

1. **Efisiensi Database:** Pemisahan subsistem navigasi (lokal di ESP32) dengan subsistem monitoring IoT berhasil membuat beban database sangat ringan (payload hanya berkisar 1 s.d. 4 byte per transaksi).
2. **Kesesuaian 3 User:** Penerapan 3 User terbukti sangat ideal karena sejalan dengan model graf 4 node di `spec.md`, memaksimalkan fungsi sensor TCS3200, dan membagi porsi kerja 8 anggota secara adil.
3. **Kesiapan Proyek:** Seluruh komponen telah lengkap dan terverifikasi. Tim dapat langsung melanjutkan tahap pengkabelan (*wiring*) dan pemrograman firmware sesuai diagram pinout yang telah ditetapkan.
