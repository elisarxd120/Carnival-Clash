arduino code

/\*
============================================================
CARNIVAL CLASH - ESP32 CONTROLLER FIRMWARE
============================================================

WHAT THIS CODE DOES (in one sentence):
The ESP32 is the PHYSICAL CONTROLLER of the game. It reads the
4 buttons, tells the laptop which button was pressed, and shows
LED lights + plays buzzer sounds when the laptop tells it to.

WHERE IS THE GAME LOGIC?
On the LAPTOP (Node.js server). The laptop decides the AI move,
Glitch Mode, random events, Hack rules and the score.
The ESP32 does NOT decide anything. It only sends and receives.

HOW THE ESP32 AND LAPTOP TALK (WebSocket, text in JSON format)

    ESP32 --> Laptop   {"type":"button","button":"ROCK"}
                       button = ROCK | PAPER | SCISSORS | HACK

    Laptop --> ESP32   {"type":"feedback","effect":"win"}
                       effect = start | click | win | lose | tie |
                                glitch | hack | chaos | champion | defeat

LIBRARIES TO INSTALL (Arduino IDE > Tools > Manage Libraries): 1. "WebSockets" by Markus Sattler 2. "ArduinoJson" by Benoit Blanchon (version 7.x)

BOARD SETTINGS:
Tools > Board > esp32 > "ESP32 Dev Module"
Serial Monitor speed: 115200

WIRING (buttons connect between the GPIO pin and GND):
Rock button -> GPIO 25
Paper button -> GPIO 26
Scissors button -> GPIO 27
Hack button -> GPIO 14
Green LED (+resistor 220 ohm) -> GPIO 16
Red LED (+resistor 220 ohm) -> GPIO 17
Yellow LED (+resistor 220 ohm) -> GPIO 18
Blue LED (+resistor 220 ohm) -> GPIO 19
Buzzer (+) -> GPIO 23 (buzzer - goes to GND)
Every LED's other leg goes to GND.

TEST WITHOUT THE LAPTOP:
Open the Serial Monitor, set "Newline" line ending, and type an
effect name such as: win lose tie glitch hack chaos
The LEDs and buzzer will react just like the laptop commanded it.
============================================================
\*/

#include <WiFi.h>
#include <WebSocketsClient.h> // WebSocket client (talks to the laptop)
#include <ArduinoJson.h> // reads/writes JSON messages

// ------------------------------------------------------------
// 1. SETTINGS - CHANGE THESE 4 LINES BEFORE UPLOADING
// ------------------------------------------------------------
const char* WIFI_SSID = "w8fi"; // Wi-Fi or phone hotspot name
const char* WIFI_PASS = "hindikoalam"; // Wi-Fi password
const char* SERVER_IP = "192.168.1.100"; // the LAPTOP's IP address (see tip below)
const uint16_t SERVER_PORT = 8080; // port used by the Node.js server
const char* SERVER_PATH = "/"; // WebSocket path on the server

// TIP: To find the laptop's IP on Windows, open Command Prompt and type: ipconfig
// Look for "IPv4 Address". The laptop and ESP32 must be on the SAME Wi-Fi.

// ------------------------------------------------------------
// 2. PIN MAP
// ------------------------------------------------------------
const uint8_t PIN_ROCK = 25;
const uint8_t PIN_PAPER = 26;
const uint8_t PIN_SCISSORS = 27;
const uint8_t PIN_HACK = 14;

const uint8_t PIN_LED_GREEN = 16; // win
const uint8_t PIN_LED_RED = 17; // lose
const uint8_t PIN_LED_YELLOW = 18; // tie / glitch / Wi-Fi status
const uint8_t PIN_LED_BLUE = 19; // hack

const uint8_t PIN_BUZZER = 23;

// Put the 4 LED pins in a list so we can control them easily.
const uint8_t LED_PINS[4] = { PIN_LED_GREEN, PIN_LED_RED, PIN_LED_YELLOW, PIN_LED_BLUE };

// Names for each LED position in the list above.
// LED_ALL means "all 4 LEDs together", LED_NONE means "no LED".
enum LedId : int8_t { LED_NONE = -1, LED_GREEN = 0, LED_RED = 1, LED_YELLOW = 2, LED_BLUE = 3, LED_ALL = 4 };

// ------------------------------------------------------------
// 3. BUTTONS WITH DEBOUNCE
// ------------------------------------------------------------
// "Debounce" = ignoring the tiny electrical flickers a button makes
// when pressed, so one press is counted only ONE time.
const unsigned long DEBOUNCE_MS = 40;

struct Button {
const char\* name; // text sent to the laptop
uint8_t pin; // GPIO pin of the button
bool lastReading; // what we read last loop
bool stableState; // the confirmed (debounced) state
unsigned long lastChange; // when the reading last changed
};

// Buttons use INPUT_PULLUP, so: not pressed = HIGH, pressed = LOW.
Button buttons[4] = {
{ "ROCK", PIN_ROCK, HIGH, HIGH, 0 },
{ "PAPER", PIN_PAPER, HIGH, HIGH, 0 },
{ "SCISSORS", PIN_SCISSORS, HIGH, HIGH, 0 },
{ "HACK", PIN_HACK, HIGH, HIGH, 0 }
};

// ------------------------------------------------------------
// 4. SOUNDS (melodies played by the buzzer)
// ------------------------------------------------------------
// Each note = a frequency (Hz) and how long it plays (ms).
// Frequency 0 means a short silence (a rest).
// NOTE: This needs a PASSIVE buzzer. An ACTIVE buzzer only makes one beep tone.
struct Note { uint16_t freq; uint16_t ms; };

const Note M_CLICK[] = { {1800, 30} };
const Note M_START[] = { {523, 100}, {659, 100}, {784, 100}, {1047, 200} };
const Note M_WIN[] = { {659, 120}, {784, 120}, {1047, 250} };
const Note M_LOSE[] = { {392, 200}, {330, 200}, {262, 350} };
const Note M_TIE[] = { {440, 150}, {0, 50}, {440, 150} };
const Note M_GLITCH[] = { {900, 60}, {300, 60}, {1200, 60}, {200, 60}, {1000, 60}, {250, 60} };
const Note M_HACK[] = { {1200, 80}, {1500, 80}, {1800, 80}, {1500, 80} };
const Note M_CHAOS[] = { {500, 80}, {800, 80}, {500, 80}, {800, 80}, {500, 80}, {800, 80} };
const Note M_CHAMPION[] = { {523, 120}, {659, 120}, {784, 120}, {1047, 120}, {784, 120}, {1047, 300} };
const Note M_DEFEAT[] = { {392, 250}, {370, 250}, {349, 250}, {330, 500} };

// Counts how many notes are in a melody.
#define COUNT(a) (sizeof(a) / sizeof(a[0]))

// ------------------------------------------------------------
// 5. EFFECTS (LED + sound combined)
// ------------------------------------------------------------
// The laptop only sends the EFFECT NAME (for example "win").
// This table says which LED and which sound belong to that name.
struct Effect {
const char* name; // effect name received from the laptop
int8_t led; // which LED to light
bool blink; // true = blinking, false = steady
uint16_t ledMs; // how long the LED stays on (ms)
const Note* melody; // which sound to play
uint8_t melodyLen; // number of notes in the sound
};

const Effect EFFECTS[] = {
{ "click", LED_NONE, false, 0, M_CLICK, COUNT(M_CLICK) },
{ "start", LED_GREEN, true, 900, M_START, COUNT(M_START) },
{ "win", LED_GREEN, false, 800, M_WIN, COUNT(M_WIN) },
{ "lose", LED_RED, false, 800, M_LOSE, COUNT(M_LOSE) },
{ "tie", LED_YELLOW, false, 600, M_TIE, COUNT(M_TIE) },
{ "glitch", LED_YELLOW, true, 1200, M_GLITCH, COUNT(M_GLITCH) },
{ "hack", LED_BLUE, false, 800, M_HACK, COUNT(M_HACK) },
{ "chaos", LED_ALL, true, 1500, M_CHAOS, COUNT(M_CHAOS) },
{ "champion", LED_GREEN, true, 2000, M_CHAMPION, COUNT(M_CHAMPION) },
{ "defeat", LED_RED, true, 2000, M_DEFEAT, COUNT(M_DEFEAT) }
};

// ------------------------------------------------------------
// 6. GLOBAL VARIABLES (the program's "memory")
// ------------------------------------------------------------
WebSocketsClient webSocket; // the connection to the laptop
bool wsConnected = false; // true when the laptop is connected

// LED effect state
int8_t ledTarget = LED_NONE; // which LED is being shown
bool ledBlink = false; // blinking or steady
unsigned long ledUntil = 0; // time (ms) when the LED effect ends (0 = none)

// Sound state (plays one note at a time without blocking the program)
const Note\* curMelody = nullptr; // melody being played (nullptr = silent)
uint8_t curLen = 0; // number of notes in that melody
uint8_t curIdx = 0; // which note is playing now
unsigned long noteEnds = 0; // time (ms) when the current note ends

// ------------------------------------------------------------
// 7. BUZZER FUNCTIONS
// ------------------------------------------------------------
// ESP32 Arduino core v3.x and v2.x use different commands for PWM sound,
// so this code checks the version and uses the right one.
void buzzerSetup() {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
ledcAttach(PIN_BUZZER, 2000, 8); // pin, start frequency, resolution
#else
ledcSetup(0, 2000, 8); // channel 0
ledcAttachPin(PIN_BUZZER, 0);
#endif
}

// Play a tone at the given frequency. Frequency 0 = stop the sound.
void buzzerTone(uint16_t freq) {
#if ESP_ARDUINO_VERSION_MAJOR >= 3
ledcWriteTone(PIN_BUZZER, freq);
#else
ledcWriteTone(0, freq);
#endif
}

// Start playing the current note of the melody.
void playNote() {
buzzerTone(curMelody[curIdx].freq);
noteEnds = millis() + curMelody[curIdx].ms;
}

// Start a new melody from its first note.
void startMelody(const Note\* melody, uint8_t len) {
curMelody = melody;
curLen = len;
curIdx = 0;
playNote();
}

// Called again and again in loop(): moves to the next note when the
// current note finishes. It never waits (no delay), so buttons and
// Wi-Fi keep working while a sound is playing.
void updateSound() {
if (curMelody == nullptr) return; // nothing playing
if (millis() < noteEnds) return; // current note not finished yet

curIdx++; // go to the next note
if (curIdx >= curLen) { // melody finished
buzzerTone(0); // silence
curMelody = nullptr;
return;
}
playNote();
}

// ------------------------------------------------------------
// 8. LED FUNCTIONS
// ------------------------------------------------------------
void allLedsOff() {
for (uint8_t i = 0; i < 4; i++) digitalWrite(LED_PINS[i], LOW);
}

// Turn the target LED (or all LEDs) on or off.
void applyLedTarget(bool on) {
if (ledTarget == LED_ALL) {
for (uint8_t i = 0; i < 4; i++) digitalWrite(LED_PINS[i], on ? HIGH : LOW);
} else if (ledTarget >= 0 && ledTarget < 4) {
digitalWrite(LED_PINS[ledTarget], on ? HIGH : LOW);
}
}

// Called again and again in loop().
void updateLeds() {
unsigned long now = millis();

// A) An LED effect from the laptop is active.
if (ledUntil != 0 && now < ledUntil) {
bool on = ledBlink ? ((now / 120) % 2 == 0) : true; // blink every 120 ms
applyLedTarget(on);
return;
}

// B) The effect just ended -> turn everything off.
if (ledUntil != 0) {
ledUntil = 0;
allLedsOff();
}

// C) No effect is active. Use the yellow LED as a connection indicator:
// blinking slowly = NOT connected to the laptop, off = connected.
bool blinkNow = (!wsConnected) && ((now / 500) % 2 == 0);
digitalWrite(PIN_LED_YELLOW, blinkNow ? HIGH : LOW);
}

// ------------------------------------------------------------
// 9. PLAY AN EFFECT BY NAME
// ------------------------------------------------------------
// Looks up the effect name in the EFFECTS table, then starts the LED and sound.
void playEffect(const char\* name) {
for (const Effect& e : EFFECTS) {
if (strcmp(e.name, name) == 0) {
if (e.led != LED_NONE) {
allLedsOff();
ledTarget = e.led;
ledBlink = e.blink;
ledUntil = millis() + e.ledMs;
}
startMelody(e.melody, e.melodyLen);
return;
}
}
Serial.printf("Unknown effect: %s\n", name);
}

// ------------------------------------------------------------
// 10. SENDING BUTTON PRESSES TO THE LAPTOP
// ------------------------------------------------------------
void onButtonPressed(const char\* name) {
Serial.printf("[BUTTON] %s pressed\n", name);

playEffect("click"); // small click sound so the player feels the press

if (wsConnected) {
// Build the JSON message, for example: {"type":"button","button":"ROCK"}
String msg = String("{\"type\":\"button\",\"button\":\"") + name + "\"}";
webSocket.sendTXT(msg);
} else {
Serial.println("[WARN] Not connected to the laptop - button not sent.");
}
}

// Checks all 4 buttons (with debounce). Called in loop().
void checkButtons() {
unsigned long now = millis();

for (uint8_t i = 0; i < 4; i++) {
Button& b = buttons[i];
bool reading = digitalRead(b.pin);

    // The reading changed -> restart the debounce timer.
    if (reading != b.lastReading) {
      b.lastChange = now;
      b.lastReading = reading;
    }

    // The reading stayed the same long enough -> it is a real press/release.
    if ((now - b.lastChange) > DEBOUNCE_MS && reading != b.stableState) {
      b.stableState = reading;
      if (b.stableState == LOW) {      // LOW = button is pressed
        onButtonPressed(b.name);
      }
    }

}
}

// ------------------------------------------------------------
// 11. RECEIVING MESSAGES FROM THE LAPTOP
// ------------------------------------------------------------
// Runs automatically whenever something happens on the WebSocket.
void webSocketEvent(WStype_t type, uint8_t\* payload, size_t length) {
switch (type) {

    case WStype_CONNECTED: {
      wsConnected = true;
      Serial.println("[WS] Connected to the laptop server!");
      // Introduce ourselves so the server knows this is the controller.
      webSocket.sendTXT("{\"type\":\"hello\",\"device\":\"carnival-clash-esp32\"}");
      playEffect("start");
      break;
    }

    case WStype_DISCONNECTED: {
      wsConnected = false;
      Serial.println("[WS] Disconnected. Trying to reconnect...");
      break;
    }

    case WStype_TEXT: {
      // The laptop sent a message such as {"type":"feedback","effect":"win"}
      Serial.printf("[WS] Received: %s\n", (char*)payload);

      JsonDocument doc;                                      // ArduinoJson v7
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) {
        Serial.printf("[WS] JSON error: %s\n", err.c_str());
        return;
      }

      const char* msgType = doc["type"] | "";
      if (strcmp(msgType, "feedback") == 0) {
        const char* effect = doc["effect"] | "";
        playEffect(effect);
      }
      break;
    }

    default:
      break;

}
}

// ------------------------------------------------------------
// 12. SERIAL TEST MODE
// ------------------------------------------------------------
// Type an effect name (win, lose, glitch...) in the Serial Monitor to
// test the LEDs and buzzer WITHOUT the laptop server.
void readSerialTest() {
static String line;
while (Serial.available()) {
char c = Serial.read();
if (c == '\n' || c == '\r') {
line.trim();
if (line.length() > 0) {
Serial.printf("[TEST] Playing effect: %s\n", line.c_str());
playEffect(line.c_str());
}
line = "";
} else {
line += c;
}
}
}

// ------------------------------------------------------------
// 13. SETUP - runs ONCE when the ESP32 turns on
// ------------------------------------------------------------
void setup() {
Serial.begin(115200);
delay(300);
Serial.println("\n=== Carnival Clash ESP32 Controller ===");

// Buttons: INPUT_PULLUP uses the ESP32's built-in resistor,
// so no external resistor is needed for the buttons.
for (uint8_t i = 0; i < 4; i++) pinMode(buttons[i].pin, INPUT_PULLUP);

// LEDs are outputs.
for (uint8_t i = 0; i < 4; i++) pinMode(LED_PINS[i], OUTPUT);
allLedsOff();

buzzerSetup();
playEffect("start"); // startup sound + light = proof that the hardware works

// Connect to Wi-Fi (waits up to 10 seconds, blinking the yellow LED).
Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
WiFi.mode(WIFI_STA);
WiFi.setAutoReconnect(true); // reconnect automatically if Wi-Fi drops
WiFi.begin(WIFI_SSID, WIFI_PASS);

unsigned long startWait = millis();
while (WiFi.status() != WL_CONNECTED && millis() - startWait < 10000) {
digitalWrite(PIN_LED_YELLOW, (millis() / 250) % 2 == 0);
updateSound(); // keep the startup melody playing
delay(10);
}
allLedsOff();

if (WiFi.status() == WL_CONNECTED) {
Serial.print("Wi-Fi connected. ESP32 IP: ");
Serial.println(WiFi.localIP());
} else {
Serial.println("Wi-Fi NOT connected. Running in offline test mode.");
}

// Start the WebSocket connection to the laptop.
webSocket.begin(SERVER_IP, SERVER_PORT, SERVER_PATH);
webSocket.onEvent(webSocketEvent); // function to call on events
webSocket.setReconnectInterval(2000); // retry every 2 seconds if disconnected
webSocket.enableHeartbeat(15000, 3000, 2);// ping the server to detect lost connection
}

// ------------------------------------------------------------
// 14. LOOP - runs again and again, forever
// ------------------------------------------------------------
// Each part below is quick and never waits, so everything feels instant.
void loop() {
webSocket.loop(); // keeps the laptop connection alive and receives messages
checkButtons(); // look for button presses
updateLeds(); // update the lights
updateSound(); // update the buzzer
readSerialTest(); // listen for test commands from the Serial Monitor
}
