# 3. Booting & Navigasi Orientasi Hadap (Heading Control)

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

## 3.1 Inisialisasi Booting (Initial State)

Saat robot pertama kali dinyalakan (*power-on / restart*):

* **Posisi Default**: Node **'A'** (Home Node).
* **Arah Hadap Default**: **Utara** (`00` / `NORTH`).
* Status awal robot diatur ke `IDLE`.

## 3.2 Logika Perubahan Orientasi

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
