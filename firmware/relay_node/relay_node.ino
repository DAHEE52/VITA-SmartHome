// 릴레이(기기 on/off 제어) 노드.
// FastAPI의 "대기 명령" 엔드포인트를 2~3초마다 폴링해서 릴레이를 켜고 끈다.
// (기기가 서버에 먼저 연결을 여는 pull 방식이라 NAT/포트포워딩 없이도 동작함)
//
// 필요 라이브러리: ArduinoJson (v7)
//
// 배선 주의: 릴레이 코일측은 보통 별도 5V가 필요하고, XIAO의 5V 핀은 USB 급전 시에만
// 살아있다(배터리 구동 전환 시 주의). 옵토릴레이 보드의 극성(active-high/low)은
// config.h의 RELAY_ACTIVE_LEVEL로 반드시 실측 확인 후 설정할 것.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "config.h"

static const int RELAY_PIN = D1;
static const unsigned long POLL_INTERVAL_MS = 2500;

unsigned long lastPollMs = 0;

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
  doc["type"] = "relay";
  doc["room"] = ROOM;
  doc["label"] = ROOM " 기기 제어";

  int status = postJson("/devices/register", doc);
  Serial.print("등록 응답 코드: ");
  Serial.println(status);
}

void applyCommand(const String &command) {
  bool on = command == "on";
  digitalWrite(RELAY_PIN, on ? RELAY_ACTIVE_LEVEL : !RELAY_ACTIVE_LEVEL);
  Serial.print("릴레이 적용: ");
  Serial.println(command);
}

void ackCommand(long commandId, const String &status) {
  JsonDocument doc;
  doc["status"] = status;
  postJson(String("/devices/") + DEVICE_ID + "/commands/" + commandId + "/ack", doc);
}

void pollPendingCommands() {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/devices/" + DEVICE_ID + "/commands/pending");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  int status = http.GET();
  if (status != 200) {
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("명령 파싱 실패: ");
    Serial.println(err.c_str());
    return;
  }

  // created_at 오름차순으로 오므로 순서대로 적용하면 가장 최근 의도가 최종 반영된다.
  for (JsonObject item : doc.as<JsonArray>()) {
    long id = item["id"].as<long>();
    String command = item["command"].as<String>();
    applyCommand(command);
    ackCommand(id, "done");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, !RELAY_ACTIVE_LEVEL);  // 시작은 꺼진 상태로

  connectWiFi();
  registerDevice();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastPollMs >= POLL_INTERVAL_MS) {
    pollPendingCommands();
    lastPollMs = millis();
  }

  delay(100);
}
