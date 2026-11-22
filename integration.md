# Connect the ESP32 Arduino sketch to the Carnival Clash server

This guide explains how to connect the controller in [Ardduinocode.md](./Ardduinocode.md) to the Node.js game server. The server is authoritative: the browser starts a match and supplies the player's name, while the ESP32 submits moves and plays feedback. Do not put AI, round rules, or scoring on the ESP32.

## Important differences to fix first

The current sketch does not yet speak the server's protocol:

- `Ardduinocode.md` is a Markdown document, not an Arduino sketch file. Copy its C++ code into a new `.ino` sketch. In the copied code, replace the escaped pointer/comment characters (`\*`, `/\*`, and `\*/`) with normal C++ characters (`*`, `/*`, and `*/`); as written, those backslashes make the code fail to compile.
- The server listens on port `3000` by default, not `8080`.
- The server expects `{"type":"move","move":"rock"}` or `{"type":"hack"}`, not `{"type":"button","button":"ROCK"}`.
- An ESP32 must identify itself with `{"type":"device-connect"}`. The server does not recognize the sketch's `hello` message.
- Server feedback contains `result`, `led`, and `sound` fields, not an `effect` field. Results are `win`, `loss`, and `tie`; the sketch's effect table calls the loss effect `lose`.

The sketch also contains Wi-Fi credentials in its settings. Replace them with your own network credentials before sharing or uploading the sketch. If the values currently in the file are real, change that Wi-Fi password.

## 1. Prepare the laptop and network

1. Install Node.js if it is not already installed.
2. Open a terminal in the Carnival Clash project folder and run:

   ```sh
   npm install
   npm start
   ```

   The server reports that it is available on port `3000` by default and binds to the laptop's network interfaces.
3. Connect the laptop and ESP32 to the same Wi-Fi network. Guest networks may block communication between devices.
4. On Windows, run `ipconfig` and find the IPv4 address for the laptop's active Wi-Fi adapter. Do not use `localhost` or `127.0.0.1` in the ESP32 sketch.
5. If Windows Firewall prompts you, allow Node.js on the trusted Private network. Do not expose the server to the public Internet.

The WebSocket address is `ws://<laptop-ip>:3000/`, for example `ws://192.168.1.50:3000/`. If you start the server with a custom `PORT`, use that same port in the sketch.

## 2. Install Arduino IDE libraries and check the wiring

In Arduino IDE, install:

- **WebSockets** by Markus Sattler
- **ArduinoJson** by Benoit Blanchon (the sketch uses version 7 APIs)

Select the ESP32 board that matches your hardware (the sketch documents **ESP32 Dev Module**) and its USB port. Keep the Serial Monitor at `115200` baud.

The sketch's pin assignments are:

| Component | GPIO |
| --- | ---: |
| Rock button | 25 |
| Paper button | 26 |
| Scissors button | 27 |
| Hack button | 14 |
| Green LED | 16 |
| Red LED | 17 |
| Yellow LED | 18 |
| Blue LED | 19 |
| Buzzer | 23 |

Each button connects between its GPIO and GND; `INPUT_PULLUP` makes a pressed button read `LOW`. Put a 220-ohm resistor in series with each LED and connect the LED cathodes to GND. Check the pinout of your specific ESP32 board before wiring. Do not connect a load that exceeds a GPIO's limits directly to a pin; use a suitable driver when needed.

## 3. Update the network settings in the sketch

In the settings section of the new `.ino` sketch, set:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_IP = "192.168.1.50"; // Replace with the laptop's Wi-Fi IPv4 address
const uint16_t SERVER_PORT = 3000;
const char* SERVER_PATH = "/";
```

Use your actual Wi-Fi name, password, and laptop address; do not commit real credentials into a shared copy of the project.

## 4. Adapt the sketch's WebSocket messages

### Register the controller when it connects

In `webSocketEvent()`, replace the current `hello` message in the `WStype_CONNECTED` case:

```cpp
webSocket.sendTXT("{\"type\":\"device-connect\"}");
```

The server replies with `{"type":"device-status","connected":true}` and sends the current game state. `device-connect` is what lets the server recognize the socket as the ESP32 controller.

### Send the server's action format

Replace the body of `onButtonPressed()` that builds the uppercase `button` message with:

```cpp
if (!wsConnected) {
  Serial.println("[WARN] Not connected to the laptop - button not sent.");
  return;
}

if (strcmp(name, "HACK") == 0) {
  webSocket.sendTXT("{\"type\":\"hack\"}");
} else {
  const char* move = nullptr;
  if (strcmp(name, "ROCK") == 0) move = "rock";
  else if (strcmp(name, "PAPER") == 0) move = "paper";
  else if (strcmp(name, "SCISSORS") == 0) move = "scissors";

  if (move == nullptr) {
    Serial.printf("[WARN] Unknown button: %s\n", name);
    return;
  }

  String msg = String("{\"type\":\"move\",\"move\":\"") + move + "\"}";
  webSocket.sendTXT(msg);
}
```

The server accepts moves only during `awaiting-move`; it validates every action and responds with an `error` message when an action is invalid or out of phase. A Hack Chip is once per match. The browser remains responsible for entering the player's name, starting the match, and continuing through the result screens. In the browser, start a match and wait until the move timer is active before pressing a controller button.

### Read server feedback

In the `WStype_TEXT` branch, the current sketch only looks for an `effect` field. Replace that feedback handling with:

```cpp
const char* msgType = doc["type"] | "";
if (strcmp(msgType, "feedback") == 0) {
  const char* result = doc["result"] | "";
  if (strcmp(result, "win") == 0) {
    playEffect("win");
  } else if (strcmp(result, "loss") == 0) {
    playEffect("lose");
  } else if (strcmp(result, "tie") == 0) {
    playEffect("tie");
  } else {
    Serial.printf("[WS] Unknown result: %s\n", result);
  }
} else if (strcmp(msgType, "error") == 0) {
  Serial.printf("[WS] Server error: %s\n", doc["message"] | "unknown error");
} else if (strcmp(msgType, "state") == 0) {
  JsonObject state = doc["state"].as<JsonObject>();
  Serial.printf("[WS] Phase: %s, round: %d, Hack used: %s\n",
    state["phase"] | "unknown",
    state["currentRound"] | 0,
    (state["hackUsed"] | false) ? "yes" : "no");
}
```

The existing effect table already includes `win`, `lose`, and `tie`, so this maps the server's `loss` result to the sketch's `lose` effect. The browser displays the detailed round result and score. Do not infer the result or calculate points from the LEDs.

For safer input handling, track the latest `state.phase` and only send move actions when it is `awaiting-move`; the server still remains the final validator. Keep the browser open to start the match and proceed after results.

## 5. Upload and connect

1. Save the corrected sketch, select the ESP32 board and port, then click **Upload**.
2. Open **Tools > Serial Monitor**, set `115200` baud, and check that Wi-Fi connects and the ESP32 prints its IP address.
3. Confirm the sketch prints its WebSocket connected message. If it does not, check the laptop IP, port, firewall, Wi-Fi credentials, and server terminal.
4. In a laptop browser, open `http://localhost:3000` and enter a player name to start a match.
5. Wait for the round to accept a move, press one of the four physical buttons, and check both the browser result and the ESP32's LED/buzzer response.

The browser and ESP32 use separate WebSocket connections to the same server. Start and continue the match in the browser; the physical buttons submit player actions.

## 6. Test progressively

1. **Buttons:** test each button locally and verify one press produces one Serial Monitor event. Adjust debounce timing if a press repeats.
2. **Outputs:** test LEDs and buzzer individually before connecting gameplay.
3. **Network:** verify Wi-Fi and WebSocket connection before trying a move.
4. **Gameplay:** test Rock, Paper, Scissors, and Hack Chip during active move phases. Confirm the browser remains the source of truth for results and score.
5. **Rules:** test Hack Chip once, then try it again and confirm the server rejects reuse. Test later rounds and the final result in the browser.
6. **Reconnect:** restart the server or briefly interrupt Wi-Fi. Confirm the ESP32 reconnects and does not send queued moves from while it was disconnected.
7. **Persistence:** complete a match and confirm its result appears in the leaderboard.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Wi-Fi does not connect | Verify SSID/password and that the network is in range. |
| Wi-Fi connects but WebSocket does not | Confirm the laptop's current Wi-Fi IPv4 address, port `3000` (or the configured `PORT`), server is running, both devices share a non-isolated network, and Windows Firewall allows Node.js on the Private network. |
| Server reports an unknown message type | Verify the sketch uses `device-connect`, `move`, and `hack`; remove the old `hello` and `button` messages. |
| Button action is rejected | Start the match in the browser, wait for the active move timer, and check whether Hack Chip was already used. |
| LEDs/buzzer do not match the round | Check wiring, common ground, resistor placement, and that `loss` is mapped to the sketch's `lose` effect. |
| Button press repeats | Check the button-to-GND wiring and debounce handling. |
| Reconnect fails after changing networks | Find the laptop's new IPv4 address and update `SERVER_IP` in the sketch. |
