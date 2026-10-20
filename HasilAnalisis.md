# LAPORAN ANALISIS SISTEM DAN KEPUTUSAN ARSITEKTUR
## Proyek Ujian Akhir Semester Mata Kuliah Internet of Things (IoT)
### Sistem Smart ADAM (Autonomous Dustbin And Management) - Kelompok 1

---

### Informasi Kelompok & Proyek
* **Kelompok:** Kelompok 1 (Kelas IoT 24E)
* **Judul Proyek:** Smart ADAM (Autonomous Dustbin And Management)
* **Anggota Kelompok:**
  1. Adam Rahmatulloh
  2. M Ilham Jazuli
  3. M Thoriq Dhiyaul Haq
  4. M Anwar Ismail
  5. A Hisyammuddin
  6. A Shobrun Jamil
  7. Ramzi Pandu Ma'arif
  8. M Jazaul Aufi
* **Platform Kontroler:** ESP32 / ESP8266 (Konektivitas Wi-Fi)
* **Sensor:** Sensor Line Follower IR (3–5 Channel), Sensor Ultrasonik HC-SR04 (Buka-tutup & Volume), IR Obstacle (FC-51), Sensor Warna TCS3200
* **Aktuator & Driver:** DC Motor + Driver L298N, Servo Motor (SG90 / MG995)

---

## 1. Analisis dan Argumen: Pemilihan Jumlah User (2 User vs 3 User)

Pada sesi bimbingan sebelumnya, dosen penguji/pembimbing menyarankan penggunaan **2 User**, sedangkan hasil diskusi internal tim mengusulkan implementasi **3 User**. Berikut adalah komparasi teknis, analisis dampak, serta argumen keputusan:

### 1.1 Tabel Analisis Perbandingan

| Parameter Evaluasi | Opsi 2 User (Saran Dosen) | Opsi 3 User (Usulan Tim) |
| :--- | :--- | :--- |
| **Kompleksitas Jalur Fisik (Line Track)** | Sederhana. Cukup jalur lurus bercabang 2 atau 2 titik henti di jalur loop. | Menengah. Memerlukan 3 titik henti dengan percabangan (T-junction/Y-junction) atau lintasan loop 3 stasiun. |
| **Pemanfaatan Sensor TCS3200 (RGB)** | Kurang optimal. Membedakan 2 titik warna lantai sebenarnya bisa digantikan hanya dengan pembacaan garis biasa (counting junction). | **Sangat Optimal**. Sensor warna TCS3200 dapat mendeteksi 3 warna spesifik (Merah, Hijau, Biru) untuk stasiun masing-masing user. |
| **Logika Antrean Robot (Queue System)** | Terlalu sederhana; saat 1 user memanggil, antrean maksimal hanya 1 request pending. | **Menguji Algoritma Secara Nyata**. Menunjukkan kapabilitas antrean FIFO (First-In, First-Out) saat 2 atau 3 user memanggil berdekatan. |
| **Tingkat Keberhasilan Demo Langsung** | Sangat tinggi, risiko tabrakan/gagal baca garis kecil. | Cukup tinggi asalkan kalibrasi sensor TCS3200 dan pencahayaan ruangan stabil. |
| **Beban Kerja 8 Anggota Kelompok** | Terlalu ringan untuk kelompok beranggotakan 8 mahasiswa. | **Proporsional**. Pembagian tugas hardware, navigasi, frontend, backend, mekanik, dan QA terisi seimbang. |

### 1.2 Argumen dan Rekomendasi Keputusan

**Rekomendasi Tim:** **Menerapkan Arsitektur 3 User secara Default dengan Mekanisme Fallback 2 User.**

**Alasan Argumen:**
1. **Justifikasi Komponen Sensor RGB TCS3200:**
   Di dalam spreedsheet tertera sensor warna TCS3200. Jika hanya ada 2 user, penggunaan sensor warna menjadi *overkill* karena robot bisa sekadar berhenti di persimpangan 1 atau persimpangan 2 menggunakan sensor IR. Dengan 3 User, sensor TCS3200 berfungsi krusial untuk mencocokkan kode warna stasiun:
   * **Stasiun User 1:** Marka Warna Merah
   * **Stasiun User 2:** Marka Warna Hijau
   * **Stasiun User 3:** Marka Warna Biru
   Hal ini memberi nilai akademis tinggi di mata penguji bahwa komponen yang diajukan benar-benar bekerja fungsional, bukan sekadar pelengkap proposal.
2. **Skalabilitas Software (Backend & Frontend):**
   Membuat database dan antarmuka untuk 3 user memiliki kompleksitas kode yang praktis sama dengan 2 user jika dirancang modular (berbasis ID dinamis). 
3. **Strategi Demo UAS (Safety Plan):**
   * *Rencana Utama (Plan A):* Demo sistem penuh dengan 3 titik stasiun pemanggil.
   * *Rencana Cadangan (Plan B):* Jika lintasan fisik di ruang kelas terbatas saat hari presentasi, user ke-3 dapat dinonaktifkan via toggle admin tanpa merombak arsitektur basis data.

---

## 2. Struktur Pengguna (User Identity & Visual Token)

Untuk membedakan stasiun kerja dan pemanggil, setiap user diberikan identitas visual, kode ID, serta warna penanda yang terintegrasi antara website dashboard, sensor RGB, dan indikator robot:

| User Label | User ID | Kode Stasiun | Identitas Warna (Hex) | Deskripsi Posisi Fisik | Marka Lantai (TCS3200) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **User 1** | `USR-01` | `ST-ALPHA` | **Hijau Emerald** (`#10B981`) | Meja Kerja 1 / Sisi Kiri | Gelombang Hijau |
| **User 2** | `USR-02` | `ST-BETA` | **Biru Laut** (`#3B82F6`) | Meja Kerja 2 / Sisi Tengah | Gelombang Biru |
| **User 3** | `USR-03` | `ST-GAMMA` | **Kuning Amber** (`#F59E0B`) | Meja Kerja 3 / Sisi Kanan | Gelombang Merah / Oranye |
| *Home Base* | `BASE-00` | `ST-HOME` | Abu-Abu Netral (`#6B7280`) | Titik Parkir & Standby Utama | Garis Hitam Tebal / Putih |

---

## 3. Analisis Frontend Dashboard

### 3.1 Spesifikasi Layout & 3 Tombol Utama
Website dashboard didesain dengan hierarki visual yang jelas, responsif, dan memberikan umpan balik status secara real-time.

```
+-------------------------------------------------------------------------------+
|                        SMART ADAM - IOT CONTROL PANEL                         |
|  [Status Robot: STANDBY @ HOME]   [Level Sampah: 42%]   [Koneksi: ONLINE]     |
+-------------------------------------------------------------------------------+
|  PROFIL AKTIF: USER 2 (ID: USR-02) - MEJA KERJA BETA (Warna Aksen: BIRU)      |
+-------------------------------------------------------------------------------+
|                                                                               |
|  [ TOMBOL 1: PANGGIL ADAM ]      [ TOMBOL 2: PULANG KE BASE ]                 |
|  (Warna Aksen User / Animasi)    (Kembalikan robot segera)                    |
|                                                                               |
|  [ TOMBOL 3: DETEKSI VOLUME SAMPAH REAL-TIME ]                                |
|  (Trigger sensor & update persentase kapasitas tong)                          |
|                                                                               |
+-------------------------------------------------------------------------------+
|  STATUS SISTEM & MONITORING:                                                  |
|  - Posisi Terakhir   : BASE-00                                                |
|  - Volume Sampah     : [=========>                  ] 42% (Aman)              |
|  - Antrean Pemanggilan: USR-02 (Diproses), USR-01 (Menunggu)                  |
+-------------------------------------------------------------------------------+
```

### 3.2 Rincian Fungsi 3 Tombol Dashboard

1. **Tombol 1: "PANGGIL ADAM KE LOKASI SAYA" (Call Button)**
   * **Fungsi:** Mengirimkan *command* pemanggilan ke robot dengan menyertakan payload `user_id` dan `target_station`.
   * **Logika Interaksi:**
     * Ketika ditekan: tombol beralih ke state *Loading/Dispatched*.
     * Jika robot sedang melayani user lain, tombol menampilkan notifikasi: *"Robot sedang menuju User lain, Anda masuk Antrean #1"*.
     * Warna tombol menyesuaikan identitas user aktif (Hijau/Biru/Kuning).

2. **Tombol 2: "SELESAI / KEMBALIKAN KE HOME BASE" (Dismiss/Return Button)**
   * **Fungsi:** Mengirim instruksi bahwa pembuangan sampah telah selesai sehingga robot dapat segera melanjutkan antrean berikutnya atau kembali ke titik stasiun parkir awal (`BASE-00`).
   * **Logika Interaksi:**
     * Aktif saat robot telah tiba di posisi user pemanggil (`state: ARRIVED_AT_USER`).
     * Menutup servo secara manual jika belum tertutup otomatis, lalu mengaktifkan navigasi kepulangan.

3. **Tombol 3: "DETEKSI & PERBARUI VOLUME SAMPAH" (Check Capacity Button)**
   * **Fungsi:** Mengirim instruksi pembacaan instan (*on-demand trigger*) ke sensor ultrasonik internal wadah sampah untuk mendapatkan data kapasitas sampah termutakhir.
   * **Visualisasi Output:**
     * Menampilkan progres bar kapasitas (0% s.d. 100%).
     * **Status Hijau (0% - 50%):** Kapasitas Luang / Aman.
     * **Status Kuning (51% - 80%):** Kapasitas Mendekati Penuh.
     * **Status Merah (> 80%):** Sampah Penuh (*Warning Banner* muncul; tombol Panggil dinonaktifkan sementara sampai sampah dikosongkan).

### 3.3 Ringkasan Modul Frontend
* **User Generator / Session Selector:** Komponen dropdown atau tombol *switch user* untuk beralih mode perspektif (User 1, User 2, User 3).
* **Button State Management:** Mencegah *spamming command* (disable tombol saat transmisi berlangsung atau saat robot sedang *in-transit*).
* **Live Telemetry View:** Widget status koneksi robot (indikator *heartbeat ping*), estimasi waktu kedatangan, dan indikator volume sampah.

---

## 4. Analisis Backend, Database, dan Alur Robot

### 4.1 Arsitektur Komunikasi IoT
Sistem menggunakan pola komunikasi terdistribusi antara Frontend, Cloud Database/Broker, dan Mikrokontroler Robot:

```
[ Frontend Web (HTML/JS) ]
          │   ▲
          │   │  HTTP REST / WebSocket / Realtime Sync
          ▼   │
[ Backend / Database (Firebase RTDB / Supabase / MQTT Broker) ]
          │   ▲
          │   │  Wi-Fi Protocol (JSON Payload)
          ▼   │
[ Robot ESP32 Controller ]
   ├── Sensor IR Line Follower (Navigasi Garis)
   ├── Sensor TCS3200 (Identifikasi Warna Stasiun User)
   ├── Sensor HC-SR04 Eksternal (Deteksi Manusia -> Buka Servo)
   ├── Sensor HC-SR04 Internal (Deteksi Ketinggian Sampah)
   ├── Sensor FC-51 IR Obstacle (Pencegah Tabrakan / Emergency Stop)
   ├── Driver L298N + 2x Motor DC (Gerak Robot)
   └── Servo Motor (Mekanisme Tutup Sampah)
```

### 4.2 Skema Basis Data (Database Schema)

Skema database dirancang ramping agar efisien diproses mikrokontroler (misalnya berbasis Firebase Realtime Database JSON Tree atau PostgreSQL/MySQL).

#### Entitas 1: `robot_status` (Tabel Status Robot Tunggal)
Menyimpan kondisi fisik dan operasional robot secara real-time.
```json
{
  "robot_id": "ADAM-01",
  "current_state": "IDLE", 
  "target_station": "BASE-00",
  "active_user_id": null,
  "trash_level_percent": 35.5,
  "trash_distance_cm": 16.2,
  "is_lid_open": false,
  "obstacle_detected": false,
  "last_updated": 1729415532
}
```
*Daftar Nilai `current_state`:*
* `IDLE`: Siaga di Home Base.
* `MOVING_TO_USER`: Sedang berjalan menelusuri garis menuju user pemanggil.
* `ARRIVED_SERVING`: Tiba di lokasi user, membuka tutup sampah otomatis saat terdeteksi tangan.
* `RETURNING_HOME`: Bergerak kembali menuju titik awal (Home Base).
* `OBSTACLE_STOP`: Berhenti darurat karena terhalang objek di depan.
* `FULL_LOCK`: Terkunci karena kapasitas sampah > 85%.

#### Entitas 2: `call_queue` (Tabel Antrean Pemanggilan)
Menangani request dari banyak user dengan aturan FIFO (*First-In, First-Out*).
```json
{
  "requests": {
    "REQ-101": {
      "user_id": "USR-02",
      "target_station": "ST-BETA",
      "status": "QUEUED",
      "timestamp": 1729415500
    },
    "REQ-102": {
      "user_id": "USR-01",
      "target_station": "ST-ALPHA",
      "status": "QUEUED",
      "timestamp": 1729415520
    }
  }
}
```

#### Entitas 3: `users_station` (Master Data User)
```json
{
  "USR-01": { "name": "User 1 (Alpha)", "color_hex": "#10B981", "color_target": "GREEN", "station": "ST-ALPHA" },
  "USR-02": { "name": "User 2 (Beta)",  "color_hex": "#3B82F6", "color_target": "BLUE",  "station": "ST-BETA" },
  "USR-03": { "name": "User 3 (Gamma)", "color_hex": "#F59E0B", "color_target": "RED",   "station": "ST-GAMMA" }
}
```

---

## 5. Alur Logika Robot (State Machine & Logic Flow)

### 5.1 Diagram Alir Operasional

```
       [ START / IDLE @ HOME BASE ]
                   │
                   ▼
     [ User Menekan Tombol Panggil ]
                   │
                   ▼
      [ Cek Kapasitas Sampah ]
         ├── Penuh (> 85%) ──> [ Tolak Panggilan & Tampilkan Peringatan di Web ]
         │
         └── Aman (< 85%)
                   │
                   ▼
     [ Robot Bergerak Mengikuti Garis (Line Follower) ]
                   │
                   ├── Ada Rintangan? (FC-51) ──> [ Berhenti Sementara Hingga Halangan Hilang ]
                   │
                   ▼
     [ Sensor TCS3200 Membaca Marka Warna Stasiun Pemanggil ]
                   │
                   ▼
       [ Warna Cocok dengan User ID? ]
         ├── Tidak ──> Tetap Lanjut Telusuri Garis
         │
         └── Ya ──> [ Robot Berhenti di Stasiun User ]
                         │
                         ▼
           [ Sensor Ultrasonik Mendeteksi Tangan Pengguna (< 15 cm) ]
                         │
                         ▼
             [ Servo Membuka Tutup Tempat Sampah ]
                         │
                         ▼
             [ Timer Tunggu (5-7 Detik) / Tangan Menjauh ]
                         │
                         ▼
             [ Servo Menutup Tutup Tempat Sampah ]
                         │
                         ▼
         [ Sensor Internal Mengukur Level Volume Sampah ]
                         │
                         ▼
             [ Kirim Update Data Volume ke Database ]
                         │
                         ▼
             [ Cek Antrean Panggilan Lain ]
               ├── Ada Antrean ──> Bergerak ke Stasiun User Berikutnya
               │
               └── Kosong ──> [ Navigasi Kembali ke Home Base ]
                                       │
                                       ▼
                             [ FINISH / STANDBY ]
```

### 5.2 Rincian Tahapan Eksekusi Hardware

1. **Inisialisasi & Idle Mode:**
   * ESP32 terhubung ke Wi-Fi dan menyinkronkan status ke database.
   * Robot berada di titik `BASE-00`.
   * Motor DC mati, servo dalam posisi 0° (tutup tertutup rapat).

2. **Penerimaan Perintah & Pengecekan Awal:**
   * Listener database di ESP32 mendeteksi ada record berstatus `QUEUED`.
   * Sistem membaca sensor volume sampah: jika jarak ruang sisa < 4 cm (tong penuh), status diubah ke `FULL_LOCK`, buzzer berbunyi, dan perintah dibatalkan. Jika aman, status berubah ke `MOVING_TO_USER`.

3. **Navigasi Garis & Keamanan:**
   * Sensor Line Follower IR (3–5 channel) memandu modul driver L298N untuk menjaga arah gerak robot di atas garis.
   * Sensor IR Obstacle (FC-51) aktif terus menerus. Jika mendeteksi benda/orang di depan dalam jarak < 10 cm, PWM motor diset ke 0 (berhenti seketika) hingga jalur bebas kembali.

4. **Deteksi Titik Henti Stasiun Pengguna:**
   * Sensor TCS3200 membaca nilai intensitas frekuensi warna pada lantai.
   * Apabila nilai warna mendeteksi warna spesifik stasiun pemanggil (misal `GREEN` untuk User 1), motor berhenti penuh dan robot membunyikan nada bip penanda kedatangan.

5. **Interaksi Buka-Tutup Otomatis:**
   * Sensor HC-SR04 di bibir tempat sampah mendeteksi tangan pembuang sampah pada jarak < 15 cm.
   * Mikrokontroler memutar Servo ke sudut 90° (tutup terbuka).
   * Setelah tangan tidak terdeteksi selama jeda aman (misal 5 detik), servo kembali ke 0° (tutup tertutup).

6. **Pengukuran Volume Sampah (Tombol Real-time / Selesai Pakai):**
   * Sensor ultrasonik internal di bawah penutup memancarkan sinyal ke dasar tempat sampah.
   * Rumus konversi kapasitas:
     $$\text{Tinggi Total Tong} = H_{\text{total}} \text{ (misal 25 cm)}$$
     $$\text{Jarak Terbaca Sensor} = D_{\text{ukur}} \text{ cm}$$
     $$\text{Persentase Terisi} = \left( \frac{H_{\text{total}} - D_{\text{ukur}}}{H_{\text{total}} - D_{\text{minimal}}} \right) \times 100\%$$
   * Nilai persentase dituliskan ke tabel status database untuk ditampilkan ke web dashboard.

7. **Proses Kembali ke Stasiun Awal (Home Base):**
   * Robot berputar atau melanjutkan lintasan loop mengikuti garis hingga mendeteksi marka hitam tebal `BASE-00`.
   * Status sistem kembali ke `IDLE`.

---

## 6. Matriks Pembagian Tugas Anggota Kelompok 1 (8 Mahasiswa)

Untuk menjamin kelancaran pengerjaan proyek UAS IoT ini, tanggung jawab dibagi secara terstruktur:

| No | Nama Mahasiswa | Bidang Tanggung Jawab | Rincian Tugas Spesifik |
| :---: | :--- | :--- | :--- |
| 1 | **Adam Rahmatulloh** | Project Leader & Hardware Lead | Koordinasi integrasi sistem, perakitan sasis/mekanik, wiring ESP32. |
| 2 | **M Ilham Jazuli** | Frontend Developer | Perancangan antarmuka dashboard web, styling 3 tema warna user, integrasi API. |
| 3 | **M Thoriq Dhiyaul Haq** | Backend & Database Engineer | Perancangan struktur database, manajemen antrean (queue logic), integrasi MQTT/HTTP. |
| 4 | **M Anwar Ismail** | Navigation & Line Follower Firmware | Kalibrasi sensor IR 3-5 channel, algoritma kendali belok motor DC via L298N. |
| 5 | **A Hisyammuddin** | Sensor & Actuator Firmware | Pemrograman sensor TCS3200 (kalibrasi warna), buka-tutup servo, obstacle FC-51. |
| 6 | **A Shobrun Jamil** | Trash Volume Algorithm & Telemetry | Logika pengukuran HC-SR04 internal, konversi persentase volume sampah, data logging. |
| 7 | **Ramzi Pandu Ma'arif** | Mekanik & Konstruksi Fisik | Pembuatan body tempat sampah (triplek/akrilik), mounting sensor, bracket servo. |
| 8 | **M Jazaul Aufi** | Testing, Dokumentasi & Demo Prep | Uji coba lintasan, video demonstrasi, pembuatan slide presentasi dan laporan akhir. |

---

## 7. Kesimpulan & Langkah Kerja Segera

1. **Keputusan User:** Tim menyetujui implementasi **3 User** untuk memaksimalkan fungsi sensor TCS3200 dan mengoptimalkan beban kerja 8 anggota kelompok, dengan fleksibilitas sistem yang tetap bisa dijalankan pada mode 2 user jika ruang uji coba terbatas.
2. **Dashboard Web:** Menyediakan tombol pemanggilan per-user beraksen warna masing-masing, tombol pemulangan robot ke base, serta tombol pemicu deteksi volume sampah real-time.
3. **Langkah Kerja Berikutnya:**
   * Finalisasi wiring diagram ESP32 dengan L298N, servo, dan sensor.
   * Setup proyek database untuk listener antrean panggilan.
   * Pembuatan prototipe antarmuka frontend HTML/CSS/JS.
