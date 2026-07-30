// 환경/전력 센서 허브 (보드 1 - 브레드보드_최종배치_v4.md): XIAO ESP32S3 +
// BME280(온습도) + BH1750(조도) + SSD1306 OLED(로컬 표시) + PZEM-004T v3(전력).
// 온습도/조도는 living-env-01, 전력은 living-power-01 두 device_id로 각각 등록해서
// 5초마다 FastAPI로 push한다(앱 폴링 주기와 맞춤). OLED는 서버로 보내지 않고 보드에서
// 로컬로만 보여준다.
//
// 필요 라이브러리 (Arduino Library Manager에서 설치):
//   - Adafruit BME280 Library (+ Adafruit Unified Sensor, Adafruit BusIO)
//   - BH1750 (Christopher Laws)
//   - Adafruit SSD1306 (+ Adafruit GFX Library)
//   - PZEM004Tv30 (Jakub Mandula / mandulaj)
//   - ArduinoJson (v7)
//
// 배선(브레드보드_최종배치_v4.md 기준):
//   - I2C(BME280/OLED/BH1750): Wire.begin() 기본 핀(D4=SDA, D5=SCL) 공유
//   - PZEM: HardwareSerial(1), MCU RX=D2(PZEM TX 수신), MCU TX=D3(PZEM RX로 송신)
//
// !!! 안전 경고 !!! PZEM-004T는 AC 전원선에 직결된다. 절연 인클로저 안에서 작업할 것.

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <BH1750.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <PZEM004Tv30.h>

#include "config.h"

static const unsigned long PUSH_INTERVAL_MS = 5000;
static const unsigned long OLED_REFRESH_MS = 2000;

Adafruit_BME280 bme;
BH1750 lightMeter;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
HardwareSerial pzemSerial(1);
PZEM004Tv30 pzem(pzemSerial, /*RX*/ D2, /*TX*/ D3);

bool bmeReady = false;
bool bhReady = false;
bool oledReady = false;

unsigned long lastPushMs = 0;
unsigned long lastOledMs = 0;

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

// PZEM은 결선이 안 됐거나 읽기 실패 시 NAN을 반환하므로, 값이 있을 때만 배열에 추가한다.
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

void pushPowerReadings() {
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

  int status = postJson(String("/devices/") + POWER_DEVICE_ID + "/readings", doc);
  Serial.print("power readings 응답 코드: ");
  Serial.println(status);
}

void refreshOled(float tempC, float humidity, float lux) {
  if (!oledReady) {
    return;
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(ROOM " 환경센서");
  display.println();
  if (bmeReady) {
    display.print("Temp: ");
    display.print(tempC, 1);
    display.println(" C");
    display.print("Humi: ");
    display.print(humidity, 1);
    display.println(" %");
  } else {
    display.println("BME280 없음");
  }
  if (bhReady) {
    display.print("Light: ");
    display.print(lux, 0);
    display.println(" lx");
  }
  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

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

  oledReady = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  if (!oledReady) {
    Serial.println("OLED(SSD1306)를 찾지 못함 (0x3C)");
  } else {
    display.clearDisplay();
    display.display();
  }

  connectWiFi();
  registerDevice(ENV_DEVICE_ID, "env_sensor", "온습도/조도 센서");
  registerDevice(POWER_DEVICE_ID, "power_monitor", "전력 측정");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  float tempC = bmeReady ? bme.readTemperature() : NAN;
  float humidity = bmeReady ? bme.readHumidity() : NAN;
  float lux = bhReady ? lightMeter.readLightLevel() : NAN;

  if (millis() - lastOledMs >= OLED_REFRESH_MS) {
    refreshOled(tempC, humidity, lux);
    lastOledMs = millis();
  }

  if (millis() - lastPushMs >= PUSH_INTERVAL_MS) {
    pushEnvReadings();
    pushPowerReadings();
    lastPushMs = millis();
  }

  delay(200);
}
