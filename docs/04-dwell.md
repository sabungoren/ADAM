# 4. Dwell Time & Interaksi Tempat Sampah di Node Tujuan

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

Saat robot tiba di Node tujuan panggilan:

1. **Pembukaan Tutup Sampah**: Motor servo/aktuator membuka tutup sampah otomatis.
2. **Dwell Timer & Sensor Interaksi**:
   * Timer internal (misal: 15 sampai 30 detik) mulai berjalan.
   * Sensor interaksi proximity/IR pada tempat sampah memantau aktivitas pengguna (membuang sampah).
   * **Aturan Reset Timer**: Jika sensor mendeteksi aktivitas pengguna sebelum timer habis, timer akan diperpanjang/di-reset ulang untuk memberi waktu pengguna membuang sampah.
3. **Penyelesaian Task**:
   * Jika **timer habis** dan **tidak ada lagi interaksi** pengguna yang terdeteksi, tempat sampah otomatis menutup.
   * Robot langsung berpindah mengeksekusi tujuan berikutnya di antrean (*Queue*). Jika antrean kosong, robot kembali ke mode `IDLE`.
