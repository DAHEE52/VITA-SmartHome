// 전력 측정 + 원격 제어 통합 노드: PZEM-004T v3(AC 전압/전류/전력/누적 전력량) + 릴레이 1채널.
// 콘센트 하나(스마트플러그 형태)로 "이 기기가 지금 몇 W를 쓰는지"와 "이 기기를 켜고 끄기"를
// device_id 하나로 동시에 처리한다 - power_monitor_node + relay_node를 한 보드에 합친 것.
//
// 등록 시 type을 "power_monitor"로 보낸다. 백엔드의 /devices/{id}/control과 /commands/pending은
// type을 보지 않고 device_id 기준으로만 동작하므로, 이 type으로도 릴레이 제어에는 문제가 없고
// 대신 에너지 사용량 화면(kWh 꺾은선 그래프)의 집계 대상(GET /energy/usage)에 포함된다.
//
// 필요 라이브러리 (Arduino Library Manager): "PZEM004Tv30" (Jakub Mandula / mandulaj), "ArduinoJson"(v7)
//
// !!! 안전 경고 !!!
// PZEM-004T는 AC 전원선(220V/110V)에 직결된다. 반드시 절연 인클로저 안에서 작업하고
// line/load 방향을 데이터시트대로 확인한 뒤 통전할 것. 통전 상태에서 배선 만지지 않기.
// 릴레이 코일측은 보통 별도 5V가 필요하고, 옵토릴레이 보드의 극성(active-high/low)은
// config.h의 RELAY_ACTIVE_LEVEL로 반드시 실측 확인 후 설정할 것.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>

#include "config.h"

static const int RELAY_PIN = D1;
static const unsigned long READING_PUSH_INTERVAL_MS = 30000;
static const unsigned long COMMAND_POLL_INTERVAL_MS = 2500;

// PZEM은 반드시 별도 HardwareSerial 사용 (Serial은 USB 디버그 전용).
HardwareSerial pzemSerial(1);
PZEM004Tv30 pzem(pzemSerial, /*RX*/ D7, /*TX*/ D6);

unsigned long lastReadingPushMs = 0;
unsigned long lastCommandPollMs = 0;

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
  doc["label"] = ROOM " 기기";
  // setup()에서 이미 릴레이를 강제로 꺼둔 뒤 이 함수가 불리므로, 부팅/재부팅 시 실제 물리
  // 상태(off)를 함께 알려서 DB가 정전 전 상태(예: "on")로 낡아있지 않게 동기화한다.
  doc["state"] = "off";

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

  if (millis() - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    pollPendingCommands();
    lastCommandPollMs = millis();
  }

  if (millis() - lastReadingPushMs >= READING_PUSH_INTERVAL_MS) {
    pushReadings();
    lastReadingPushMs = millis();
  }

  delay(100);
}
