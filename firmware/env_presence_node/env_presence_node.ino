// 환경/재실 감지 노드: BME280(온습도) + PIR(HC-SR501, 재실 감지)
// 30~60초마다 FastAPI로 센서 값을 POST한다.
//
// 필요 라이브러리 (Arduino Library Manager에서 설치):
//   - Adafruit BME280 Library (+ 의존성: Adafruit Unified Sensor, Adafruit BusIO)
//   - ArduinoJson (v7)
//
// 배선 주의: PIR 모듈은 반드시 3V3에서 전원을 공급할 것 (5V로 공급하면 OUT 레벨이
// ESP32 GPIO 안전전압을 넘을 수 있음).

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

#include "config.h"

static const int PIR_PIN = D0;
static const unsigned long PUSH_INTERVAL_MS = 30000;

Adafruit_BME280 bme;
bool bmeReady = false;
unsigned long lastPushMs = 0;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi 연결 중");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi 연결됨: ");
  Serial.println(WiFi.localIP());
}

// path: "/devices/register" 같은 절대 경로. 반환값은 HTTP 상태 코드(실패 시 음수).
int postJson(const String &path, JsonDocument &doc) {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  String body;
  serializeJson(doc, body);

  int status = http.POST(body);
  http.end();
  return status;
}

void registerDevice() {
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["type"] = "env_sensor";
  doc["room"] = ROOM;
  doc["label"] = ROOM " 온습도/재실 센서";

  int status = postJson("/devices/register", doc);
  Serial.print("등록 응답 코드: ");
  Serial.println(status);
}

void pushReadings() {
  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();

  if (bmeReady) {
    JsonObject temp = readings.add<JsonObject>();
    temp["metric"] = "temperature";
    temp["value"] = bme.readTemperature();

    JsonObject humidity = readings.add<JsonObject>();
    humidity["metric"] = "humidity";
    humidity["value"] = bme.readHumidity();
  }

  JsonObject motion = readings.add<JsonObject>();
  motion["metric"] = "motion";
  motion["value"] = digitalRead(PIR_PIN) == HIGH ? 1.0 : 0.0;

  int status = postJson(String("/devices/") + DEVICE_ID + "/readings", doc);
  Serial.print("readings 응답 코드: ");
  Serial.println(status);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);

  Wire.begin();
  bmeReady = bme.begin(0x76, &Wire);
  if (!bmeReady) {
    bmeReady = bme.begin(0x77, &Wire);
  }
  if (!bmeReady) {
    Serial.println("BME280을 찾지 못함 (0x76/0x77 모두 실패) - 온습도 없이 재실 감지만 동작");
  }

  connectWiFi();
  registerDevice();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastPushMs >= PUSH_INTERVAL_MS) {
    pushReadings();
    lastPushMs = millis();
  }

  delay(200);
}
