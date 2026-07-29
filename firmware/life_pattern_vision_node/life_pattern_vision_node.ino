// 생활 패턴 분류 노드: XIAO ESP32S3 Sense 카메라 + Edge Impulse 비전 모델(4-class).
// presence_vision_node.ino(occupied/empty 2-class)와 구조는 완전히 동일하고, 분류 결과를
// /devices/{id}/classify로 push한다는 점만 다르다(presence_vision_node는 /devices/{id}/readings).
//
// ⚠️ 이 스케치는 아직 컴파일되지 않는다. 아래 라이브러리가 실제로 존재해야 한다:
//   - <sketchbook>/libraries/vita-life_pattern_inferencing
// 이 라이브러리는 Edge Impulse에서 4개 클래스(Bed_Activity/Desk_Activity/Moving/Out_of_Room)로
// 학습한 뒤 "Arduino library"로 내보내야 생긴다. 데이터 수집은 같은 폴더의
// firmware/life_pattern_dataset_collector(4개 라벨 버튼)를 먼저 올려서 사진을 모으고,
// xiao-edgeimpulse-train 스킬로 학습·다운로드한 뒤 이 스케치를 그 라이브러리와 함께 컴파일한다.
//
// 빌드 시 반드시 --board-options PSRAM=opi 필요 (카메라 + 모델 둘 다 PSRAM 사용).
// 학습 데이터도 240x240 정사각형(squash)으로 모을 것 - presence_vision_node와 동일한 촬영 규칙.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"

#include <vita-life_pattern_inferencing.h>
#include "edge-impulse-sdk/dsp/image/image.hpp"

#include "config.h"

// XIAO ESP32S3 Sense 카메라 핀 (presence_vision_node와 동일)
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39
#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

#define EI_CAMERA_RAW_FRAME_BUFFER_COLS 240
#define EI_CAMERA_RAW_FRAME_BUFFER_ROWS 240
#define EI_CAMERA_FRAME_BYTE_SIZE       3

static const unsigned long CLASSIFY_INTERVAL_MS = 8000;
unsigned long lastClassifyMs = 0;
bool cameraReady = false;
uint8_t *snapshot_buf = nullptr;

// 백엔드가 AWS Lambda Function URL(HTTPS 전용)로 배포되어 있어 TLS 클라이언트가 필요하다.
// 서버 인증서를 별도로 검증하지 않는다(setInsecure) - X-Device-Key 헤더로 기기를 인증하는
// 기존 신뢰 모델을 그대로 쓰고, 전송 구간 암호화만 추가하는 목적.
WiFiClientSecure secureClient;

// 모델 텐서 arena를 PSRAM에 두기 위한 malloc/calloc/free 재정의 (presence_vision_node와 동일).
void *ei_malloc(size_t size) {
  void *p = heap_caps_aligned_alloc(16, size, MALLOC_CAP_SPIRAM);
  if (!p) p = heap_caps_aligned_alloc(16, size, MALLOC_CAP_DEFAULT);
  return p;
}
void *ei_calloc(size_t n, size_t s) {
  void *p = ei_malloc(n * s);
  if (p) memset(p, 0, n * s);
  return p;
}
void ei_free(void *ptr) { heap_caps_free(ptr); }

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
  http.begin(secureClient, String(API_BASE_URL) + path);
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
  doc["type"] = "presence_cam";
  doc["room"] = ROOM;
  doc["label"] = ROOM " 생활 패턴 감지(카메라)";

  int status = postJson("/devices/register", doc);
  Serial.print("등록 응답 코드: ");
  Serial.println(status);
}

// backend/app/routers/devices.py의 POST /devices/{id}/classify로 분류 결과를 push한다.
void pushClassification(const char *label, float confidence) {
  JsonDocument doc;
  doc["model"] = "life_pattern";
  doc["label"] = label;
  doc["confidence"] = confidence;

  int status = postJson(String("/devices/") + DEVICE_ID + "/classify", doc);
  Serial.print("classify 응답 코드: ");
  Serial.println(status);
}

bool ei_camera_init() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;   config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = -1; config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.frame_size = FRAMESIZE_240X240;
  config.pixel_format = PIXFORMAT_JPEG;
  config.jpeg_quality = 12;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.fb_count = 2;

  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("카메라 초기화 실패");
    return false;
  }

  for (int i = 0; i < 8; i++) {
    camera_fb_t *w = esp_camera_fb_get();
    if (w) esp_camera_fb_return(w);
    delay(60);
  }
  return true;
}

bool ei_camera_capture(uint32_t img_width, uint32_t img_height, uint8_t *out_buf) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("카메라 캡처 실패");
    return false;
  }

  bool converted = fmt2rgb888(fb->buf, fb->len, PIXFORMAT_JPEG, out_buf);
  esp_camera_fb_return(fb);

  if (!converted) {
    Serial.println("RGB888 변환 실패");
    return false;
  }

  if (img_width != EI_CAMERA_RAW_FRAME_BUFFER_COLS || img_height != EI_CAMERA_RAW_FRAME_BUFFER_ROWS) {
    ei::image::processing::crop_and_interpolate_rgb888(
      out_buf, EI_CAMERA_RAW_FRAME_BUFFER_COLS, EI_CAMERA_RAW_FRAME_BUFFER_ROWS,
      out_buf, img_width, img_height);
  }

  return true;
}

static int ei_camera_get_data(size_t offset, size_t length, float *out_ptr) {
  size_t pixel_ix = offset * 3;
  size_t pixels_left = length;
  size_t out_ptr_ix = 0;

  while (pixels_left != 0) {
    // esp32-camera의 fmt2rgb888은 BGR 순서로 나온다(espressif/esp32-camera#379) - 여기서 보정.
    out_ptr[out_ptr_ix] = (float)((snapshot_buf[pixel_ix + 2] << 16) + (snapshot_buf[pixel_ix + 1] << 8) + snapshot_buf[pixel_ix]);
    out_ptr_ix++;
    pixel_ix += 3;
    pixels_left--;
  }
  return 0;
}

// 4개 클래스(Bed_Activity/Desk_Activity/Moving/Out_of_Room) 중 가장 확률 높은 라벨과 확신도를 돌려준다.
bool classifyLifePattern(char *labelOut, size_t labelOutLen, float *confidenceOut) {
  snapshot_buf = (uint8_t *)malloc(EI_CAMERA_RAW_FRAME_BUFFER_COLS * EI_CAMERA_RAW_FRAME_BUFFER_ROWS * EI_CAMERA_FRAME_BYTE_SIZE);
  if (!snapshot_buf) {
    Serial.println("snapshot 버퍼 할당 실패");
    return false;
  }

  if (!ei_camera_capture((size_t)EI_CLASSIFIER_INPUT_WIDTH, (size_t)EI_CLASSIFIER_INPUT_HEIGHT, snapshot_buf)) {
    free(snapshot_buf);
    return false;
  }

  ei::signal_t signal;
  signal.total_length = EI_CLASSIFIER_INPUT_WIDTH * EI_CLASSIFIER_INPUT_HEIGHT;
  signal.get_data = &ei_camera_get_data;

  ei_impulse_result_t result = { 0 };
  EI_IMPULSE_ERROR err = run_classifier(&signal, &result, false);
  free(snapshot_buf);
  snapshot_buf = nullptr;

  if (err != EI_IMPULSE_OK) {
    Serial.print("분류 실패: ");
    Serial.println((int)err);
    return false;
  }

  int bestIdx = 0;
  for (uint16_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > result.classification[bestIdx].value) bestIdx = i;
  }

  const char *label = ei_classifier_inferencing_categories[bestIdx];
  strncpy(labelOut, label, labelOutLen - 1);
  labelOut[labelOutLen - 1] = '\0';
  *confidenceOut = result.classification[bestIdx].value;

  Serial.print("판정: ");
  Serial.print(label);
  Serial.print(" (");
  Serial.print(*confidenceOut);
  Serial.println(")");

  return true;
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  cameraReady = ei_camera_init();
  if (!cameraReady) {
    Serial.println("카메라 없이는 동작할 수 없음 - 재부팅 대기");
  }

  secureClient.setInsecure();
  connectWiFi();
  registerDevice();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (cameraReady && millis() - lastClassifyMs >= CLASSIFY_INTERVAL_MS) {
    lastClassifyMs = millis();
    char label[32];
    float confidence = 0;
    if (classifyLifePattern(label, sizeof(label), &confidence)) {
      pushClassification(label, confidence);
    }
  }

  delay(200);
}
