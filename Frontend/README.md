# SMART ADAM (Autonomous Dustbin And Management) - Frontend Control Center

Pusat kendali operasional dan visualisasi telemetri untuk sistem armada robot tong sampah otonom berbasis Internet of Things (IoT). Proyek Ujian Akhir Semester Mata Kuliah Internet of Things - Kelompok 1, Kelas IoT 24E.

---

## 1. Deskripsi Proyek

Aplikasi web ini merupakan Single Page Application (SPA) berbasis React, TypeScript, dan Vite yang dirancang untuk mengelola dan memantau robot otonom SMART ADAM. Antarmuka ini terhubung langsung dengan mikrokontroler ESP32 melalui komunikasi MQTT (EMQX Cloud) dan Supabase Realtime, memungkinkan pemantauan kapasitas sampah, level baterai, deteksi halangan sensor, serta kalkulasi rute navigasi terpendek (Dijkstra) secara langsung.

---

## 2. Spesifikasi Teknologi (Tech Stack)

* **Kerangka Kerja Utama:** React 19, TypeScript, Vite 8
* **Desain & Gaya Antarmuka:** Vanilla CSS terstruktur dengan Design Tokens terpadu (mendukung Mode Terang & Gelap secara mulus)
* **Penyedia Basis Data & Realtime:** Supabase (PostgreSQL & Realtime WebSocket)
* **Protokol Telemetri IoT:** MQTT over TLS / WebSocket (EMQX Cloud Broker)
* **Layanan Verifikasi Email:** Gmail SMTPS (Port 465) dengan verifikasi OTP 6-digit
* **Ikon Antarmuka:** Lucide React
* **Server Produksi & Deployment:** Node.js HTTP Server bawaan (zero-dependency) dan PM2 Process Manager untuk STB (Armbian Linux)

---

## 3. Prasyarat Sistem (Prerequisites)

Sebelum memulai instalasi, pastikan perangkat Anda telah terpasang:
* **Node.js:** Versi 18.x atau lebih baru (disarankan LTS versi 20.x atau 22.x).
  Periksa versi dengan perintah: `node -v`
* **npm:** Versi 9.x atau lebih baru.
  Periksa versi dengan perintah: `npm -v`
* **Peramban Web:** Google Chrome, Mozilla Firefox, atau Microsoft Edge versi terbaru.

---

## 4. Panduan Instalasi dan Menjalankan di Komputer Lokal

Ikuti langkah-langkah di bawah ini secara berurutan:

### Langkah 1: Buka Terminal dan Masuk ke Direktori Frontend
Buka Command Prompt, PowerShell, atau Terminal, lalu arahkan ke folder `Frontend`:
```bash
cd "Frontend"
```

### Langkah 2: Pasang Seluruh Dependensi Proyek
Jalankan perintah instalasi dependensi:
```bash
npm install
```
Tunggu hingga proses pengunduhan paket selesai. Seluruh modul yang dibutuhkan akan tersimpan di dalam folder `node_modules/`.

### Langkah 3: Konfigurasi Berkas Lingkungan (.env)
Pastikan berkas `.env` telah berada di dalam folder `Frontend/`. Jika belum ada, buat berkas baru bernama `.env` dan isi dengan konfigurasi berikut:

```env
# Port Dev Server & Aplikasi
VITE_PORT=5193

# Konfigurasi Supabase BaaS (Database & Realtime)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key-here

# Konfigurasi Gmail SMTP (Pengiriman OTP Registrasi & Lupa Sandi)
VITE_SMTP_HOST=smtp.gmail.com
VITE_SMTP_PORT=465
VITE_SMTP_USER=your-email@gmail.com
VITE_SMTP_PASS="your-16-char-app-password"
VITE_SMTP_FROM_NAME="SMART ADAM System"

# Domain Publik / Tunnel
VITE_SITE_URL=https://your-domain-or-localhost
VITE_APP_URL=https://your-domain-or-localhost
VITE_SUPABASE_REDIRECT_URL=https://your-domain-or-localhost/dashboard
```

> **Catatan Penting Pengaturan Sandi Gmail:**
> Nilai `VITE_SMTP_PASS` menggunakan App Password 16 karakter dari Google Account, dibungkus tanda petik dua `""` tanpa spasi agar terbaca utuh oleh sistem runtime.

### Langkah 4: Jalankan Server Pengembangan (Dev Server)
Jalankan server lokal dengan perintah:
```bash
npm run dev
```

### Langkah 5: Buka Aplikasi di Peramban
Setelah server aktif, buka peramban Anda dan akses URL:
```text
http://localhost:5193
```
Aplikasi kini telah aktif secara lokal dengan fitur Hot Module Replacement (HMR).

---

## 5. Panduan Build & Deployment ke STB (Linux / Armbian)

Untuk menjalankan sistem ini secara permanen di perangkat STB (Set-Top Box) dengan Cloudflare Tunnel:

### Langkah 1: Bangun Berkas Produksi di Komputer
Di folder `Frontend/`, jalankan:
```bash
npm run build
```
Perintah ini akan mengompilasi seluruh kode TypeScript/React menjadi berkas statis berkinerja tinggi di dalam folder `Frontend/dist/`.

### Langkah 2: Siapkan Berkas yang Diunggah ke STB
Untuk menghemat penyimpanan dan RAM pada STB, Anda **TIDAK PERLU** mengunggah folder `src/`, `node_modules/`, atau kode firmware. Cukup salin 4 komponen ini ke direktori kerja di STB:
1. Folder **`dist/`** (hasil kompilasi `npm run build`)
2. Berkas **`server.js`** (server HTTP mandiri tanpa dependensi tambahan)
3. Berkas **`ecosystem.config.js`** (konfigurasi proses PM2)
4. Berkas **`.env`** (konfigurasi lingkungan dan kredensial)

### Langkah 3: Jalankan Layanan di STB Menggunakan PM2
Di terminal STB, jalankan:
```bash
node ecosystem.config.js
```
Skrip ini secara otomatis akan mengaktifkan proses di bawah kendali PM2 dengan parameter:
* Mode latar belakang (daemon) aktif 24/7.
* Fitur auto-restart jika terjadi reboot atau mati daya.
* Pembatasan alokasi memori maksimal 300 MB.

Untuk memantau layanan di STB:
* Melihat status server: `pm2 status`
* Melihat log real-time: `pm2 logs smartadam-frontend`
* Menghentikan server: `pm2 stop smartadam-frontend`
* Memulai ulang server: `pm2 restart smartadam-frontend`

---

## 6. Fitur dan Modul Utama Sistem

1. **Dashboard Operasional & Pemanggilan:**
   * Telemetri real-time status robot (Idle, Moving, Serving, Obstacle, Error).
   * Level daya baterai (ADC) dan kapasitas sampah internal (HC-SR04).
   * Visualisasi interaktif kanvas lintasan 2D graf.
   * Antrean pemanggilan stasiun dinamis berbasis algoritma rute Dijkstra.
   * Tombol kontrol aman yang terkunci otomatis saat armada offline.

2. **Editor Topologi Graf Lintasan (Graph Editor):**
   * Manipulasi simpul stasiun (Node) dan bobot jarak lintasan (Edge).
   * Komputasi matriks ketetanggaan (Adjacency Matrix) dengan kompresi biner 1-byte per koneksi untuk menghemat RAM ESP32.
   * Ekspor C++ Header (`graph_topology.h`) untuk integrasi langsung ke firmware mikrokontroler.
   * Fitur Simpan, Ekspor JSON, dan Impor JSON topologi secara dinamis.
   * Hak akses terbatas khusus Administrator (Role Admin).

3. **Riwayat & Catatan Telemetri (Logs):**
   * Pencatatan riwayat panggilan stasiun, waktu tempuh, dan status penuntasan.
   * Log insiden halangan sensor inframerah FC-51 dan rekam telemetri kapasitas bak.
   * Fitur filter status dan pencarian riwayat secara instan.

4. **Sistem Autentikasi Pengguna & Keamanan:**
   * Dukungan Google OAuth SSO dan autentikasi email.
   * Verifikasi kode OTP 6-digit dikirimkan langsung ke email via Gmail SMTP.
   * Fitur tampil/sembunyi sandi (Eye Toggle).
   * Evaluasi syarat keamanan kata sandi real-time: panjang 6-32 karakter, huruf besar, huruf kecil, angka, dan simbol unik dengan indikator visual Hijau (Lengkap) dan Kuning (Belum Lengkap).

5. **Dukungan Dwibahasa Penuh (i18n):**
   * Peralihan bahasa secara instan antara Bahasa Indonesia (ID) dan Bahasa Inggris (EN) di seluruh halaman dan notifikasi toast.

---

## 7. Struktur Direktori Proyek

```text
Frontend/
├── public/                 # Aset statis publik (Logo SVG, Favicon, File JSON topologi uji)
├── src/
│   ├── components/         # Komponen UI modular (Navbar, OtpInput, PasswordCriteriaPanel, Modal)
│   ├── context/            # Global React Contexts (Auth, Alert, Router, Language)
│   ├── i18n/               # Kamus translasi dwibahasa (translations.ts)
│   ├── pages/              # Halaman utama aplikasi (Dashboard, GraphEditor, Logs, Login, Register, VerifyOtp, ForgotPassword)
│   ├── services/           # Logika layanan (otpService, supabase, fleetService, emailTemplate)
│   ├── App.tsx             # Titik masuk aplikasi dan pengatur metadata dokumen
│   ├── index.css           # Design tokens, variabel tema (dark/light), dan reset dasar
│   └── main.tsx            # Bootstrap React DOM
├── .env                    # Variabel konfigurasi lingkungan lokal
├── ecosystem.config.js     # Konfigurasi manajemen proses PM2 untuk STB
├── package.json            # Daftar dependensi dan perintah skrip
├── server.js               # HTTP Web Server mandiri untuk deployment produksi
├── smtpDispatcher.js       # Pengirim email native TLS SMTPS port 465 untuk Node.js
└── vite.config.js          # Konfigurasi bundler Vite dan API middleware
```

---

## 8. Lisensi & Hak Cipta

Proyek ini dikembangkan oleh **Kelompok 1 (Kelas IoT 24E)** untuk pemenuhan Ujian Akhir Semester Mata Kuliah Internet of Things. Hak cipta dilindungi undang-undang.
