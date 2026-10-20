# LAPORAN ANALISIS SISTEM, KEPUTUSAN ARSITEKTUR, DAN HASIL DISKUSI TIM
## Proyek Ujian Akhir Semester Mata Kuliah Internet of Things (IoT)
### Sistem Smart ADAM (Autonomous Dustbin And Management) - Kelompok 1

---

### Informasi Kelompok & Konteks Proyek
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
* **Platform Kontroler:** ESP32 Development Board (Dual Core 240 MHz, Wi-Fi)
* **Inventaris Alat & Bahan Nyata (Tersedia):**
  - ESP32 Development Board
  - Breadboard & Kabel Jumper (Male-to-Male, Male-to-Female)
  - Sensor Line Follower IR (3–5 Channel)
  - Sensor Ultrasonik HC-SR04 (Buka tutup otomatis & pengukur volume sampah internal)
  - Sensor IR Obstacle FC-51 (Pengaman tabrakan depan)
  - Motor DC Gearbox + Roda (4 set) + Driver Motor DC L298N
  - Sasis Robot 4 Roda
  - Servo Motor SG90 / MG995 (Mekanisme buka tutup bak)
  - Baterai Li-ion 18650 (2-3 Slot) + Holder Baterai
  - Sensor Warna RGB TCS3200 (Pendeteksi marka simpul node)

---

## 1. Koreksi Paradigma: Beralih dari "3 User Kaku" Menuju "Arsitektur Dinamis Berbasis Graf Node"

Berdasarkan telaah mendalam terhadap hasil diskusi internal WhatsApp kelompok (antara Ramzi Pandu Ma'arif, M Thoriq Dhiyaul Haq, M Ilham Jazuli, dan anggota lainnya), ditegaskan koreksi fundamental:

> **Prinsip Utama Arsitektur Tim:**
> *"Sebenarnya user nggak harus 3, tergantung berapa jumlah titik pemberhentian di lintasan yang dibuat, oleh karena itu yang disimpan cuma graph yang merepresentasikan jalurnya."*
> &mdash; **Konsensus Tim Kelompok 1**

### 1.1 Mengapa Paradigma Berbasis Graf Node Jauh Lebih Unggul & Fleksibel?
1. **Tidak Bergantung pada Angka Kaku (2 atau 3 User):**
   Jika sistem di-hardcode kaku untuk 3 user, sistem akan rusak apabila lintasan fisik di kelas hanya memungkinkan 2 titik pemberhentian, atau sebaliknya jika di masa depan ingin ditambah menjadi 4 atau 5 meja. 
   Dengan pendekatan graf $G = (V, E)$, jumlah pemanggil (*call stations*) bersifat **sepenuhnya dinamis ($N$ Node)** mengikuti titik henti fisik yang dibuat di lantai/meja.
2. **Database Menjadi Sangat Ringan (*Lightweight & Efficient*):**
   Database cloud tidak perlu menyimpan data profil user yang rumit. Yang disimpan dan disinkronkan hanyalah **Struktur Graf Lintasan** (daftar node dan koneksi bobot antar-simpul), **Antrean Pemanggilan Node** (`queue: ['B', 'C']`), dan **Status Telemetri Robot** (`status`, `pos`, `trash_level`).
3. **Mekanisme Frontend "Generate Tombol Tiap User/Node":**
   Ini menjawab secara tepat kebutuhan frontend: dashboard web membaca konfigurasi graf dan secara dinamis **meng-generate tombol pemanggilan berdasarkan daftar Node yang aktif di lintasan** (misal tombol panggil ke Node B, Node C, Node D, dst.), lengkap dengan indikator warna visual masing-masing node di peta antarmuka.

---

## 2. Bedah Teknis Hasil Diskusi WhatsApp Tim

Berdasarkan tangkapan layar diskusi WhatsApp tim, terdapat beberapa poin teknis kunci yang telah disepakati:

### 2.1 Desain Lintasan dan Kemampuan Belok Motor DC (90° vs 45°)
* **Pertanyaan Diskusi:** *"Lek belok 90° bisa gak bang untuk sensornya? Kalau dibuat 45° atau serong gitu?"*
* **Tanggapan Teknis (Thoriq & Ramzi):** Motor DC sasis 4 roda (4WD) dengan driver L298N mampu melakukan manuver belok 90° (*skid steering*).
* **Analisis & Solusi Firmware:**
  * Pada sistem 4WD, belokan 90° dieksekusi dengan *differential drive* (roda kiri berputar mundur, roda kanan berputar maju, atau sebaliknya).
  * Robot berputar di tempat pada persimpangan hingga sensor garis tengah kembali mengunci garis hitam (*line locked*).
  * Pemilihan sudut 90° sejajar 4 arah mata angin (**Utara, Timur, Selatan, Barat**) sangat ideal karena selaras dengan pembatasan maksimal 4 edge per node pada dokumen `spec.md` (2-bit direction: `00`, `01`, `10`, `11`).

### 2.2 Fungsi Sebenarnya dari Sensor Warna TCS3200 (Pragmatic Node Marker)
* **Klarifikasi Kritis dari Ramzi:**
  > *"Nggak juga sih, edge cuma jalan, patokannya di node, pake warna, tapi nggak spesifik warnanya, bisa terserah soalnya cuma dijadiin tanda kalo itu node."*
* **Evaluasi & Argumen Rekayasa:**
  * **Risiko Kalibrasi Multi-Warna di Kondisi Nyata:** Jika sensor TCS3200 dipaksa membedakan banyak warna spesifik (User 1 = Hijau, User 2 = Biru, User 3 = Kuning) di bawah pencahayaan ruangan kelas yang tidak menentu (lampu neon/pantulan lantai), potensi kegagalan pembacaan frekuensi RGB sangat tinggi saat demo.
  * **Solusi Tim yang Cerdas & Andal:** Sensor TCS3200 difungsikan sebagai **Pendeteksi Marka Node Simpul**. Di setiap persimpangan/titik henti pada garis hitam, ditempelkan selotip/pita berwarna kontras (misalnya warna merah/oranye terang). Saat sensor TCS3200 membaca marka warna tersebut, firmware langsung memicu event:
    $$\text{Event: } \texttt{NODE\_ARRIVED}$$
  * Robot kemudian memverifikasi posisinya terhadap graf di RAM ESP32 dan menentukan apakah titik tersebut adalah stasiun tujuan panggilan atau sekadar persimpangan untuk belok ke rute Dijkstra berikutnya. Pendekatan ini membuat sistem **jauh lebih stabil, tahan banting (*fault-tolerant*), dan minim risiko error saat demonstrasi.**

### 2.3 Ekspektasi Dosen Penguji dan Filosofi Minimum Viable Prototype (MVP)
* **Arahan Dosen:**
  > *"Tetap dikerjakan semaksimal mungkin, pengerjaan harusnya tidak lebih dari 1 hari... minimal prototype udah jadi, sama udah connect dashboard. Masalah error atau kurang akurat tidak apa-apa, nanti dibimbing di kelas."*
* **Tanggapan Tim (Thoriq, Ilham, Ramzi):**
  > *"Iya ini ae gpp, lebih mudah sama enteng... monggo dicicil dashboard sama graph editor e, ben besok habis ngerangkai alat e tinggal diconnect in."*
* **Kesimpulan Arah Kerja:**
  Prioritas utama adalah integrasi fungsional menyeluruh yang terhubung ke dashboard web, bukan over-engineering yang rapuh. Sistem harus siap didemokan dengan alur yang jelas.

---

## 3. Telaah Kritis Revisi Arsitektur: Frontend-Only (Serverless) vs Full-Stack Laravel

Rekan tim menyampaikan usulan penting terkait arsitektur perangkat lunak:
> *"Jika pakai desain ku spec.md yang ini tadi, tidak perlu server backend sih, server frontend saja udah cukup sih, karena hanya menyimpan data graph di RAM nya cukup."*

### 3.1 Mengapa Usulan Ini Sangat Tepat? (Tinjauan Teknis IoT)
1. **Prinsip *Edge Computing*:**
   Robot ADAM bukanlah perangkat pasif (*dumb client*). Dengan menggunakan ESP32 dual-core yang menjalankan FreeRTOS, matriks graf biner dan algoritma Dijkstra dihitung **100% secara lokal di dalam mikrokontroler**. Server cloud/backend tidak perlu melakukan pemrosesan matematika rute.
2. **Supabase Berfungsi Sebagai *Backend-as-a-Service (BaaS)*:**
   Database PostgreSQL Supabase sudah menyediakan REST API otomatis dan *Realtime WebSockets* bawaan. Pustaka `@supabase/supabase-js` memungkinkan antarmuka React di browser langsung membaca status robot, mendengarkan perubahan data secara real-time, dan mengirimkan antrean pemanggilan tanpa memerlukan kontroler/routing Laravel perantara.
3. **Memangkas Titik Kegagalan Saat Demo H-1:**
   Meniadakan backend Laravel berarti tim tidak perlu menginstal PHP, Composer, mengonfigurasi CORS, atau menjalankan 2 terminal server sekaligus (`npm run dev` pada port 5193 dan `php artisan serve` pada port 5194) saat presentasi di depan dosen.

### 3.2 Matriks Komparasi Pilihan Arsitektur

| Aspek Penilaian | Opsi A: Serverless / Frontend-Centric (Saran Rekan Tim) | Opsi B: Full-Stack (React + Laravel + Supabase) |
| :--- | :--- | :--- |
| **Susunan Teknologi** | **React (Port 5193) &rarr; Supabase DB / MQTT &rarr; ESP32** | **React (5193) &rarr; Laravel (5194) &rarr; Supabase &rarr; ESP32** |
| **Kecepatan Selesai** | **Sangat Cepat (Tuntas dalam hitungan jam)** | Butuh waktu tambahan untuk setup API Laravel |
| **Kebutuhan Server Lokal** | Cukup 1 server: `npm run dev` di Port 5193 | 2 server aktif: Port 5193 & Port 5194 |
| **Risiko Masalah Teknis** | **Sangat Rendah** (Koneksi langsung via SDK Supabase) | Rentan kendala CORS, timeout API, atau koneksi DB ganda |
| **Kompleksitas Kode** | Ringkas, modular, dan mudah di-debug bersama | Kompleks dengan banyak lapisan controller dan model |
| **Nilai Akademis UAS** | Sangat tinggi dengan menonjolkan konsep *Edge IoT Computing* | Baik untuk pembagian tugas tradisional jika diwajibkan dosen |

**Rekomendasi Keputusan:**
* **Prioritas Utama (Paling Efisien & Direkomendasikan):** Mengadopsi **Opsi A (React + Supabase)** untuk menjamin sistem langsung terhubung dan siap didemokan sesuai target dosen.
* **Opsi Cadangan:** Jika dosen mewajibkan adanya framework backend Laravel, Laravel cukup dibuatkan 1 *controller* sederhana khusus pencatatan riwayat (*logging history*) tanpa membebani jalur kendali utama robot.

---

## 4. Konfigurasi Lingkungan dan Detail Database

* **Frontend:** React (Vite SPA) &mdash; **Port: 5193**
* **Backend (Jika diaktifkan):** Laravel API &mdash; **Port: 5194**
* **Database Cloud:** PostgreSQL via Supabase
  * **Koneksi:** `postgresql://postgres:[PASSWORD]@db.oslhwkhztahfghefwkjk.supabase.co:5432/postgres`
  * **Host:** `db.oslhwkhztahfghefwkjk.supabase.co`
  * **Port DB:** `5432`
  * **Database Name:** `postgres`
  * **User:** `postgres`

---

## 5. Spesifikasi Lengkap Halaman Website & Fitur-Fiturnya

Website dirancang dengan 3 halaman utama yang modern, responsif, dan siap memukau dosen saat demonstrasi:

```
+-----------------------------------------------------------------------------------------+
|  [LOGO] SMART ADAM     [1. Dashboard Kontrol]   [2. Graph Editor]   [3. Riwayat & Log]  |
+-----------------------------------------------------------------------------------------+
```

### 5.1 Halaman 1 &mdash; Dashboard Kontrol Utama (`/` atau `/dashboard`)
Pusat kendali operasional pemanggilan dan pemantauan kondisi fisik robot secara real-time.

```text
+-----------------------------------------------------------------------------------------+
|                              SMART ADAM - IOT CONTROL PANEL                             |
|  Koneksi: [ONLINE]  |  Posisi: [Node A (Home)]  |  Baterai: [88%]  |  Level Tong: [35%] |
+-----------------------------------------------------------------------------------------+
|  PETA GRAF LINTASAN AKTIF (Interactive 2D Viewer):                                      |
|       (A: Home) ─────── (B: Meja 1) ─────── (C: Meja 2)                                 |
|                            │                   │                                        |
|                         (D: Meja 3) ──────── (E: Drop Point)                            |
+-----------------------------------------------------------------------------------------+
|  PILIH TITIK PANGGILAN (DINAMIS DARI GRAF):                                             |
|  [ Stasiun B (Meja 1) ]   [ *Stasiun C (Meja 2)* ]   [ Stasiun D (Meja 3) ]             |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|    +----------------------------------+   +----------------------------------+          |
|    |  [TOMBOL 1: DISPATCH / PANGGIL]  |   |  [TOMBOL 2: PULANG KE BASE]      |          |
|    |  Panggil ADAM ke Stasiun Terpilih|   |  Batalkan / Kembalikan ke Node A |          |
|    +----------------------------------+   +----------------------------------+          |
|                                                                                         |
|    +-------------------------------------------------------------------------+          |
|    |  [TOMBOL 3: DETEKSI VOLUME SAMPAH REAL-TIME]                            |          |
|    |  (Trigger sensor ultrasonik internal & update persentase kapasitas tong)|          |
|    +-------------------------------------------------------------------------+          |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
|  STATUS DAN LOG MONITORING:                                                             |
|  - Kapasitas Wadah : [=========>                        ] 35% (Status: AMAN)            |
|  - Status Sensor   : Sensor Halangan [BEBAS] | Sensor Node [TERKUNCI DI NODE A]         |
|  - Antrean Panggilan: 1. Node C (Sedang diproses)  |  2. Node B (Menunggu)              |
+-----------------------------------------------------------------------------------------+
```

#### Rincian Fitur & Tombol Dashboard:
1. **Top Telemetry Bar:** Status koneksi WebSocket, status state machine robot (`IDLE`, `MOVING`, `SERVING`, `OBSTACLE_STOP`), persentase baterai, dan persentase kapasitas sampah.
2. **Visualizer Peta Graf 2D:** Denah simpul lintasan interaktif. Posisi robot ditandai dengan avatar bergerak secara real-time. Node dapat diklik langsung untuk memanggil robot.
3. **Dynamic Station Selector:** Tombol stasiun pemanggil terbuat secara otomatis dari daftar node graf yang aktif.
4. **Tombol 1 &mdash; Panggil ADAM:** Mengirimkan perintah pemanggilan stasiun ke antrean.
5. **Tombol 2 &mdash; Selesai & Pulang ke Home:** Menutup tempat sampah otomatis dan memulangkan robot ke stasiun parkir awal (Node A).
6. **Tombol 3 &mdash; Deteksi Volume Sampah Real-Time:** 
   * **Definisi Fungsi:** Fitur ini **secara spesifik mengukur volume kepenuhan sampah di dalam tong sampah**.
   * Ketika tombol ini ditekan, sistem mengirim sinyal pemicu ke sensor ultrasonik HC-SR04 yang terpasang di bawah tutup tong bagian dalam.
   * Sensor mengukur jarak sisa ke tumpukan sampah, lalu mengonversi nilai tersebut menjadi persentase kapasitas terisi (0% s.d. 100%) dan langsung memperbarui bilah progres kapasitas di dashboard:
     * **0% &ndash; 50% (Hijau):** Kapasitas aman / masih lapang.
     * **51% &ndash; 80% (Kuning):** Kapasitas mendekati penuh.
     * **> 80% (Merah):** Peringatan sampah penuh (tombol panggil dikunci otomatis agar sampah tidak meluap).

### 5.2 Halaman 2 &mdash; Peta & Graph Editor (`/graph-editor`)
Halaman khusus konfigurasi lintasan untuk memenuhi kebutuhan penyesuaian rute tanpa perlu koding ulang.
* Menambah atau menghapus simpul Node (Node A, B, C, D...).
* Menghubungkan antar-node dengan garis (*Edge*), mengatur bobot jarak (weight 1-63), dan memilih arah mata angin (Utara, Timur, Selatan, Barat).
* Tombol **"Sync to Robot"** untuk menyimpan graf ke Supabase dan memicu unduhan rute ke ESP32.
* Fitur template rute cepat (*Garis Lurus*, *Bercabang T*, atau *Grid*).

### 5.3 Halaman 3 &mdash; Riwayat & Log Aktivitas (`/logs`)
Pusat pencatatan data (*data logging*) yang memberikan nilai tambah akademis di hadapan dosen:
* **Tabel Riwayat Panggilan:** Log stasiun pemanggil, waktu request, durasi pelayanan, dan status eksekusi.
* **Grafik Tren Volume Sampah:** Grafik garis riwayat akumulasi pembuangan sampah berdasarkan waktu.
* **Log Keamanan (Safety Logs):** Rekaman insiden ketika sensor FC-51 mendeteksi objek atau rem mendadak di lintasan.

---

## 6. Alur Komunikasi Sistem Terpadu (Ultra-Lightweight)

```text
[ Browser Web: React SPA ] (Port 5193)
        │
        ├── (1) Baca/Tulis Data Graf ──> [ Supabase DB (PostgreSQL) ]
        │                                       │
        ├── (2) Publish Panggilan ('B')         │ Realtime Channel Sync
        ▼                                       ▼
[ ESP32 Controller (Robot ADAM) ] <─────────────┘
   ├── Menerima target node ('B')
   ├── Ambil graf dari RAM
   ├── Hitung Dijkstra secara lokal (Core 0 FreeRTOS)
   ├── Task Executor Loop 100 Hz telusuri garis via L298N (Core 1)
   ├── Sensor TCS3200 baca marka node di persimpangan
   ├── Sensor FC-51 rem seketika jika ada halangan fisik
   ├── HC-SR04 luar buka tutup servo saat tangan mendekat
   └── HC-SR04 dalam ukur persentase volume sampah & kirim telemetri balik
```

---

## 7. Pemetaan Pinout GPIO ESP32 (Lengkap & Teruji)

| Modul Hardware | Sinyal Modul | Pin GPIO ESP32 | Mode I/O | Keterangan Fungsi |
| :--- | :--- | :---: | :--- | :--- |
| **Driver Motor L298N** | ENA (PWM Motor Kiri) | `GPIO 14` | Output (LEDC) | Kontrol kecepatan roda kiri |
| | IN1, IN2 (Arah Kiri) | `GPIO 27`, `GPIO 26` | Output Digital | Logika arah maju/mundur roda kiri |
| | ENB (PWM Motor Kanan) | `GPIO 32` | Output (LEDC) | Kontrol kecepatan roda kanan |
| | IN3, IN4 (Arah Kanan) | `GPIO 25`, `GPIO 33` | Output Digital | Logika arah maju/mundur roda kanan |
| **Sensor Line Follower** | Sensor Kiri (IR 1) | `GPIO 34` | Input Digital | Deteksi garis sisi kiri |
| | Sensor Tengah (IR 2) | `GPIO 35` | Input Digital | Pemandu garis tengah (*track keeper*) |
| | Sensor Kanan (IR 3) | `GPIO 39` (VN) | Input Digital | Deteksi garis sisi kanan |
| **Sensor Warna TCS3200** | S0, S1 (Frekuensi) | `GPIO 19`, `GPIO 18` | Output Digital | Pengatur skala frekuensi sensor |
| | S2, S3 (Filter) | `GPIO 5`, `GPIO 17` | Output Digital | Seleksi filter warna pembacaan |
| | OUT (Output Pulsa) | `GPIO 16` | Input (Interrupt) | Deteksi marka warna persimpangan node |
| **Sensor Ultrasonik HC-SR04** | Trig Pin | `GPIO 4` | Output Digital | Memicu pulsa 10 µs ultrasonik |
| | Echo Pin | `GPIO 15` | Input (*Divider*) | Pembacaan jarak sampah / tangan (via divider 1k & 2k) |
| **Sensor Halangan FC-51** | OUT Digital | `GPIO 13` | Input Digital | Rem darurat anti-tabrak (`LOW` = Stop) |
| **Servo Motor** | Signal PWM | `GPIO 23` | Output (LEDC) | Kendali buka (90°) dan tutup (0°) bak |
| **Buzzer** | Positif Buzzer | `GPIO 2` | Output Digital | Indikator suara kedatangan / peringatan |

> **Pedoman Catu Daya:** Driver L298N dan Motor DC ditenagai langsung dari baterai Li-ion 2S (7.4V). Pin `VIN` ESP32 ditenagai dari regulator 5V L298N / step-down. **Seluruh jalur Ground (GND) wajib dihubungkan bersama (*Common Ground*).**

---

## 8. Matriks Pembagian Tugas Anggota Kelompok 1 (8 Mahasiswa)

| No | Nama Mahasiswa | Peran Proyek | Fokus Tanggung Jawab Nyata |
| :---: | :--- | :--- | :--- |
| 1 | **Adam Rahmatulloh** | Project Leader & Hardware Lead | Integrasi sasis mekanik 4 roda, pengkabelan breadboard, dan manajemen catu daya. |
| 2 | **M Ilham Jazuli** | Frontend Developer | Pembuatan dashboard web React (Port 5193), Graph Viewer, dan dynamic station button. |
| 3 | **M Thoriq Dhiyaul Haq** | Cloud IoT & System Architect | Setup Supabase DB, integrasi channel Realtime/MQTT, dan Graph Editor interface. |
| 4 | **M Anwar Ismail** | Firmware: Line Follower & Motor | Pemrograman PID kendali garis di Core 1 FreeRTOS, kalibrasi manuver belok 90° via L298N. |
| 5 | **A Hisyammuddin** | Firmware: Sensor TCS3200 Node Marker | Pemrograman deteksi marka warna pita persimpangan node, validasi event `NODE_ARRIVED`. |
| 6 | **A Shobrun Jamil** | Firmware: Ultrasonik & Volume Sampah | Logika pengukuran kapasitas sampah internal, mekanisme buka-tutup servo dan *dwell timer*. |
| 7 | **Ramzi Pandu Ma'arif** | Safety, Obstacle & Mekanik Tong | Integrasi sensor FC-51 anti-tabrak di depan robot, fabrikasi bak sampah dan dudukan servo. |
| 8 | **M Jazaul Aufi** | QA Tester, Demo Prep & Dokumen | Pengujian integrasi jalur di lantai, rekaman video demonstrasi UAS, dan laporan akhir. |

---

## 9. Kesimpulan & Panduan Eksekusi Tim

1. **Konfirmasi Fitur Deteksi Volume:** Dikonfirmasi bahwa fitur "Deteksi Volume" adalah **pengukuran persentase volume kepenuhan sampah** di dalam wadah menggunakan sensor HC-SR04 internal.
2. **Efisiensi Arsitektur Serverless:** Pendapat rekan tim telah diadopsi ke dalam analisis resmi: sistem dioptimalkan menggunakan arsitektur **React + Supabase** tanpa kewajiban backend Laravel, karena graf dan Dijkstra telah berjalan mandiri di RAM ESP32.
3. **Kesiapan Eksekusi:** Konfigurasi database Supabase telah siap, alokasi pinout ESP32 telah dipetakan, dan spesifikasi 3 halaman website telah dirancang lengkap untuk langsung dieksekusi oleh tim.
