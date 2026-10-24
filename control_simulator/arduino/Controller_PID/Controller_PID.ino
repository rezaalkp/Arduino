/*
 * آردوینو ۱ — کنترلر PID
 * ارسال فرمان کنترل u به آردوینو ۲ و دریافت فیدبک y
 *
 * پروتکل سریال (۹۶۰۰، متنی):
 *   از کنترلر:  "U:<value>\n"
 *   از پروسه:   "Y:<value>\n"
 *   تنظیمات:    "SP:<v>"  "KP:<v>"  "KI:<v>"  "KD:<v>"
 *
 * اتصال پیشنهادی (دو برد با UART متقابل):
 *   Controller TX -> Plant RX
 *   Controller RX <- Plant TX
 *   GND مشترک
 */

#if defined(ESP8266)
  #include <SoftwareSerial.h>
  SoftwareSerial Link(D5, D6); // RX, TX
  #define LINK Link
#else
  // روی Uno از Serial سخت‌افزاری برای مانیتور و SoftwareSerial برای لینک استفاده کنید
  #include <SoftwareSerial.h>
  SoftwareSerial Link(8, 9); // RX, TX
  #define LINK Link
#endif

float setpoint = 50.0f;
float kp = 1.2f, ki = 0.4f, kd = 0.08f;
float y = 0.0f;
float integral = 0.0f;
float prevError = 0.0f;
unsigned long lastMs = 0;
const unsigned long SAMPLE_MS = 20;
String rxBuf;

float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void applyCommand(const String& line) {
  if (line.startsWith("SP:")) setpoint = line.substring(3).toFloat();
  else if (line.startsWith("KP:")) kp = line.substring(3).toFloat();
  else if (line.startsWith("KI:")) ki = line.substring(3).toFloat();
  else if (line.startsWith("KD:")) kd = line.substring(3).toFloat();
  else if (line.startsWith("Y:")) y = line.substring(2).toFloat();
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

void setup() {
  Serial.begin(9600);
  LINK.begin(9600);
  Serial.println(F("CTRL ready — PID loop 20ms"));
}

void loop() {
  pollSerial(Serial);
  pollSerial(LINK);

  unsigned long now = millis();
  if (now - lastMs < SAMPLE_MS) return;
  float dt = (now - lastMs) / 1000.0f;
  lastMs = now;

  float error = setpoint - y;
  integral += error * dt;
  integral = clampf(integral, -80.0f, 80.0f);
  float derivative = (error - prevError) / dt;
  float u = kp * error + ki * integral + kd * derivative;
  u = clampf(u, 0.0f, 100.0f);
  prevError = error;

  LINK.print(F("U:"));
  LINK.println(u, 2);

  Serial.print(F("SP:"));
  Serial.print(setpoint, 1);
  Serial.print(F(" Y:"));
  Serial.print(y, 1);
  Serial.print(F(" E:"));
  Serial.print(error, 1);
  Serial.print(F(" U:"));
  Serial.print(u, 1);
  Serial.print(F(" KP:"));
  Serial.print(kp, 2);
  Serial.print(F(" KI:"));
  Serial.print(ki, 2);
  Serial.print(F(" KD:"));
  Serial.println(kd, 2);
}
