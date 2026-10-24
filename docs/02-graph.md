# 2. Arsitektur Lingkungan & Model Graf

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

Lingkungan operasional robot direpresentasikan sebagai **Weighted Undirected Graph G = (V, E)**:

* **Node (V)**: Titik persimpangan garis sekaligus lokasi pemberhentian/panggilan robot.
* **Edge (E)**: Lintasan garis hitam yang menghubungkan antar node.
* **Bobot (W)**: Jarak relatif atau estimasi waktu tempuh (nilai rentang 1 sampai 63).
* **Kapasitas Edge**: Maksimal 4 edge per node, sejajar dengan arah mata angin (**Utara, Timur, Selatan, Barat**), **dengan satu edge per arah mata angin per node** — karena robot hanya tahu arah hadap (N/E/S/W), dua edge yang searah dari node yang sama membuat tujuan belokan ambigu dan tidak dapat dieksekusi.

```text
       [Node A] (Home / Initial Node)
          |
  (N=0)   | (Weight = 12)
          v
       [Node B] <--(E=1, W=5)--> [Node C]
```

## 2.1 Enkoding Memory Data Graf (Bit-Packing Matrix)

Peta disimpan dalam bentuk **Matriks 1D Byte Array** berukuran `N x N` byte, di mana `N` adalah total jumlah node. Setiap elemen matriks (1 byte = 8 bit) merepresentasikan hubungan dari Node i ke Node j:

| Position Bit | Panjang Bit | Deskripsi Data | Rentang Nilai |
| :--- | :--- | :--- | :--- |
| **Bit 0 - 1** | 2 bit | Arah Mata Angin (*Direction*) | `00` (Utara), `01` (Timur), `10` (Selatan), `11` (Barat) |
| **Bit 2 - 7** | 6 bit | Bobot / Weight Lintasan | 1 - 63 (0 = Tidak ada hubungan/edge) |

#### Format Byte Matriks:

```text
  Bit 7   Bit 6   Bit 5   Bit 4   Bit 3   Bit 2   Bit 1   Bit 0
+-------+-------+-------+-------+-------+-------+-------+-------+
|                    WEIGHT (Bit 7 ... Bit 2)         |  DIR1 | DIR0 |
+-------+-------+-------+-------+-------+-------+-------+-------+
|<----------------- Weight ----------------->|<-- Direction -->|
```

> **Aturan Graf Undirected (Anti-Symmetric Direction)**:
>
> Jika A -> B berarah **Utara (`00`)** dengan bobot `W`, maka B -> A secara otomatis disimpan berarah **Selatan (`10`)** dengan bobot `W` yang sama pada matriks.

## 2.2 Deteksi Fisik Persimpangan (Color Marker Sensing)

Untuk membedakan antara jalur lurus biasa dan titik persimpangan/node:

* Setiap titik persimpangan (*Node*) diberi **marka penanda warna khusus** (*Color Marker*) pada lintasan garis hitam.
* Robot menggunakan **Sensor Warna / Color Sensor Module** yang dipasang bersamaan dengan array sensor *line-follower* BFD-1000 (5 channel).
* Persimpangan terdeteksi saat kelima channel BFD-1000 sama-sama melihat garis hitam (`0b11111`), lalu divalidasi oleh color marker.
* Deteksi persimpangan yang tervalidasi akan memicu event `NODE_ARRIVED` pada *Task Executor* untuk mengeksekusi logika belokan/pemberhentian.
