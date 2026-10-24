/*
 * آردوینو ۲ — شبیه‌ساز پروسه + فیدبک
 * مدل مرتبه اول: dy/dt = (-y + K*u + d) / tau
 *
 * پروتکل سریال:
 *   دریافت: "U:<value>\n"
 *   ارسال:  "Y:<value>\n"
 *   تنظیم:  "GAIN:<v>" "TAU:<v>" "DIST:<v>" "DELAY:<ms>"
 */

#if defined(ESP8266)
  #include <SoftwareSerial.h>
  SoftwareSerial Link(D5, D6); // RX, TX
  #define LINK Link
#else
  #include <SoftwareSerial.h>
  SoftwareSerial Link(8, 9);
  #define LINK Link
#endif

float u = 0.0f;
float y = 0.0f;
float gain = 1.0f;
float tau = 1.5f;
float disturb = 0.0f;
unsigned int delayMs = 200;
unsigned long lastMs = 0;
const unsigned long SAMPLE_MS = 20;

static const int DELAY_MAX = 100;
float delayBuf[DELAY_MAX];
int delayHead = 0;
int delayCount = 0;

String rxBuf;

float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void applyCommand(const String& line) {
  if (line.startsWith("U:")) u = line.substring(2).toFloat();
  else if (line.startsWith("GAIN:")) gain = line.substring(5).toFloat();
  else if (line.startsWith("TAU:")) tau = max(0.05f, line.substring(4).toFloat());
  else if (line.startsWith("DIST:")) disturb = line.substring(5).toFloat();
  else if (line.startsWith("DELAY:")) delayMs = (unsigned int)line.substring(6).toInt();
}

void pollSerial(Stream& s) {
  while (s.available()) {
    char c = (char)s.read();
    if (c == '\n' || c == '\r') {
      if (rxBuf.length()) {
        applyCommand(rxBuf);
        rxBuf = "";
      }
    } else {
      rxBuf += c;
      if (rxBuf.length() > 48) rxBuf = "";
    }
  }
}

float pushDelay(float value) {
  int samples = (int)(delayMs / SAMPLE_MS);
  if (samples < 0) samples = 0;
  if (samples >= DELAY_MAX) samples = DELAY_MAX - 1;

  delayBuf[delayHead] = value;
  delayHead = (delayHead + 1) % DELAY_MAX;
  if (delayCount < DELAY_MAX) delayCount++;

  if (delayCount <= samples) return 0.0f;
  int idx = delayHead - samples - 1;
  if (idx < 0) idx += DELAY_MAX;
  return delayBuf[idx];
}

void setup() {
  Serial.begin(9600);
  LINK.begin(9600);
  for (int i = 0; i < DELAY_MAX; i++) delayBuf[i] = 0;
  Serial.println(F("PLANT ready — FO + delay"));
}

void loop() {
  pollSerial(Serial);
  pollSerial(LINK);

  unsigned long now = millis();
  if (now - lastMs < SAMPLE_MS) return;
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;

  float uDelayed = pushDelay(u);
  float alpha = dt / (tau + dt);
  y = y + alpha * (gain * uDelayed + disturb - y);
  y = clampf(y, -20.0f, 140.0f);

  LINK.print(F("Y:"));
  LINK.println(y, 2);

  Serial.print(F("U:"));
  Serial.print(uDelayed, 1);
  Serial.print(F(" Y:"));
  Serial.print(y, 1);
  Serial.print(F(" D:"));
  Serial.print(disturb, 1);
  Serial.print(F(" K:"));
  Serial.print(gain, 2);
  Serial.print(F(" tau:"));
  Serial.println(tau, 2);
}
