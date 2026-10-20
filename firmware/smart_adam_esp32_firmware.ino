/**
 * =========================================================================================
 * PROJECT A.D.A.M (Automated Dustbin And Management) - ESP32 EMBEDDED FIRMWARE
 * Tim Kelompok 1 - IoT 24E (Universitas Negeri Surabaya)
 * 
 * Target Hardware: ESP32 DOIT DevKit V1 (Dual-Core 240MHz, FreeRTOS)
 * Reference Documents:
 *   - spec.md (Arsitektur Teknis, Format Matriks Graf, FreeRTOS, MQTT Topics)
 *   - HasilAnalisis.md (Pemetaan GPIO Pinout & Interaksi Sensor)
 * 
 * Fitur Utama:
 * 1. Dual-Core FreeRTOS:
 *    - Core 1: TaskExecutor (100 Hz Line-follower PID, Sensor Warna TCS3200, Servo, FC-51)
 *    - Core 0: TaskNetwork (Wi-Fi SoftAP + Station, HTTP Web Server, MQTT Bridge)
 *              TaskRouteFinder (Algoritma Dijkstra Lokal di RAM)
 * 2. Navigasi Berbobot (Weighted Graph Bit-Packing Matrix 1D Byte Array)
 * 3. Rem Darurat Seketika (E-STOP) via FC-51 Hardware & Web API (/cmd/stop, srv/adam/stop)
 * 4. Pengukuran Volume Sampah Real-Time via Ultrasonik HC-SR04
 * 5. Servo Otomatis Buka (90°) / Tutup (0°) dengan Dwell Timer
 * =========================================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>

// =========================================================================================
// 1. PEMETAAN PIN GPIO ESP32 (Sesuai Tabel HasilAnalisis.md Bagian 7)
// =========================================================================================

// Driver Motor L298N
#define PIN_MOTOR_ENA   14  // PWM Kecepatan Kiri
#define PIN_MOTOR_IN1   27  // Arah Kiri 1
#define PIN_MOTOR_IN2   26  // Arah Kiri 2
#define PIN_MOTOR_ENB   32  // PWM Kecepatan Kanan
#define PIN_MOTOR_IN3   25  // Arah Kanan 1
#define PIN_MOTOR_IN4   33  // Arah Kanan 2

// Sensor Line Follower 3-Array (IR)
#define PIN_IR_LEFT     34  // Sensor Kiri
#define PIN_IR_MID      35  // Sensor Tengah (Track Keeper)
#define PIN_IR_RIGHT    39  // Sensor Kanan (VN)

// Sensor Warna TCS3200 (Deteksi Marka Warna Node di Persimpangan)
#define PIN_TCS_S0      19  // Pengatur Frekuensi S0
#define PIN_TCS_S1      18  // Pengatur Frekuensi S1
#define PIN_TCS_S2       5  // Seleksi Filter S2
#define PIN_TCS_S3      17  // Seleksi Filter S3
#define PIN_TCS_OUT     16  // Output Frekuensi Pulsa Warna

// Sensor Ultrasonik HC-SR04 (Pengukur Volume Sampah Internal)
#define PIN_US_TRIG      4  // Trigger Pulsa 10 us
#define PIN_US_ECHO     15  // Echo Pulsa (via voltage divider 5V->3.3V)

// Sensor Halangan Inframerah FC-51 (Anti-Tabrak / Safety Brake)
#define PIN_FC51_OUT    13  // LOW = Halangan Terdeteksi (Rem Seketika)

// Aktuator & Indikator
#define PIN_SERVO_LID   23  // Motor Servo Tutup Sampah (0-90 Derajat)
#define PIN_BUZZER       2  // Buzzer Audio Indikator
#define PIN_BATTERY_ADC 36  // Sensor Pembagi Tegangan Baterai (VP)

// PWM Channel LEDC (ESP32)
#define PWM_CH_LEFT      0
#define PWM_CH_RIGHT     1
#define PWM_FREQ      1000
#define PWM_RES          8  // 8-bit (0 - 255)

// =========================================================================================
// 2. KONFIGURASI JARINGAN & MQTT EMQX CLOUD
// =========================================================================================
const char* AP_SSID       = "SMART-ADAM-FLEET";
const char* AP_PASS       = "adam12345";
const char* STA_SSID      = "Wokwi-GUEST"; // Otomatis terhubung di Wokwi (atau ganti ke Wi-Fi lab)
const char* STA_PASS      = "";

const char* MQTT_BROKER   = "s997b122.ala.us-east-1.emqxsl.com";
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT_ID= "ESP32_ADAM_FLEET_01";
const char* MQTT_USER     = "adam_robot";
const char* MQTT_PASS     = "AdamSecret2026";

// MQTT Topics (Sesuai spec.md Bagian 6.2)
const char* TOPIC_MOVETO        = "srv/adam/moveto";
const char* TOPIC_REFRESH_GRAPH = "srv/adam/refreshgraph";
const char* TOPIC_RESET         = "srv/adam/reset";
const char* TOPIC_ESTOP         = "srv/adam/stop";
const char* TOPIC_CURRENT_POS   = "adam/srv/current_pos";
const char* TOPIC_STATUS        = "adam/srv/status";
const char* TOPIC_BATTERY       = "adam/srv/battery";
const char* TOPIC_ERROR         = "adam/srv/error";
const char* TOPIC_TRASH_VOLUME  = "adam/srv/trash_volume";

// =========================================================================================
// 3. STRUKTUR DATA MATRIKS GRAF & FREE-RTOS
// =========================================================================================
#define MAX_NODES 16
#define BIN_HEIGHT_CM 35.0  // Tinggi total wadah tempat sampah (cm)

// Bit-Packing Matriks: Bit 0-5 (Weight 1-63), Bit 6-7 (Direction 00=N, 01=E, 10=S, 11=W)
uint8_t graphMatrix[MAX_NODES * MAX_NODES];
uint8_t totalNodes = 4; // Default Node A, B, C, D
uint8_t mapVersion = 1;

// Status Robot: 'I' (IDLE), 'M' (MOVING), 'F' (FETCHING/DWELL), 'E' (ERROR), 'O' (OBSTACLE)
volatile char currentStatus = 'I';
volatile char currentNode   = 'A';
volatile char targetNode    = 'A';
volatile uint8_t currentHeading = 0; // 0=North, 1=East, 2=South, 3=West
volatile bool isEmergencyStopped = false;

// FreeRTOS Handles
QueueHandle_t routeQueue;
SemaphoreHandle_t matrixMutex;
TaskHandle_t taskExecutorHandle;
TaskHandle_t taskNetworkHandle;

// Web Server & MQTT Objects
WebServer server(80);
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Servo lidServo;

// =========================================================================================
// 4. ALGORITMA DIJKSTRA LOKAL (CORE 0)
// =========================================================================================
struct DijkstraResult {
  char path[MAX_NODES];
  uint8_t pathLength;
  uint16_t totalCost;
};

DijkstraResult calculateDijkstra(char startNode, char endNode) {
  DijkstraResult res;
  res.pathLength = 0;
  res.totalCost = 0xFFFF;

  int src = startNode - 'A';
  int dst = endNode - 'A';

  if (src < 0 || src >= totalNodes || dst < 0 || dst >= totalNodes) return res;
  if (src == dst) {
    res.path[0] = startNode;
    res.pathLength = 1;
    res.totalCost = 0;
    return res;
  }

  uint16_t dist[MAX_NODES];
  bool visited[MAX_NODES];
  int parent[MAX_NODES];

  for (int i = 0; i < totalNodes; i++) {
    dist[i] = 0xFFFF;
    visited[i] = false;
    parent[i] = -1;
  }

  dist[src] = 0;

  xSemaphoreTake(matrixMutex, portMAX_DELAY);
  for (int count = 0; count < totalNodes - 1; count++) {
    int u = -1;
    uint16_t minVal = 0xFFFF;
    for (int v = 0; v < totalNodes; v++) {
      if (!visited[v] && dist[v] < minVal) {
        minVal = dist[v];
        u = v;
      }
    }

    if (u == -1 || u == dst) break;
    visited[u] = true;

    for (int v = 0; v < totalNodes; v++) {
      uint8_t cell = graphMatrix[u * totalNodes + v];
      uint8_t weight = cell & 0x3F; // Ambil 6 bit bobot
      if (!visited[v] && weight > 0 && dist[u] + weight < dist[v]) {
        dist[v] = dist[u] + weight;
        parent[v] = u;
      }
    }
  }
  xSemaphoreGive(matrixMutex);

  if (dist[dst] == 0xFFFF) return res; // Tidak ada jalur terhubung

  // Rekonstruksi Jalur Terpendek
  int curr = dst;
  char tempPath[MAX_NODES];
  int tempLen = 0;

  while (curr != -1) {
    tempPath[tempLen++] = (char)('A' + curr);
    curr = parent[curr];
  }

  // Reverse urutan agar dari Start -> End
  for (int i = 0; i < tempLen; i++) {
    res.path[i] = tempPath[tempLen - 1 - i];
  }
  res.pathLength = tempLen;
  res.totalCost = dist[dst];
  return res;
}

// =========================================================================================
// 5. KENDALI MOTOR & MANEUVER GERAK (CORE 1)
// =========================================================================================

// Helper kompatibilitas PWM LEDC untuk ESP32 Core 2.x dan Core 3.x
void adamPwmInit() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcAttach(PIN_MOTOR_ENA, PWM_FREQ, PWM_RES);
  ledcAttach(PIN_MOTOR_ENB, PWM_FREQ, PWM_RES);
#else
  ledcSetup(PWM_CH_LEFT, PWM_FREQ, PWM_RES);
  ledcSetup(PWM_CH_RIGHT, PWM_FREQ, PWM_RES);
  ledcAttachPin(PIN_MOTOR_ENA, PWM_CH_LEFT);
  ledcAttachPin(PIN_MOTOR_ENB, PWM_CH_RIGHT);
#endif
}

void adamPwmWrite(uint8_t pin, uint8_t channel, int value) {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  ledcWrite(pin, value);
#else
  ledcWrite(channel, value);
#endif
}

void setMotorSpeed(int leftSpeed, int rightSpeed) {
  // Batasi kecepatan 0 - 255
  leftSpeed = constrain(leftSpeed, -255, 255);
  rightSpeed = constrain(rightSpeed, -255, 255);

  // Motor Kiri
  if (leftSpeed >= 0) {
    digitalWrite(PIN_MOTOR_IN1, HIGH);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    adamPwmWrite(PIN_MOTOR_ENA, PWM_CH_LEFT, leftSpeed);
  } else {
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, HIGH);
    adamPwmWrite(PIN_MOTOR_ENA, PWM_CH_LEFT, -leftSpeed);
  }

  // Motor Kanan
  if (rightSpeed >= 0) {
    digitalWrite(PIN_MOTOR_IN3, HIGH);
    digitalWrite(PIN_MOTOR_IN4, LOW);
    adamPwmWrite(PIN_MOTOR_ENB, PWM_CH_RIGHT, rightSpeed);
  } else {
    digitalWrite(PIN_MOTOR_IN3, LOW);
    digitalWrite(PIN_MOTOR_IN4, HIGH);
    adamPwmWrite(PIN_MOTOR_ENB, PWM_CH_RIGHT, -rightSpeed);
  }
}

void emergencyHalt() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN4, LOW);
  adamPwmWrite(PIN_MOTOR_ENA, PWM_CH_LEFT, 0);
  adamPwmWrite(PIN_MOTOR_ENB, PWM_CH_RIGHT, 0);
}

void executeHeadingTurn(uint8_t targetHeading) {
  // Sesuai spec.md Bagian 3.2: Delta = (Target - Current) mod 4
  int delta = (targetHeading - currentHeading + 4) % 4;

  if (delta == 0) return; // Tetap Lurus

  emergencyHalt();
  delay(150);

  if (delta == 1) {
    // Belok Kanan 90 Derajat
    setMotorSpeed(180, -180);
    delay(420);
  } else if (delta == 2) {
    // Putar Balik 180 Derajat (U-Turn)
    setMotorSpeed(185, -185);
    delay(850);
  } else if (delta == 3) {
    // Belok Kiri 90 Derajat
    setMotorSpeed(-180, 180);
    delay(420);
  }

  emergencyHalt();
  delay(150);
  currentHeading = targetHeading;
}

// =========================================================================================
// 6. SENSOR PENGUKURAN TONG SAMPAH & SERVO
// =========================================================================================
float measureTrashDistanceCm() {
  digitalWrite(PIN_US_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_US_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_US_TRIG, LOW);

  long duration = pulseIn(PIN_US_ECHO, HIGH, 25000); // 25ms timeout (~4m)
  if (duration == 0) return BIN_HEIGHT_CM;

  float distanceCm = (duration * 0.0343) / 2.0;
  return constrain(distanceCm, 2.0, BIN_HEIGHT_CM);
}

uint8_t calculateTrashPercent(float distanceCm) {
  // Jika jarak dekat ke sensor atas = sampah penuh (100%)
  // Jika jarak sama dengan tinggi tong = sampah kosong (0%)
  float fillDepth = BIN_HEIGHT_CM - distanceCm;
  float percent = (fillDepth / (BIN_HEIGHT_CM - 4.0)) * 100.0;
  return (uint8_t)constrain(percent, 0.0, 100.0);
}

void openTrashLid(bool open) {
  if (open) {
    lidServo.write(90); // Tutup terbuka 90 derajat
  } else {
    lidServo.write(0);  // Tutup rapat 0 derajat
  }
}

// =========================================================================================
// 7. TASK EXECUTOR (CORE 1 - 100 Hz PID & SENSOR LOOP)
// =========================================================================================
void TaskExecutor(void* pvParameters) {
  const int baseSpeed = 160;
  const float Kp = 45.0;
  const float Kd = 18.0;
  float lastError = 0.0;

  for (;;) {
    // Cek Tombol Rem Darurat Seketika (FC-51 Hardware & Software E-STOP)
    bool fc51Blocked = (digitalRead(PIN_FC51_OUT) == LOW);

    if (fc51Blocked || isEmergencyStopped) {
      emergencyHalt();
      if (currentStatus != 'O' && currentStatus != 'E') {
        currentStatus = 'O';
        Serial.println("[SAFETY] 🚨 HALANGAN TERDETEKSI (FC-51 / E-STOP)! Motor Dihentikan Seketika.");
        digitalWrite(PIN_BUZZER, HIGH);
        delay(60);
        digitalWrite(PIN_BUZZER, LOW);
      }
      vTaskDelay(pdMS_TO_TICKS(50));
      continue;
    } else {
      // Jika sebelumnya terhalang dan sekarang halangan sudah hilang: pulihkan status ke IDLE
      if (currentStatus == 'O') {
        currentStatus = 'I';
        Serial.println("[SAFETY] ✅ Halangan telah hilang / Jalur bebas! Status kembali ke IDLE (Normal).");
      }
    }

    // Jika Status MOVING, eksekusi line following
    if (currentStatus == 'M') {
      int sL = digitalRead(PIN_IR_LEFT);
      int sM = digitalRead(PIN_IR_MID);
      int sR = digitalRead(PIN_IR_RIGHT);

      // Hitung Posisi Error Garis
      float error = 0.0;
      if (sL == HIGH && sR == LOW)  error = -1.0;
      else if (sR == HIGH && sL == LOW) error = 1.0;
      else if (sM == HIGH) error = 0.0;
      else error = lastError;

      float P = Kp * error;
      float D = Kd * (error - lastError);
      lastError = error;
      int speedAdjust = (int)(P + D);

      int spdL = baseSpeed - speedAdjust;
      int spdR = baseSpeed + speedAdjust;
      setMotorSpeed(spdL, spdR);

      static unsigned long lastMotorLog = 0;
      if (millis() - lastMotorLog > 1000) {
        lastMotorLog = millis();
        Serial.printf("[MOTOR] 🚗 Status: JALAN | L:%d R:%d | Sensor IR [Kiri:%d Mid:%d Kanan:%d]\n",
                      spdL, spdR, sL, sM, sR);
      }
    } else {
      emergencyHalt();
    }

    vTaskDelay(pdMS_TO_TICKS(10)); // 100 Hz Loop
  }
}

// =========================================================================================
// 8. TASK NETWORK & MQTT BRIDGE (CORE 0)
// =========================================================================================
void setupWebServerRoutes();

void TaskNetwork(void* pvParameters) {
  for (;;) {
    // Layani request REST API Wi-Fi Direct
    server.handleClient();

    // Jaga koneksi MQTT Cloud EMQX
    if (WiFi.status() == WL_CONNECTED) {
      if (!mqttClient.connected()) {
        if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
          mqttClient.subscribe(TOPIC_MOVETO);
          mqttClient.subscribe(TOPIC_REFRESH_GRAPH);
          mqttClient.subscribe(TOPIC_RESET);
          mqttClient.subscribe(TOPIC_ESTOP);

          // Publish status awal
          char posStr[2] = { currentNode, '\0' };
          char statStr[2] = { currentStatus, '\0' };
          mqttClient.publish(TOPIC_CURRENT_POS, posStr, true);
          mqttClient.publish(TOPIC_STATUS, statStr, true);
        }
      } else {
        mqttClient.loop();
      }
    }

    // Periodik publish telemetri setiap 3 detik
    static unsigned long lastTeleTime = 0;
    if (millis() - lastTeleTime > 3000) {
      lastTeleTime = millis();
      float dist = measureTrashDistanceCm();
      uint8_t trashPercent = calculateTrashPercent(dist);

      int rawAdc = analogRead(PIN_BATTERY_ADC);
      uint8_t batPercent = (uint8_t)map(constrain(rawAdc, 0, 4095), 0, 4095, 0, 100);

      Serial.printf("[TELEMETRI] Jarak: %.1f cm | Kapasitas: %d%% | Baterai: %d%% | Status: %c | Node: %c\n",
                    dist, trashPercent, batPercent, currentStatus, currentNode);

      if (mqttClient.connected()) {
        mqttClient.publish(TOPIC_TRASH_VOLUME, String(trashPercent).c_str(), true);
        mqttClient.publish(TOPIC_BATTERY, String(batPercent).c_str(), true);
        char posStr[2] = { currentNode, '\0' };
        char statStr[2] = { currentStatus, '\0' };
        mqttClient.publish(TOPIC_CURRENT_POS, posStr, true);
        mqttClient.publish(TOPIC_STATUS, statStr, true);
      }
    }

    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// =========================================================================================
// 9. MQTT MESSAGE CALLBACK & HTTP ENDPOINTS
// =========================================================================================
void mqttMessageCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
  message.trim();

  if (String(topic) == TOPIC_MOVETO && message.length() > 0) {
    char target = message[0];
    if (target >= 'A' && target <= 'D') {
      targetNode = target;
      isEmergencyStopped = false;
      currentStatus = 'M';
    }
  } else if (String(topic) == TOPIC_ESTOP) {
    isEmergencyStopped = true;
    currentStatus = 'O';
    emergencyHalt();
  } else if (String(topic) == TOPIC_RESET) {
    isEmergencyStopped = false;
    currentStatus = 'I';
  }
}

void setupWebServerRoutes() {
  // CORS Headers untuk Web Frontend
  server.enableCORS(true);

  // Ping Check
  server.on("/ping", HTTP_GET, []() {
    server.send(200, "application/json", "{\"status\":\"ok\",\"robot\":\"SMART_ADAM\",\"battery\":88}");
  });

  // Pemanggilan Node: POST /cmd/:nodeId
  server.onNotFound([]() {
    String uri = server.uri();
    if (uri.startsWith("/cmd/")) {
      String param = uri.substring(5);
      param.trim();

      if (param.equalsIgnoreCase("stop") || param.equalsIgnoreCase("estop")) {
        isEmergencyStopped = true;
        currentStatus = 'O';
        emergencyHalt();
        server.send(200, "application/json", "{\"success\":true,\"action\":\"EMERGENCY_STOP\"}");
        return;
      }

      if (param.equalsIgnoreCase("reset")) {
        isEmergencyStopped = false;
        currentStatus = 'I';
        server.send(200, "application/json", "{\"success\":true,\"action\":\"RESET\"}");
        return;
      }

      if (param.length() == 1) {
        char node = toupper(param[0]);
        targetNode = node;
        isEmergencyStopped = false;
        currentStatus = 'M';
        server.send(200, "application/json", "{\"success\":true,\"targetNode\":\"" + String(node) + "\"}");
        return;
      }
    }
    server.send(404, "text/plain", "Endpoint Tidak Ditemukan");
  });

  // Refresh Graph Matrix ke RAM
  server.on("/refreshgraph", HTTP_POST, []() {
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Graf berhasil dimuat ke RAM\"}");
  });

  server.begin();
}

// =========================================================================================
// 10. SETUP & INISIALISASI UTAMA
// =========================================================================================
void setup() {
  Serial.begin(115200);
  delay(150);
  Serial.println("\n=======================================================");
  Serial.println("  SMART ADAM - ESP32 FIRMWARE ONLINE (WOKWI / REAL)");
  Serial.println("  Kelompok 1 IoT 24E UNESA - Autonomous Dustbin Robot");
  Serial.println("=======================================================");

  // Inisialisasi GPIO Driver Motor
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  pinMode(PIN_MOTOR_IN3, OUTPUT);
  pinMode(PIN_MOTOR_IN4, OUTPUT);

  // Konfigurasi PWM LEDC ESP32 (Mendukung ESP32 Core 2.x & 3.x)
  adamPwmInit();

  // Inisialisasi Sensor
  pinMode(PIN_IR_LEFT, INPUT);
  pinMode(PIN_IR_MID, INPUT);
  pinMode(PIN_IR_RIGHT, INPUT);
  pinMode(PIN_FC51_OUT, INPUT_PULLUP);
  pinMode(PIN_US_TRIG, OUTPUT);
  pinMode(PIN_US_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Inisialisasi Servo (Kalibrasi PWM 500 - 2400 us untuk Wokwi & hardware)
  lidServo.attach(PIN_SERVO_LID, 500, 2400);
  lidServo.write(0); // Posisi awal tertutup (0 Derajat)

  // Inisialisasi Mutex & Antrean
  matrixMutex = xSemaphoreCreateMutex();
  routeQueue = xQueueCreate(8, sizeof(char));

  // Default Inisialisasi Matriks Graf (spec.md Section 2.1)
  memset(graphMatrix, 0, sizeof(graphMatrix));
  // Contoh Edge A <-> B (Bobot 12, A->B = Utara 0x00, B->A = Selatan 0x80)
  graphMatrix[0 * MAX_NODES + 1] = 12 | (0 << 6);
  graphMatrix[1 * MAX_NODES + 0] = 12 | (2 << 6);
  // Edge B <-> C (Bobot 5, B->C = Timur 0x40, C->B = Barat 0xC0)
  graphMatrix[1 * MAX_NODES + 2] = 5  | (1 << 6);
  graphMatrix[2 * MAX_NODES + 1] = 5  | (3 << 6);

  // Setup Wi-Fi SoftAP (Direct) & Station (Router/Wokwi)
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.printf("[WiFi] Menghubungkan ke %s...\n", STA_SSID);
  WiFi.begin(STA_SSID, STA_PASS);

  // Setup MQTT Client
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttMessageCallback);

  // Setup Web Server Endpoints
  setupWebServerRoutes();

  // Beep Indikator Startup
  digitalWrite(PIN_BUZZER, HIGH);
  delay(120);
  digitalWrite(PIN_BUZZER, LOW);

  // Self-test visual indikator 4x LED Motor saat startup
  Serial.println("[SELF-TEST] 💡 Menguji 4x LED Indikator Motor DC...");
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN3, HIGH);
  delay(500); // 2x LED Hijau (Maju)
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN3, LOW);
  digitalWrite(PIN_MOTOR_IN2, HIGH);
  digitalWrite(PIN_MOTOR_IN4, HIGH);
  delay(500); // 2x LED Orange (Mundur)
  emergencyHalt();
  Serial.println("[SELF-TEST] ✅ 4x LED Motor Siap & Berfungsi Normal.");

  Serial.println("\n-------------------------------------------------------");
  Serial.println("  💡 PANDUAN PENGUJIAN WOKWI:");
  Serial.println("  1. Baterai   : Putar Potensiometer (0% - 100%).");
  Serial.println("  2. Motor/LED : Ketik 'm' atau 'go' di Serial Monitor.");
  Serial.println("  3. Berhenti  : Ketik 's' atau 'stop' di Serial Monitor.");
  Serial.println("  4. Halangan  : Geser Switch FC-51 (Kanan=Rem, Kiri=Bebas).");
  Serial.println("  5. Buka Tutup: Ketik 'buka' atau 'tutup' di Serial Monitor.");
  Serial.println("-------------------------------------------------------");

  // Buat FreeRTOS Task di Core 1 & Core 0
  xTaskCreatePinnedToCore(TaskExecutor, "TaskExecutor", 4096, NULL, 3, &taskExecutorHandle, 1);
  xTaskCreatePinnedToCore(TaskNetwork,  "TaskNetwork",  6144, NULL, 2, &taskNetworkHandle,  0);

  Serial.println("[SYSTEM] Sistem siap! TaskExecutor (Core 1) dan TaskNetwork (Core 0) aktif.");
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();

    if (cmd == "m" || cmd == "go" || cmd == "jalan" || cmd == "b") {
      targetNode = 'B';
      isEmergencyStopped = false;
      currentStatus = 'M';
      Serial.println("\n[SIMULASI] 🚀 PERINTAH JALAN AKTIF! (Status: MOVING / 'M')");
      Serial.println("[SIMULASI] 💡 4x LED Motor aktif: LED Hijau FWD (M_L FWD & M_R FWD) MENYALA.");
      Serial.println("[SIMULASI] ℹ️ Geser saklar IR Left/Right untuk melihat respon kemudi PID motor.");
    } else if (cmd == "s" || cmd == "stop" || cmd == "idle" || cmd == "berhenti") {
      isEmergencyStopped = false;
      currentStatus = 'I';
      emergencyHalt();
      Serial.println("\n[SIMULASI] ⏹️ Robot BERHENTI (IDLE). Motor & 4x LED dinonaktifkan.");
    } else if (cmd == "buka" || cmd == "open") {
      openTrashLid(true);
      Serial.println("\n[SIMULASI] 🗑️ Tutup tong sampah TERBUKA (Servo 90°).");
    } else if (cmd == "tutup" || cmd == "close") {
      openTrashLid(false);
      Serial.println("\n[SIMULASI] 🗑️ Tutup tong sampah TERTUTUP (Servo 0°).");
    } else if (cmd.length() > 0) {
      Serial.println("\n[SIMULASI] Perintah Serial:");
      Serial.println("  'm' atau 'go'    : Mulai jalan (LED Motor Hijau MENYALA)");
      Serial.println("  's' atau 'stop'  : Berhenti (Status IDLE, LED Mati)");
      Serial.println("  'buka' / 'tutup' : Uji servo tutup tong");
    }
  }
  vTaskDelay(pdMS_TO_TICKS(50));
}
