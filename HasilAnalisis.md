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
  - Sensor Ultrasonik HC-SR04
  - Sensor IR Obstacle FC-51
  - Motor DC Gearbox + Roda (4 set) + Driver Motor DC L298N
  - Sasis Robot 4 Roda
  - Servo Motor SG90 / MG995
  - Baterai Li-ion 18650 (2-3 Slot) + Holder Baterai
  - Sensor Warna RGB TCS3200

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

Berdasarkan tangkapan layar diskusi WhatsApp (`SS_DiskusiWhatsapp_1.png` s.d. `SS_DiskusiWhatsapp_5.png`), terdapat beberapa poin teknis kunci yang telah disepakati:

### 2.1 Desain Lintasan dan Kemampuan Belok Motor DC (90° vs 45°)
* **Pertanyaan Diskusi:** *"Lek belok 90° bisa gak bang untuk sensornya? Kalau dibuat 45° atau serong gitu?"*
* **Tanggapan Teknis (Thoriq & Ramzi):** Motor DC sasis 4 roda (4WD) dengan driver L298N mampu melakukan manuver belok 90° (*skid steering*).
* **Analisis & Solusi Firmware:**
  * Pada sistem 4WD, belokan 90° dieksekusi dengan *differential drive* (roda kiri berputar mundur, roda kanan berputar maju, atau sebaliknya).
  * Robot berputar di tempat pada persimpangan hingga sensor garis tengah kembali mengunci garis hitam (*line locked*).
  * Pemilihan sudut 90° sejajar 4 arah mata angin (**Utara, Timur, Selatan, Barat**) sangat ideal karena selaras dengan pembatasan maksimal 4 edge per node pada dokumen `spec.md` (2-bit direction: `00`, `01`, `10`, `11`).

### 2.2 Fungsi Sebenarnya dari Sensor Warna TCS3200 (Pragmatic Node Marker)
* **Klarifikasi Kritis dari Ramzi (Pukul 10.37):**
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

## 3. Arsitektur Terpadu Sistem ADAM Berbasis Graf

```
+-----------------------------------------------------------------------------------------+
|                           ARSITEKTUR DINAMIS BERBASIS GRAF NODE                         |
+-----------------------------------------------------------------------------------------+
|  [ FRONTEND: WEB DASHBOARD & GRAPH VIEWER ]                                             |
|  - Graph Editor / Visualizer (Peta lintasan node A, B, C, ...)                          |
|  - Dynamic Station Call Generator (Membuat tombol panggilan sesuai node di graf)        |
|  - 3 Tombol Operasional: [ Panggil Node ]  [ Pulang ke Base ]  [ Cek Volume Sampah ]   |
+-----------------------------------------------------------------------------------------+
                                      │   ▲
                                      │   │  JSON Payload Ringkas (< 50 Byte)
                                      ▼   │
+-----------------------------------------------------------------------------------------+
|  [ BACKEND: LIGHTWEIGHT CLOUD DATABASE / MQTT BROKER ]                                  |
|  - Menyimpan Topologi Graf: Node (V) & Edge (E) berbobot                               |
|  - Antrean Panggilan FIFO: ["B", "C"]                                                   |
|  - Status Telemetri Real-Time: Posisi Robot, Level Sampah (%), Baterai (%), Status       |
+-----------------------------------------------------------------------------------------+
                                      │   ▲
                                      │   │  Wi-Fi Socket (MQTT / HTTP)
                                      ▼   │
+-----------------------------------------------------------------------------------------+
|  [ EMBEDDED CONTROLLER: ROBOT ADAM (ESP32) ]                                            |
|  - Core 0 (FreeRTOS): Koneksi Jaringan MQTT + Algoritma Rute Terpendek Dijkstra (RAM)   |
|  - Core 1 (FreeRTOS): Task Executor Loop 100 Hz (PID Line Follower Motor DC L298N)      |
|  - Deteksi Node: Sensor TCS3200 membaca marka pita warna di persimpangan lintasan       |
|  - Mekanisme Pengaman: Sensor IR Obstacle FC-51 (Rem mendadak jika ada halangan fisik)  |
|  - Mekanisme Sampah: HC-SR04 deteksi tangan (Servo buka) & HC-SR04 internal ukur volume |
+-----------------------------------------------------------------------------------------+
```

---

## 4. Representasi Graf & Skema Data Super Ringan (Ultra-Lightweight)

### 4.1 Model Graf Lintasan ($N$ Node, Fleksibel)
Lintasan direpresentasikan sebagai graf tak berarah berbobot $G = (V, E)$:
* **Node A (Home Base):** Titik awal parkir dan standby robot.
* **Node B, C, D, ...:** Titik pemberhentian meja kerja / stasiun pemanggil.
* Setiap node terhubung dengan garis hitam (*edge*) dengan kapasitas maksimal 4 percabangan arah mata angin (Utara, Timur, Selatan, Barat).

```text
    [Node A] (Home Base)
       │
       │ (Jarak = 8)
       ▼
    [Node B] (Stasiun 1) <──(Jarak = 14)──> [Node C] (Stasiun 2)
       │                                       │
       │ (Jarak = 7)                           │ (Jarak = 11)
       ▼                                       ▼
    [Node E] (Persimpangan) <─(Jarak = 12)─> [Node F] (Stasiun 3)
```

### 4.2 Enkoding Matriks 1D Byte Array di RAM ESP32
Mengadopsi efisiensi dari `spec.md`, relasi antar-node dikompresi dalam matriks biner 1 byte per relasi edge:
* **Bit 0 - 5 (6 bit):** Bobot jarak / waktu tempuh (nilai 1 sampai 63).
* **Bit 6 - 7 (2 bit):** Arah mata angin (`00` = Utara, `01` = Timur, `10` = Selatan, `11` = Barat).

### 4.3 Struktur Data Minimalis di Database Cloud
Hanya ada 3 data sederhana yang disimpan di server/database:

```json
{
  "graph_config": {
    "nodes": ["A", "B", "C", "D"],
    "home_node": "A"
  },
  "robot_telemetry": {
    "current_node": "A",
    "status": "IDLE",
    "trash_percent": 35,
    "battery_percent": 88
  },
  "call_queue": ["B", "C"]
}
```

*Keunggulan:* Ukuran transaksi pertukaran data tidak lebih dari 50 byte, sangat cepat dan tidak membebani ESP32 maupun kuota hotspot saat demonstrasi.

---

## 5. Analisis Frontend: Dashboard & Dynamic Station Generator

Sesuai arahan Thoriq (*"monggo dicicil dashboard sama graph editor e"*), antarmuka web dibangun dengan arsitektur modular yang adaptif terhadap jumlah titik henti di lintasan.

### 5.1 Tata Letak Dashboard Interaktif

```text
+-----------------------------------------------------------------------------------------+
|                             SMART ADAM - IOT CONTROL PANEL                              |
|  Koneksi: [ONLINE]  |  Posisi: [Node A (Home)]  |  Baterai: [88%]  |  Level Tong: [35%] |
+-----------------------------------------------------------------------------------------+
|  PETA GRAF LINTASAN AKTIF (Read-Only Viewer):                                           |
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
|    |  (Trigger sensor ultrasonik internal & update persentase kapasitas)     |          |
|    +-------------------------------------------------------------------------+          |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
|  STATUS DAN LOG MONITORING:                                                             |
|  - Kapasitas Wadah : [=========>                        ] 35% (Status: AMAN)            |
|  - Status Sensor   : Sensor Halangan [BEBAS] | Sensor Node [TERKUNCI DI NODE A]         |
|  - Antrean Panggilan: 1. Node C (Sedang diproses)  |  2. Node B (Menunggu)              |
+-----------------------------------------------------------------------------------------+
```

### 5.2 Rincian Fitur Utama Frontend
1. **Dynamic Station Generator:**
   Frontend membaca `graph_config.nodes` dari database. Jika lintasan memiliki 3 titik henti di luar Home (misal B, C, D), maka otomatis dibuat 3 tombol stasiun. Jika hanya ada 2 stasiun (B, C), tombol menyesuaikan diri secara otomatis tanpa perlu mengubah struktur HTML/CSS.
2. **3 Tombol Operasional Utama:**
   * **Tombol 1 &mdash; Panggil ADAM:** Mengirimkan ID node stasiun terpilih ke antrean `call_queue`.
   * **Tombol 2 &mdash; Selesai & Pulang ke Home:** Menutup tempat sampah dan menginstruksikan robot kembali ke Node Home (`Node A`).
   * **Tombol 3 &mdash; Deteksi Volume Sampah Real-Time:** Meminta ESP32 membaca sensor HC-SR04 internal dan memperbarui bar progres kapasitas sampah di layar.

---

## 6. Integrasi Hardware, Sensor, dan Alur Logika Robot

### 6.1 Alur Logika Eksekusi di Mikrokontroler (ESP32)

1. **Standby di Home Node:** Robot berada di Node A dalam status `IDLE`.
2. **Penerimaan Panggilan:** ESP32 menerima target node dari antrean (contoh: Node C).
3. **Pencarian Rute Dijkstra:** `Task Route Finder` di Core 0 mengeksekusi algoritma Dijkstra terhadap matriks graf di RAM untuk menghasilkan daftar urutan node terpendek (misal: `A -> B -> C`).
4. **Navigasi Line Follower:** `Task Executor` di Core 1 mengendalikan PWM Motor DC via driver L298N agar robot mengikuti garis hitam.
5. **Penanganan Halangan (Sensor FC-51):** Jika sensor inframerah FC-51 mendeteksi objek di depan (< 10 cm), robot seketika mematikan motor (*brake stop*) tanpa menunggu instruksi cloud sampai halangan berpindah.
6. **Deteksi Kedatangan di Node (Sensor TCS3200):**
   * Saat melewati persimpangan, sensor TCS3200 mendeteksi marka pita warna.
   * Event `NODE_ARRIVED` dipicu; robot mencocokkan node yang dicapai dengan urutan rute.
   * Jika simpul tersebut merupakan perantara, robot mengeksekusi manuver belok sesuai *heading*. Jika simpul tersebut adalah Node tujuan akhir (Node C), robot berhenti penuh.
7. **Layanan Pembuangan Sampah:**
   * Sensor HC-SR04 eksternal mendeteksi tangan pembuang (< 15 cm) &rarr; Servo membuka tutup 90°.
   * Dwell timer (15 detik) berjalan dengan fitur reset otomatis jika ada interaksi lanjutan.
   * Setelah selesai, servo kembali ke posisi 0° (tertutup).
8. **Pengukuran Kapasitas Sampah:**
   * Sensor HC-SR04 internal membaca sisa ruang di dalam tong, mengonversi nilai menjadi persentase terisi (0% - 100%), dan mengirimkan update ke database.
9. **Kembali atau Lanjut Antrean:**
   * Jika antrean berikutnya ada, robot menghitung rute dari Node saat ini ke Node berikutnya.
   * Jika antrean kosong, robot menjalankan rute kembali ke Node Home (Node A).

---

## 7. Pemetaan Pinout GPIO ESP32 (Lengkap & Teruji)

| Modul Hardware | Sinyal Modul | Pin GPIO ESP32 | Mode I/O | Keterangan Fungsi |
| :--- | :--- | :---: | :--- | :--- |
| **Driver Motor L298N** | ENA (PWM Motor Kiri) | `GPIO 14` | Output (LEDC) | Kontrol kecepatan roda kiri |
| | IN1, IN2 (Arah Kiri) | `GPIO 27`, `GPIO 26` | Output Digital | Logika arah maju/mundur roda kiri |
| | ENB (PWM Motor Kanan) | `GPIO 32` | Output (LEDC) | Kontrol kecepatan roda kanan |
| | IN3, IN4 (Arah Kanan) | `GPIO 25`, `GPIO 33` | Output Digital | Logika arah maju/mundur roda kanan |
| **Sensor Line Follower** | Sensor Kiri (IR 1) | `GPIO 34` | Input Digital | Deteksi garis sisi kiri |
| | Sensor Tengah (IR 2) | `GPIO 35` | Input Digital | Pemandu garis tengah (track keeper) |
| | Sensor Kanan (IR 3) | `GPIO 39` (VN) | Input Digital | Deteksi garis sisi kanan |
| **Sensor Warna TCS3200** | S0, S1 (Frekuensi) | `GPIO 19`, `GPIO 18` | Output Digital | Pengatur skala frekuensi sensor |
| | S2, S3 (Filter) | `GPIO 5`, `GPIO 17` | Output Digital | Seleksi filter warna pembacaan |
| | OUT (Output Pulsa) | `GPIO 16` | Input (Interrupt) | Deteksi marka warna persimpangan node |
| **Sensor Ultrasonik HC-SR04** | Trig Pin | `GPIO 4` | Output Digital | Memicu pulsa 10 µs ultrasonik |
| | Echo Pin | `GPIO 15` | Input (*Divider*) | Penerima pantulan sinyal (via resistor 1k & 2k) |
| **Sensor Halangan FC-51** | OUT Digital | `GPIO 13` | Input Digital | Rem darurat anti-tabrak (`LOW` = Stop) |
| **Servo Motor** | Signal PWM | `GPIO 23` | Output (LEDC) | Kendali buka (90°) dan tutup (0°) bak |
| **Buzzer** | Positif Buzzer | `GPIO 2` | Output Digital | Indikator suara kedatangan / peringatan |

> **Pedoman Catu Daya:** Driver L298N dan Motor DC ditenagai langsung dari baterai Li-ion 2S (7.4V). Pin `VIN` ESP32 ditenagai dari regulator 5V L298N / step-down. **Seluruh jalur Ground (GND) wajib dihubungkan bersama (*Common Ground*).**

---

## 8. Matriks Pembagian Tugas Anggota Kelompok 1 (8 Mahasiswa)

Sesuai arahan dosen agar seluruh 8 anggota berkontribusi aktif dalam pengerjaan 1-2 hari ini:

| No | Nama Mahasiswa | Peran Proyek | Fokus Tanggung Jawab Nyata |
| :---: | :--- | :--- | :--- |
| 1 | **Adam Rahmatulloh** | Project Leader & Hardware Lead | Integrasi sasis mekanik 4 roda, manajemen perkabelan breadboard, dan sistem distribusi daya baterai. |
| 2 | **M Ilham Jazuli** | Frontend Developer | Perancangan antarmuka dashboard, visualisasi graf, dynamic station call generator, dan 3 tombol kontrol. |
| 3 | **M Thoriq Dhiyaul Haq** | Backend & IoT Architect | Setup broker/database ultra-ringan, sinkronisasi antrean pemanggilan FIFO, dan integrasi API dashboard. |
| 4 | **M Anwar Ismail** | Firmware: Line Follower & Motor | Pemrograman PID kendali garis di Core 1 FreeRTOS, kalibrasi manuver belok 90° motor DC via L298N. |
| 5 | **A Hisyammuddin** | Firmware: Sensor TCS3200 Node Marker | Pemrograman deteksi marka pita warna persimpangan node, validasi event `NODE_ARRIVED`. |
| 6 | **A Shobrun Jamil** | Firmware: Ultrasonik & Volume Sampah | Logika pengukuran kapasitas sampah internal, mekanisme dwell timer buka-tutup servo otomatis. |
| 7 | **Ramzi Pandu Ma'arif** | Safety, Obstacle & Mekanik Tong | Integrasi sensor FC-51 anti-tabrak di depan robot, fabrikasi fisik bak sampah dan dudukan servo. |
| 8 | **M Jazaul Aufi** | Testing, Dokumentasi & Demo Prep | Pengujian integrasi jalur di lantai, rekaman video demonstrasi UAS, dan penyusunan berkas laporan akhir. |

---

## 9. Kesimpulan & Roadmap Eksekusi Cepat

1. **Sistem Sepenuhnya Dinamis:** Sistem tidak lagi terkunci pada aturan kaku "harus 3 user", melainkan berbasis **Graf $N$ Node** yang fleksibel menyesuaikan berapa pun titik henti yang dibuat di lintasan fisik.
2. **Sensor TCS3200 Pragmatis & Andal:** Sensor warna digunakan sebagai penanda simpul node di persimpangan lintasan, memangkas risiko kegagalan kalibrasi warna di hadapan penguji.
3. **Database Ultra-Ringan:** Database hanya memuat topologi graf dan status telemetri berukuran kecil (< 50 byte), menjamin responsivitas tinggi pada koneksi hotspot kelas.
4. **Langkah Kerja Langsung:** Sesuai ajakan tim di WhatsApp (*"Besok gasssinnn... dicicil dashboard sama graph editor e, ben besok habis ngerangkai alat tinggal diconnect in"*), tim dapat langsung membagi perakitan hardware dan pembuatan web dashboard berbasis dokumen ini.
