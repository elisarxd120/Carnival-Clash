# Carnival Clash: Arduino IDE Integration Guide

This guide connects the four ESP32 controls to the existing Carnival Clash laptop game. The laptop remains the source of truth for match state, round timing, AI, scoring, and storage. The ESP32 sends button actions and displays the result; it must not calculate game outcomes itself.

## What the repository currently supports

The server in `src/server.js` serves the browser game and accepts WebSocket messages on the same host and port. The browser starts a match and supplies the player's nickname. During play, the ESP32 can submit Rock, Paper, Scissors, or the one-use Hack Chip. The server sends state updates and result feedback back to connected clients.

The ESP32 firmware, button wiring, LEDs, and buzzer are not in the repository yet. The sketch below is a starting point for the planned four-button setup, not an already-tested project firmware. The recent-player feed, statistics cards, QR ranking, and USB serial fallback are also not implemented.

## 1. Install the Arduino tools

1. Install Arduino IDE 2 and add Espressif's ESP32 board support using Boards Manager.
2. In Library Manager, install **WebSockets** by Markus Sattler and **ArduinoJson** by Benoit Blanchon. The sketch below uses ArduinoJson 7.
3. Select your ESP32 board and its USB serial port. Upload a basic Blink sketch first to confirm the board and cable work.
4. From the project folder, run `npm install` once and then `npm start`. The game listens on port `3000` and binds to the laptop's network interfaces.

## 2. Connect the controls

Example pins for a common ESP32 DevKit are listed below. Confirm each pin against your specific board's pinout before wiring; avoid boot-strapping pins and pins reserved by your board or attached peripherals.

| Part            | Example ESP32 GPIO | Connection                                                              |
| --------------- | -----------------: | ----------------------------------------------------------------------- |
| Rock button     |                 18 | Button between GPIO 18 and GND                                          |
| Paper button    |                 19 | Button between GPIO 19 and GND                                          |
| Scissors button |                 21 | Button between GPIO 21 and GND                                          |
| Hack button     |                 22 | Button between GPIO 22 and GND                                          |
| Green LED       |                 25 | GPIO -> 220 ohm resistor -> LED anode; LED cathode -> GND               |
| Red LED         |                 26 | GPIO -> 220 ohm resistor -> LED anode; LED cathode -> GND               |
| Yellow LED      |                 27 | GPIO -> 220 ohm resistor -> LED anode; LED cathode -> GND               |
| Passive buzzer  |                 23 | GPIO to buzzer input; use a transistor/driver if required by the buzzer |

The buttons use `INPUT_PULLUP`: wire each button between its GPIO and ground, with no external pull-up required. A pressed button reads `LOW`. Join the ESP32, LEDs, and any low-voltage driver grounds. Do not connect a motor, high-current buzzer, or external voltage directly to a GPIO.

## 3. Set the laptop address

The ESP32 must connect to the laptop's Wi-Fi IPv4 address, not `localhost` or `127.0.0.1` (those names refer to the ESP32 itself when used there).

1. Put the laptop and ESP32 on the same Wi-Fi network. Avoid guest Wi-Fi networks that isolate devices.
2. On Windows, run `ipconfig` and note the IPv4 address of the active Wi-Fi adapter, such as `192.168.1.50`.
3. Allow Node.js or inbound TCP port `3000` through Windows Defender Firewall for the trusted Private network if prompted. Do not expose the game port to the public Internet.
4. Enter the Wi-Fi name/password and laptop IPv4 address in the sketch below.
5. Keep `npm start` running. Open `http://<laptop-ip>:3000` in a browser on the laptop, enter the nickname, and start the match there. The ESP32's four buttons do not start a match or enter a nickname.

The WebSocket URL is `ws://<laptop-ip>:3000/`. It uses the same port as the browser page.

## 4. Message contract

Messages are JSON text frames. Keep the spelling and lowercase move values exact.

| Direction         | JSON                                                             | Meaning                                                                                                       |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Browser -> server | `{"type":"start","playerName":"JON"}`                            | Starts a named match. Currently sent by the browser UI.                                                       |
| ESP32 -> server   | `{"type":"move","move":"rock"}`                                  | Submits one of `rock`, `paper`, or `scissors`.                                                                |
| ESP32 -> server   | `{"type":"hack"}`                                                | Uses the one-use Hack Chip for an automatic round win.                                                        |
| Server -> clients | `{"type":"state","state":{"phase":"awaiting-move",...}}`         | Current phase, round, score, deadline, and whether Hack Chip was used.                                        |
| Server -> clients | `{"type":"feedback","result":"win","led":"green","sound":"win"}` | Round result cues. `result`/`sound` can be `win`, `loss`, or `tie`; `led` can be `green`, `red`, or `yellow`. |
| Server -> sender  | `{"type":"error","message":"..."}`                               | Invalid or out-of-phase action; show the message in Serial Monitor while testing.                             |

The server accepts moves only during phase `awaiting-move`. The sketch checks this phase to avoid stale button presses, and the server independently validates every action. Round 3 reverses decisive outcomes; Round 4 doubles awarded points. The ESP32 should simply show the result the server sends.

## 5. Starter firmware

Replace the three network placeholders before uploading. The example uses debounce, sends one event per press, reconnects the WebSocket, listens for server state, and uses the returned `led` and `sound` fields for feedback.

```cpp
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_HOST = "192.168.1.50"; // Laptop Wi-Fi IPv4 address
constexpr uint16_t SERVER_PORT = 3000;

constexpr uint8_t ROCK_BUTTON_PIN = 18;
constexpr uint8_t PAPER_BUTTON_PIN = 19;
constexpr uint8_t SCISSORS_BUTTON_PIN = 21;
constexpr uint8_t HACK_BUTTON_PIN = 22;
constexpr uint8_t GREEN_LED_PIN = 25;
constexpr uint8_t RED_LED_PIN = 26;
constexpr uint8_t YELLOW_LED_PIN = 27;
constexpr uint8_t BUZZER_PIN = 23;
constexpr uint32_t DEBOUNCE_MS = 35;

struct Button {
  uint8_t pin;
  const char* move;
  bool isHack;
  int stableState;
  int lastReading;
  uint32_t changedAt;
};

Button buttons[] = {
  {ROCK_BUTTON_PIN, "rock", false, HIGH, HIGH, 0},
  {PAPER_BUTTON_PIN, "paper", false, HIGH, HIGH, 0},
  {SCISSORS_BUTTON_PIN, "scissors", false, HIGH, HIGH, 0},
  {HACK_BUTTON_PIN, nullptr, true, HIGH, HIGH, 0},
};

WebSocketsClient webSocket;
bool socketConnected = false;
bool canSubmitMove = false;
bool hackUsed = false;
char currentPhase[24] = "disconnected";

void allLedsOff() {
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);
  digitalWrite(YELLOW_LED_PIN, LOW);
}

void showFeedback(const char* led, const char* sound) {
  allLedsOff();
  uint16_t frequency = 0;

  if (strcmp(led, "green") == 0) {
    digitalWrite(GREEN_LED_PIN, HIGH);
    frequency = 1200;
  } else if (strcmp(led, "red") == 0) {
    digitalWrite(RED_LED_PIN, HIGH);
    frequency = 350;
  } else if (strcmp(led, "yellow") == 0) {
    digitalWrite(YELLOW_LED_PIN, HIGH);
    frequency = 750;
  }

  if (frequency > 0 && strcmp(sound, "") != 0) {
    tone(BUZZER_PIN, frequency, 180);
  }
}

void sendAction(const char* type, const char* move = nullptr) {
  if (!socketConnected || !canSubmitMove) {
    Serial.println("Move ignored: booth is not accepting a move.");
    return;
  }
  if (strcmp(type, "hack") == 0 && hackUsed) {
    Serial.println("Hack Chip was already used this match.");
    return;
  }

  JsonDocument action;
  action["type"] = type;
  if (move != nullptr) {
    action["move"] = move;
  }

  String message;
  serializeJson(action, message);
  if (webSocket.sendTXT(message)) {
    canSubmitMove = false; // Wait for the next authoritative server state.
    Serial.print("Sent: ");
    Serial.println(message);
  }
}

void handleServerMessage(uint8_t* payload, size_t length) {
  JsonDocument message;
  DeserializationError error = deserializeJson(message, payload, length);
  if (error) {
    Serial.print("Invalid JSON from server: ");
    Serial.println(error.c_str());
    return;
  }

  const char* type = message["type"] | "";
  if (strcmp(type, "state") == 0) {
    JsonObject state = message["state"].as<JsonObject>();
    const char* phase = state["phase"] | "disconnected";
    strlcpy(currentPhase, phase, sizeof(currentPhase));
    hackUsed = state["hackUsed"] | false;
    canSubmitMove = socketConnected && strcmp(currentPhase, "awaiting-move") == 0;
    Serial.printf("Phase: %s, round: %d, Hack used: %s\n",
      currentPhase,
      state["currentRound"] | 0,
      hackUsed ? "yes" : "no");
  } else if (strcmp(type, "feedback") == 0) {
    const char* led = message["led"] | "";
    const char* sound = message["sound"] | "";
    showFeedback(led, sound);
    Serial.printf("Round result: %s\n", message["result"] | "unknown");
  } else if (strcmp(type, "error") == 0) {
    Serial.printf("Server rejected action: %s\n", message["message"] | "unknown error");
    canSubmitMove = socketConnected && strcmp(currentPhase, "awaiting-move") == 0;
  }
}

void webSocketEvent(WStype_t eventType, uint8_t* payload, size_t length) {
  switch (eventType) {
    case WStype_CONNECTED:
      socketConnected = true;
      Serial.println("Connected to Carnival Clash server.");
      break;
    case WStype_DISCONNECTED:
      socketConnected = false;
      canSubmitMove = false;
      strlcpy(currentPhase, "disconnected", sizeof(currentPhase));
      allLedsOff();
      Serial.println("WebSocket disconnected; reconnecting...");
      break;
    case WStype_TEXT:
      handleServerMessage(payload, length);
      break;
    default:
      break;
  }
}

void pollButton(Button& button) {
  const int reading = digitalRead(button.pin);
  if (reading != button.lastReading) {
    button.lastReading = reading;
    button.changedAt = millis();
  }

  if (millis() - button.changedAt >= DEBOUNCE_MS && reading != button.stableState) {
    button.stableState = reading;
    if (button.stableState == LOW) {
      if (button.isHack) {
        sendAction("hack");
      } else {
        sendAction("move", button.move);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  for (Button& button : buttons) {
    pinMode(button.pin, INPUT_PULLUP);
    button.stableState = digitalRead(button.pin);
    button.lastReading = button.stableState;
    button.changedAt = millis();
  }

  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(YELLOW_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  allLedsOff();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  webSocket.begin(SERVER_HOST, SERVER_PORT, "/");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();
  if (WiFi.status() == WL_CONNECTED) {
    for (Button& button : buttons) {
      pollButton(button);
    }
  } else {
    socketConnected = false;
    canSubmitMove = false;
  }
}
```

### Firmware notes

- Keep the browser open to start the match and enter the nickname. When the server announces `awaiting-move`, the ESP32 buttons become active. They are disabled locally again after one event, and the next server state re-enables them.
- `hackUsed` comes from server state. The server remains authoritative and rejects a second Hack Chip use even if the device has stale state.
- `feedback` is sent before the following state. It contains only the outcome cue, not the player or AI moves. The browser displays the move details.
- The sketch blocks during initial Wi-Fi connection. For a polished unattended booth, replace that startup wait with a non-blocking Wi-Fi connection state machine so the loop continues servicing buttons and WebSocket reconnects.
- Test the buzzer API and electrical driver with your specific ESP32 core and buzzer. A passive buzzer needs a tone; an active buzzer may only need switched output. Do not drive loads beyond GPIO current limits.

## 6. Build and test in stages

1. **Buttons only:** upload a small test that prints a different label for each GPIO press. Check one press produces one log line; adjust `DEBOUNCE_MS` if necessary.
2. **LEDs and buzzer:** test each output independently with the resistors/driver installed.
3. **Network:** start the Node server, upload the integration sketch, and open Serial Monitor at `115200`. Confirm Wi-Fi and WebSocket connection messages.
4. **Gameplay:** in the browser, enter a nickname and start a match. Press one button only after the browser shows the move timer. Confirm the page resolves that round and the correct LED/sound plays.
5. **Rules:** test a Round 3 result, a Round 4 score, Hack Chip once, and a second Hack attempt. Confirm round results and final score on the browser; never infer scoring from LEDs.
6. **Reconnect:** briefly restart Wi-Fi or the server. Confirm Serial Monitor reports a disconnect, then reconnects. A move pressed while disconnected is intentionally not queued.
7. **Persistence:** finish all five rounds and confirm the result appears in the browser leaderboard. Restart the laptop server and confirm saved results remain.

## 7. Troubleshooting

| Symptom                                          | Check                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| ESP32 never connects                             | Recheck SSID/password, laptop IPv4 address, same Wi-Fi network, server running, and Windows Firewall for private-network TCP 3000.             |
| Browser works on laptop but ESP32 cannot connect | Do not use `localhost` as `SERVER_HOST`; check guest-network/client isolation and use the laptop's Wi-Fi IPv4 address.                         |
| WebSocket connects but buttons do nothing        | Start a match in the browser, wait for the round timer, inspect Serial Monitor, and verify button wiring goes to GND with `INPUT_PULLUP`.      |
| Every press repeats                              | Check debounce wiring and ensure each button transitions to `LOW` only when pressed. The sketch sends only on the debounced press edge.        |
| Hack is rejected                                 | Check `hackUsed` and start a new match in the browser. Hack is once per match, not once per round.                                             |
| Feedback LED does not match the result           | Check LED polarity, GPIO mapping, common ground, resistor placement, and Serial Monitor's received `feedback` JSON fields.                     |
| Reconnect loops                                  | Verify the laptop address has not changed and the server remains listening on port 3000. DHCP reservations can keep the laptop address stable. |

## Requirement check against `carnival clash.md`

| Requirement                                                                                           | Status in this codebase                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Five-round match, 10-second move deadline, automatic random move on timeout                           | Implemented and covered by tests.                                                                                                                                |
| Standard RPS, Round 3 Glitch Mode, Round 4 Double Stakes, no Round 5 bonus                            | Implemented and tested.                                                                                                                                          |
| One-use Hack Chip                                                                                     | Implemented and tested.                                                                                                                                          |
| AI counters the most frequent of up to 10 recent moves about 70% of the time and otherwise randomizes | Implemented and tested. The separate brief detail about detecting patterns such as repeating after a loss is not present; current prediction is frequency-based. |
| Player move history and completed match storage in SQLite                                             | Implemented and tested.                                                                                                                                          |
| Browser game and Top 10 leaderboard                                                                   | Implemented; server test covers a complete match and leaderboard persistence.                                                                                    |
| WebSocket server input validation and browser reconnect                                               | Implemented for browser clients; server validates JSON, message type, move name, and game phase.                                                                 |
| ESP32 physical buttons, Wi-Fi/WebSocket firmware, LEDs/buzzer, physical reconnect testing             | Not implemented in repository yet. The guide provides a starting integration sketch and test sequence.                                                           |
| Recent-player feed and statistics cards                                                               | Not implemented, as the project brief already notes.                                                                                                             |
| QR ranking and USB serial backup                                                                      | Optional/later work; not implemented.                                                                                                                            |
| Automated tests                                                                                       | `npm test` currently passes all 26 tests.                                                                                                                        |
