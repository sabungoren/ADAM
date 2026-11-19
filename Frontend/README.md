# Project A.D.A.M - Frontend Web (React.js + TypeScript)

Antarmuka web interaktif, pemantauan telemetri real-time, dan Visual Graph Editor ala Draw.io untuk mengelola armada robot tempat sampah otomatis.

## Fitur Utama
* **Peta Graf & Tester Interaktif (`/`)**:
  - Menampilkan node secara dinamis sesuai konfigurasi dari admin.
  - Pengujian 1-klik: tester dapat mengklik node mana pun untuk memanggil armada ke node tersebut dengan antrean FIFO.
  - Avatar armada bergerak: marker robot animasi yang bergerak sepanjang edge antar-node secara real-time.
* **Quick-Call QR Code (`/cmd/:nodeId`)**:
  - Halaman responsif mobile yang dioptimalkan untuk scan stiker QR Code pada titik fisik ruangan/node.
  - Fitur 1-klik panggil, deteksi deduplikasi ("Robot sudah di sini", "Rute sudah dijadwalkan"), dan tombol pembatalan mandiri.
* **Visual Graph Editor ala Draw.io (`/admin/editor`)**:
  - Menampilkan node dalam kotak modern dengan 4 anak panah (Atas/N, Kanan/E, Bawah/S, Kiri/W).
  - **Klik anak panah**: memunculkan node baru otomatis di sebelah arah yang diklik dan menghubungkannya dengan garis edge.
  - **Drag anak panah**: menarik garis koneksi dan melepasnya ke node target yang sudah ada untuk menghubungkan kedua node.
  - **Atur Panjang/Lebar Garis**: klik atau klik kanan pada garis untuk mengubah bobot/jarak (1–63 meter/cm).
  - **Hapus Node**: tombol penghapus node dan seluruh koneksinya (dengan pengaman Home Node A).
  - Alur deployment aman: verifikasi mode pemeliharaan dan validasi konektivitas graf sebelum menyimpan.
* **Dashboard Admin (`/admin`)**:
  - Login khusus admin (`smartadam@smartadam.my.id` / `smartadam`).
  - Kontrol mode pemeliharaan (*maintenance mode*).
  - Admin Reset robot ke Home Node A.
  - Manajemen antrean dan pembatalan massal.
  - Riwayat versi graf dan fitur 1-klik rollback.
  - Audit log kejadian sistem.
  - Simulator panel untuk menguji respons armada tanpa robot fisik.

## Konfigurasi (`.env`)
```ini
PORT=5193
VITE_PORT=5193
VITE_API_URL=http://localhost:5194
```

## Menjalankan Frontend
```bash
npm run dev
```
Aplikasi web akan dapat diakses di `http://localhost:5193`.

