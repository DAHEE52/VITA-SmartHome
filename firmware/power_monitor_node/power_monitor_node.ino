// 전력 사용량 측정 노드: PZEM-004T v3 (AC 전압/전류/전력/누적 전력량).
// 30~60초마다 FastAPI로 측정값을 POST한다.
//
// 필요 라이브러리 (Arduino Library Manager): "PZEM004Tv30" (Jakub Mandula / mandulaj)
//
// !!! 안전 경고 !!!
// PZEM-004T는 AC 전원선(220V/110V)에 직결된다. 반드시 절연 인클로저 안에서 작업하고
// line/load 방향을 데이터시트대로 확인한 뒤 통전할 것. 통전 상태에서 배선 만지지 않기.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>

#include "config.h"

static const unsigned long PUSH_INTERVAL_MS = 30000;

// PZEM은 반드시 별도 HardwareSerial 사용 (Serial은 USB 디버그 전용).
HardwareSerial pzemSerial(1);
PZEM004Tv30 pzem(pzemSerial, /*RX*/ D7, /*TX*/ D6);

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
  doc["type"] = "power_monitor";
  doc["room"] = ROOM;
  doc["label"] = ROOM " 전력 측정";

  int status = postJson("/devices/register", doc);
  Serial.print("등록 응답 코드: ");
  Serial.println(status);
}

// PZEM은 결선이 안 됐거나 읽기 실패 시 NAN을 반환하므로, 값이 있을 때만 배열에 추가한다.
void addIfValid(JsonArray &readings, const char *metric, float value) {
  if (isnan(value)) {
    return;
  }
  JsonObject r = readings.add<JsonObject>();
  r["metric"] = metric;
  r["value"] = value;
}

void pushReadings() {
  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();

  addIfValid(readings, "voltage", pzem.voltage());
  addIfValid(readings, "current", pzem.current());
  addIfValid(readings, "power_w", pzem.power());
  // energy()는 카운터 리셋 이후 누적 kWh. /energy/usage가 이 값을 구간별로 차분해서 사용량을 계산한다.
  addIfValid(readings, "energy_kwh", pzem.energy());

  if (readings.size() == 0) {
    Serial.println("PZEM 값을 읽지 못함 (배선/전원 확인 필요) - 이번 주기는 전송 생략");
    return;
  }

  int status = postJson(String("/devices/") + DEVICE_ID + "/readings", doc);
  Serial.print("readings 응답 코드: ");
  Serial.println(status);
}

void setup() {
  Serial.begin(115200);

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
