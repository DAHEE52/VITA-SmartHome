// 카메라 재실 감지 노드: XIAO ESP32S3 Sense 카메라 + Edge Impulse 비전 모델(occupied/empty).
// PIR(움직임) 기반 env_presence_node와 달리 "프레임 단위 이미지 분류"라서 이불 덮고 자거나
// 가만히 앉아 TV를 보는 등 움직임이 없는 재실 상황도 감지한다.
//
// 필요 라이브러리:
//   - <sketchbook>/libraries/vita-presence_inferencing (Edge Impulse에서 빌드해 설치한 라이브러리)
//
// 빌드 시 반드시 --board-options PSRAM=opi 필요 (카메라 + 모델 둘 다 PSRAM 사용).
// 라이브러리를 새로 교체했다면 첫 컴파일은 --clean으로 할 것(캐시된 stale object 문제 방지).
//
// 촬영 오리엔테이션 참고: 학습에 쓴 사진들(firmware/presence_dataset_collector)도 별도 회전
// 보정 없이 카메라가 내보내는 원본 그대로 JPEG 인코딩해서 업로드했다. 이 스케치도 동일하게
// 원본 방향 그대로 캡처하므로, 학습 데이터와 추론 입력의 방향이 서로 일치한다(추가 회전 보정 불필요).

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_heap_caps.h"

#include <vita-presence_inferencing.h>
#include "edge-impulse-sdk/dsp/image/image.hpp"

#include "config.h"

// XIAO ESP32S3 Sense 카메라 핀 (presence_dataset_collector와 동일)
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

// 학습 데이터도 240x240 정사각형(squash)이었으므로 캡처도 동일 해상도로 맞춘다.
#define EI_CAMERA_RAW_FRAME_BUFFER_COLS 240
#define EI_CAMERA_RAW_FRAME_BUFFER_ROWS 240
#define EI_CAMERA_FRAME_BYTE_SIZE       3

static const unsigned long CLASSIFY_INTERVAL_MS = 8000;
unsigned long lastClassifyMs = 0;
bool cameraReady = false;
uint8_t *snapshot_buf = nullptr;

// SDK의 malloc/calloc/free는 weak symbol이라 여기서 재정의하면 모델 텐서 arena를
// 내부 RAM 대신 PSRAM에 둘 수 있다(큰 비전 모델은 내부 RAM만으로 부족).
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
  doc["type"] = "presence_cam";
  doc["room"] = ROOM;
  doc["label"] = ROOM " 재실 감지(카메라)";

  int status = postJson("/devices/register", doc);
  Serial.print("등록 응답 코드: ");
  Serial.println(status);
}

void pushPresence(float value) {
  JsonDocument doc;
  JsonArray readings = doc["readings"].to<JsonArray>();
  JsonObject presence = readings.add<JsonObject>();
  presence["metric"] = "presence";
  presence["value"] = value;

  int status = postJson(String("/devices/") + DEVICE_ID + "/readings", doc);
  Serial.print("readings 응답 코드: ");
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

  // AWB/AE 워밍업 - 초기 몇 프레임은 화이트밸런스가 안정되기 전이라 버린다.
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

// 분류 결과에서 가장 높은 확률의 라벨을 찾아 "occupied"면 1.0, 아니면 0.0을 반환한다.
float classifyPresence() {
  snapshot_buf = (uint8_t *)malloc(EI_CAMERA_RAW_FRAME_BUFFER_COLS * EI_CAMERA_RAW_FRAME_BUFFER_ROWS * EI_CAMERA_FRAME_BYTE_SIZE);
  if (!snapshot_buf) {
    Serial.println("snapshot 버퍼 할당 실패");
    return -1;
  }

  if (!ei_camera_capture((size_t)EI_CLASSIFIER_INPUT_WIDTH, (size_t)EI_CLASSIFIER_INPUT_HEIGHT, snapshot_buf)) {
    free(snapshot_buf);
    return -1;
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
    return -1;
  }

  int bestIdx = 0;
  for (uint16_t i = 1; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
    if (result.classification[i].value > result.classification[bestIdx].value) bestIdx = i;
  }

  const char *label = ei_classifier_inferencing_categories[bestIdx];
  Serial.print("판정: ");
  Serial.print(label);
  Serial.print(" (");
  Serial.print(result.classification[bestIdx].value);
  Serial.println(")");

  return (strcmp(label, "occupied") == 0) ? 1.0f : 0.0f;
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  cameraReady = ei_camera_init();
  if (!cameraReady) {
    Serial.println("카메라 없이는 동작할 수 없음 - 재부팅 대기");
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

  if (cameraReady && millis() - lastClassifyMs >= CLASSIFY_INTERVAL_MS) {
    lastClassifyMs = millis();
    float presence = classifyPresence();
    if (presence >= 0) {
      pushPresence(presence);
    }
  }

  delay(200);
}
