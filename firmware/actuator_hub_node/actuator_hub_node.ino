// 액추에이터 허브 (보드 2 - 브레드보드_최종배치_v4.md): XIAO ESP32S3 +
// PIR(HC-SR501) + 4채널 릴레이.
// PIR은 living-presence-01(env_sensor)로 30초마다 motion push, 릴레이 4개는
// living-relay-01~04(relay)로 각각 등록해서 2.5초마다 대기 명령을 poll한다.
//
// 필요 라이브러리 (Arduino Library Manager): ArduinoJson (v7)
//
// 배선(브레드보드_최종배치_v4.md 기준):
//   D1 = PIR OUT, D2 = 릴레이 IN1, D3 = 릴레이 IN2, D6 = 릴레이 IN3, D7 = 릴레이 IN4
//   (D4/D5는 INA219용으로 예약 - 이번 스케치에서는 사용 안 함)
//
// 배선 주의: 릴레이 코일측은 보통 별도 5V(XIAO의 VUSB/5V 핀, USB 급전 시에만 살아있음)가
// 필요하고, 옵토릴레이 보드의 극성(active-high/low)은 config.h의 RELAY_ACTIVE_LEVEL로
// 반드시 실측 확인 후 설정할 것.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "config.h"

static const int PIR_PIN = D1;
static const unsigned long MOTION_PUSH_INTERVAL_MS = 30000;
static const unsigned long RELAY_POLL_INTERVAL_MS = 2500;

struct RelayChannel {
  int pin;
  const char *deviceId;
};

RelayChannel relays[] = {
  {D2, RELAY1_DEVICE_ID},
  {D3, RELAY2_DEVICE_ID},
  {D6, RELAY3_DEVICE_ID},
  {D7, RELAY4_DEVICE_ID},
};
static const int RELAY_COUNT = sizeof(relays) / sizeof(relays[0]);

unsigned long lastMotionPushMs = 0;
unsigned long lastRelayPollMs = 0;

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

void registerDevice(const char *deviceId, const char *type, const char *labelSuffix) {
  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["type"] = type;
  doc["room"] = ROOM;
  doc["label"] = String(ROOM) + " " + labelSuffix;

  int status = postJson("/devices/register", doc);
  Serial.print(deviceId);
  Serial.print(" 등록 응답 코드: ");
  Serial.println(status);
}

void pushMotion() {
  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();
  JsonObject motion = readings.add<JsonObject>();
  motion["metric"] = "motion";
  motion["value"] = digitalRead(PIR_PIN) == HIGH ? 1.0 : 0.0;

  int status = postJson(String("/devices/") + PRESENCE_DEVICE_ID + "/readings", doc);
  Serial.print("motion readings 응답 코드: ");
  Serial.println(status);
}

void applyCommand(const RelayChannel &relay, const String &command) {
  bool on = command == "on";
  digitalWrite(relay.pin, on ? RELAY_ACTIVE_LEVEL : !RELAY_ACTIVE_LEVEL);
  Serial.print(relay.deviceId);
  Serial.print(" 릴레이 적용: ");
  Serial.println(command);
}

void ackCommand(const char *deviceId, long commandId, const String &status) {
  JsonDocument doc;
  doc["status"] = status;
  postJson(String("/devices/") + deviceId + "/commands/" + commandId + "/ack", doc);
}

void pollPendingCommands(const RelayChannel &relay) {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/devices/" + relay.deviceId + "/commands/pending");
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
    applyCommand(relay, command);
    ackCommand(relay.deviceId, id, "done");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  for (int i = 0; i < RELAY_COUNT; i++) {
    pinMode(relays[i].pin, OUTPUT);
    digitalWrite(relays[i].pin, !RELAY_ACTIVE_LEVEL);  // 시작은 꺼진 상태로
  }

  connectWiFi();
  registerDevice(PRESENCE_DEVICE_ID, "env_sensor", "재실(PIR) 센서");
  registerDevice(RELAY1_DEVICE_ID, "relay", "기기 제어 1");
  registerDevice(RELAY2_DEVICE_ID, "relay", "기기 제어 2");
  registerDevice(RELAY3_DEVICE_ID, "relay", "기기 제어 3");
  registerDevice(RELAY4_DEVICE_ID, "relay", "기기 제어 4");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastMotionPushMs >= MOTION_PUSH_INTERVAL_MS) {
    pushMotion();
    lastMotionPushMs = millis();
  }

  if (millis() - lastRelayPollMs >= RELAY_POLL_INTERVAL_MS) {
    for (int i = 0; i < RELAY_COUNT; i++) {
      pollPendingCommands(relays[i]);
    }
    lastRelayPollMs = millis();
  }

  delay(100);
}
