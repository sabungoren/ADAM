# 9. Pemetaan Pin (Pin Mapping)

*Bagian dari spesifikasi Project A.D.A.M — indeks: [README.md](../README.md)*

Sumber kebenaran tabel ini adalah `#define` di `src/motor.h`, `src/sensors.h`, dan `src/dwell.c`. Kalau pin fisik diubah, ubah `#define`-nya dulu, baru tabel ini.

## ESP32 devkit

## Driver Motor L298N (PWM via LEDC)

| GPIO | Sinyal | Arah | Keterangan |
| :--- | :--- | :--- | :--- |
| 14 | ENA | PWM out | Kecepatan motor kiri (LEDC channel 0) |
| 27 | IN1 | Out | Arah kiri 1 |
| 26 | IN2 | Out | Arah kiri 2 |
| 32 | ENB | PWM out | Kecepatan motor kanan (LEDC channel 1) |
| 25 | IN3 | Out | Arah kanan 1 |
| 33 | IN4 | Out | Arah kanan 2 |

PWM: frekuensi 1 kHz, resolusi 8-bit (duty 0–255), timer LEDC low-speed.

## Sensor Garis (3× IR line sensor)

| GPIO | Sinyal | Arah | Keterangan |
| :--- | :--- | :--- | :--- |
| 34 | IR LEFT | Input | Bit0 pola garis |
| 35 | IR MID | Input | Bit1 pola garis |
| 39 | IR RIGHT | Input | Bit2 pola garis |

> ⚠️ GPIO 34, 35, 39 adalah *input-only* pin dan **tidak punya pull internal** — konfigurasi `GPIO_PULLUP_ENABLE` di `sensors.c` tidak berpengaruh pada ketiganya; aktif/kedua level garisnya bergantung rangkaian pull-up eksternal modul.

## Sensor Warna TCS3200

| GPIO | Sinyal | Arah | Keterangan |
| :--- | :--- | :--- | :--- |
| 19 | S0 | Out | Skala frekuensi out — bitrate 20% (`S0=H`, `S1=L`) |
| 18 | S1 | Out | Skala frekuensi out |
| 5 | S2 | Out | Pilih filter (R/G/B) |
| 17 | S3 | Out | Pilih filter (R/G/B) |
| 16 | OUT | Input | Keluaran frekuensi warna (pull-up enable) |

## Ultrasonik HC-SR04 (pengaman halangan depan)

| GPIO | Sinyal | Arah | Keterangan |
| :--- | :--- | :--- | :--- |
| 4 | TRIG | Out | Trigger pulse |
| 15 | ECHO | Input | Echo (pull-up enable) |

## Aktuator & Ekstra

| GPIO | Sinyal | Arah | Keterangan |
| :--- | :--- | :--- | :--- |
| 13 | FC-51 | Input | Pengereman halangan sementara (spec 7.3) |
| 2 | BUZZER | Out | Buzzer navigasi (beep saat manuver, desah halangan) |
| 23 | SERVO | PWM out | Servo tutup tempat sampah: 50 Hz, resolusi 14-bit, pulsa 500–2400 µs; terbuka 90°, tertutup 0° |
| 36 | BAT ADC | ADC in | GPIO36 = ADC1_CH0, pembacaan tegangan baterai, pembacaan 0–4095 |

> Catatan baterai: pembacaan hanya memakai ADC1 (GPIO36) karena ADC2 tidak dapat dipakai bersamaan WiFi aktif — jangan pindahkan pin baterai ke ADC2.
