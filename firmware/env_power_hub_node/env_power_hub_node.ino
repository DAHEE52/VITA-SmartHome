// 환경/조명 허브 (보드 1 - 브레드보드_최종배치_v4.md): XIAO ESP32S3 +
// BME280(온습도) + BH1750(조도) + LED(조명 채널, 저항 직결).
// 온습도/조도는 living-env-01로 5초마다 push하고, LED 조명은 living-light-01(relay)로
// 등록해서 2.5초마다 대기 명령을 poll한다. 조명은 PWM(ledcWrite)으로 밝기(0~100%)까지 조절된다.
//
// 필요 라이브러리 (Arduino Library Manager에서 설치):
//   - Adafruit BME280 Library (+ Adafruit Unified Sensor, Adafruit BusIO)
//   - BH1750 (Christopher Laws)
//   - ArduinoJson (v7)
//
// 배선(브레드보드_최종배치_v4.md 기준):
//   - I2C(BME280/BH1750): Wire.begin() 기본 핀(D4=SDA, D5=SCL) 공유
//   - LED 조명: D1 -> 저항 -> LED -> GND
//     GPIO를 HIGH로 주면 켜지는 active-HIGH 구성(옵토릴레이와 반대이니 혼동 주의).
//     원래 D2를 썼으나 D2(GPIO3)가 스트래핑 핀이라 출력이 불안정해 D1로 변경함.
//
// 전력 측정(PZEM)은 Tapo 스마트플러그로 대체되어 이 보드에서는 더 이상 쓰지 않는다.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>

#include "config.h"

static const unsigned long PUSH_INTERVAL_MS = 5000;
static const unsigned long LIGHT_POLL_INTERVAL_MS = 2500;
static const int LIGHT_PIN = D1;  // D2(GPIO3)는 스트래핑 핀이라 출력이 불안정할 수 있어 D1로 변경

Adafruit_BME280 bme;
BH1750 lightMeter;

bool bmeReady = false;
bool bhReady = false;

unsigned long lastPushMs = 0;
unsigned long lastLightPollMs = 0;

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
  doc["label"] = labelSuffix;

  int status = postJson("/devices/register", doc);
  Serial.print(deviceId);
  Serial.print(" 등록 응답 코드: ");
  Serial.println(status);
}

// PZEM 등 결선이 안 됐거나 읽기 실패 시 NAN을 반환하는 값이 있을 때만 배열에 추가한다.
void addIfValid(JsonArray &readings, const char *metric, float value) {
  if (isnan(value)) {
    return;
  }
  JsonObject r = readings.add<JsonObject>();
  r["metric"] = metric;
  r["value"] = value;
}

void pushEnvReadings() {
  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();

  if (bmeReady) {
    addIfValid(readings, "temperature", bme.readTemperature());
    addIfValid(readings, "humidity", bme.readHumidity());
  }
  if (bhReady) {
    addIfValid(readings, "light", lightMeter.readLightLevel());
  }

  if (readings.size() == 0) {
    return;
  }

  int status = postJson(String("/devices/") + ENV_DEVICE_ID + "/readings", doc);
  Serial.print("env readings 응답 코드: ");
  Serial.println(status);
}

void ackCommand(long commandId, const String &status) {
  JsonDocument doc;
  doc["status"] = status;
  postJson(String("/devices/") + LIGHT_DEVICE_ID + "/commands/" + commandId + "/ack", doc);
}

// command는 "on"/"off" 또는 밝기 문자열("0"~"100")이다 - 숫자면 그대로 밝기(%)로 쓰고,
// on=100%/off=0%로 변환한다. PWM 듀티(0~255)로 환산해 ledcWrite한다.
void applyLightCommand(const String &command) {
  int brightnessPct;
  if (command == "on") {
    brightnessPct = 100;
  } else if (command == "off") {
    brightnessPct = 0;
  } else {
    brightnessPct = command.toInt();
  }
  brightnessPct = constrain(brightnessPct, 0, 100);

  int duty = map(brightnessPct, 0, 100, 0, 255);
  ledcWrite(LIGHT_PIN, duty);
  Serial.print("조명 밝기 적용: ");
  Serial.println(brightnessPct);
}

void pollLightCommands() {
  HTTPClient http;
  http.begin(String(API_BASE_URL) + "/devices/" + LIGHT_DEVICE_ID + "/commands/pending");
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
    applyLightCommand(command);
    ackCommand(id, "done");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  ledcAttach(LIGHT_PIN, 5000, 8);  // 5kHz, 8bit(0~255) - 밝기 조절(PWM)용
  ledcWrite(LIGHT_PIN, 0);  // 시작은 꺼진 상태로

  Wire.begin();

  bmeReady = bme.begin(0x76, &Wire);
  if (!bmeReady) {
    bmeReady = bme.begin(0x77, &Wire);
  }
  if (!bmeReady) {
    Serial.println("BME280을 찾지 못함 (0x76/0x77 모두 실패)");
  }

  bhReady = lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire);
  if (!bhReady) {
    Serial.println("BH1750을 찾지 못함 (0x23)");
  }

  connectWiFi();
  registerDevice(ENV_DEVICE_ID, "env_sensor", "온습도/조도 센서");
  registerDevice(LIGHT_DEVICE_ID, "relay", "조명");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (millis() - lastPushMs >= PUSH_INTERVAL_MS) {
    pushEnvReadings();
    lastPushMs = millis();
  }

  if (millis() - lastLightPollMs >= LIGHT_POLL_INTERVAL_MS) {
    pollLightCommands();
    lastLightPollMs = millis();
  }

  delay(100);
}
