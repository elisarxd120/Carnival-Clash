# Carnival Clash

## Step-by-Step Project Build Guide

Carnival Clash is a physical Rock–Paper–Scissors booth. Four buttons connected to an ESP32 let a player choose Rock, Paper, Scissors, or a one-use Hack Chip. A laptop runs the game, Madam Glitch, and the live leaderboard.

### Current project status

The laptop game is implemented: browser interface, five-round game flow, adaptive AI, Glitch Mode, Double Stakes, Hack Chip, WebSocket server, SQLite match/history storage, and a Top 10 leaderboard. A separate password-protected `/admin` dashboard provides live operations, game history, round analytics, leaderboard moderation, system logs, CSV export, and database backups.

The ESP32 firmware and physical wiring are the next build stage. The admin dashboard reports the device as offline until an ESP32 WebSocket client identifies itself. Recent-player feeds, QR ranking, and USB serial backup are not implemented yet.

## 1. Understand the Game

The player faces Madam Glitch in a five-round match:

1. The attract screen invites a player to start.
2. The player enters a nickname and reads the short story introduction.
3. Rounds 1–2 use normal Rock–Paper–Scissors while the AI learns.
4. Round 3 introduces Glitch Mode, which reverses wins and losses.
5. Round 4 is Double Stakes, doubling the points awarded that round.
6. Round 5 is the final round; it has no extra bonus.
7. The result is saved and shown on the leaderboard.

Each round has a 10-second move timer. If the player does not choose in time, the game selects a random move. A match always has five rounds, and the Hack Chip can be used once.

Scoring: a win is worth 100 points, a tie is worth 50, and a loss is worth 0. Round 4 is Double Stakes, so that round's points are doubled (including a Hack Chip win). There is no Round 5 bonus.

## 2. Prepare the Hardware and Software

### Hardware

- ESP32 development kit (plus a spare if available)
- Four push buttons: Rock, Paper, Scissors, and Hack
- LEDs and 220 Ω resistors
- Passive buzzer
- Breadboard and jumper wires
- USB cable and optional power bank
- Laptop and Wi-Fi router or phone hotspot
- Enclosure for the finished booth

### Software

- VS Code
- Node.js and npm
- Arduino IDE or PlatformIO
- ESP32 board support for the chosen firmware environment
- Arduino `WiFi`, `WebSocketsClient`, and `ArduinoJson` libraries for a Wi-Fi build
- Express, a WebSocket server library, and SQLite for the laptop application
- Git for source control

## 3. Choose and Record the Connection

Use **Wi-Fi with WebSockets** for the planned wireless booth. Keep USB serial as a later reliability fallback if it is needed.

Both connection methods should carry the same logical events. Agree on the message names and fields before implementing the firmware and server so they can be tested independently. For example:

```json
{"type":"move","move":"rock"}
{"type":"hack"}
{"type":"feedback","result":"win","led":"green","sound":"win"}
```

The server should validate incoming messages and the ESP32 should reconnect if Wi-Fi or the WebSocket connection drops. Do not treat an unrecognized message as a valid move.

## 4. Wire and Test the ESP32

1. Connect each button to a separate ESP32 GPIO and ground.
2. Configure button pins with `INPUT_PULLUP`; pressed buttons will read LOW.
3. Choose GPIO pins that are suitable for normal input/output and avoid pins that affect ESP32 startup. Record the selected pins in the firmware.
4. Connect each LED through its 220 Ω resistor to a suitable GPIO and ground.
5. Connect the passive buzzer to a suitable output. Check its current requirements and use a driver circuit if the buzzer exceeds the GPIO's limits.
6. Upload a small hardware test before adding networking. Confirm that each button is detected, each LED lights, and the buzzer plays a test tone.
7. Add 30–50 ms button debounce and verify that one press generates only one event.

Keep the pin assignments in one clearly named section of the firmware so the wiring and code can be checked together.

## 5. Build the Laptop Game Application

Create a Node.js application with these responsibilities:

- **Express:** serves the game screen and dashboard.
- **WebSocket server:** receives ESP32 input events and sends feedback.
- **Game controller:** owns the active match, round timer, rules, and score.
- **AI module:** chooses Madam Glitch's move.
- **SQLite storage:** saves completed matches, leaderboard scores, and any player history needed by the AI.
- **Browser UI:** shows the story, current round, moves, result, score, and leaderboard.

Keep game rules separate from the web-server and display code. This makes it possible to test a match without connecting the ESP32.

### Suggested implementation order

1. The Node.js project and dependencies are in place.
2. The Express/WebSocket server serves the browser game and receives game actions.
3. The server owns match state, round timers, scoring, and Hack Chip usage.
4. The five-round game, adaptive AI, and special-round rules are implemented and tested.
5. The browser interface shows live game state and the leaderboard.
6. SQLite stores completed matches and player move history.
7. Connect and test the ESP32 after the game works with simulated button events.

### Run the current laptop game

From the project folder, run `npm install` once, then `npm start`. Open `http://localhost:3000` in a browser to play. Press `Ctrl+C` in the terminal to stop the server. Match results and player move history are stored in `data/carnival-clash.sqlite`.

### Open the admin dashboard

Open `http://localhost:3000/admin`. The dashboard is separate from the public game and leaderboard. A local `.env` file is loaded at startup if present and is excluded from Git. Set `ADMIN_PASSWORD` there for local use; the server hashes it with scrypt at startup. For deployment, prefer a salted `ADMIN_PASSWORD_HASH` environment variable. There is no password default in tracked source.

For a deployment hash, generate one in PowerShell:

```powershell
$env:ADMIN_PASSWORD = "choose-a-strong-password"
$env:ADMIN_PASSWORD_HASH = node --input-type=module -e "import { randomBytes, scryptSync } from 'node:crypto'; const password = process.env.ADMIN_PASSWORD; const salt = randomBytes(16).toString('hex'); console.log(salt + ':' + scryptSync(password, salt, 64).toString('hex'))"
Remove-Item Env:ADMIN_PASSWORD
npm start
```

Set `ADMIN_PASSWORD_HASH` in the server's environment for future runs. The dashboard session uses an HttpOnly, SameSite cookie and expires after 30 minutes of inactivity. Keep the hash and password out of source control.

Completed matches and their round-by-round data are saved together. The schema is migrated automatically when the server starts. The public leaderboard remains on the start screen and is hidden during a match so players can focus on Madam Glitch and their move. Admins can hide, rename, flag, or delete individual scores, reset leaderboard and player history, review history and analytics, export all games to CSV, and create a timestamped SQLite backup under `data/`. The settings panel persists the predictive/random AI ratio, move timer, round count, Glitch Mode, event enablement and frequency, Hack Chip, and maintenance pause. Match-rule changes apply to the next game; move-timer changes take effect at the next round.

An ESP32 WebSocket client should send `{"type":"device-connect"}` after connecting. It can then send the same `move` and `hack` messages as the game client. Admin test effects are broadcast as `feedback` messages with `result`, `led`, and `sound` fields.

## 6. Implement the Core Game Rules

Implement and test the standard outcomes first:

- Rock beats Scissors.
- Scissors beats Paper.
- Paper beats Rock.
- Identical moves tie.

For each round:

1. Start the 10-second timer and accept one player move.
2. If the timer expires without a move, select a random player move and clearly indicate that the timeout occurred.
3. Select Madam Glitch's move.
4. Apply the round's mode or event, resolve the result, and update wins, losses, ties, and score.
5. Show the result and send LED/buzzer feedback to the ESP32.
6. Start the next round, or save and display the result after Round 5.

Use a single server-side match state as the source of truth. The browser should display state received from the server rather than independently resolving outcomes.

## 7. Add Madam Glitch's AI and Special Mechanics

### Adaptive AI

1. Keep a rolling history of up to the last 10 player moves.
2. Count move frequencies and identify simple patterns, such as repeating a move after losing.
3. Choose a move that counters the predicted player move about 70% of the time.
4. Choose randomly about 30% of the time so play remains uncertain.
5. Store only the player history needed for the planned behavior in SQLite.

### Special rounds

- **Glitch Mode (Round 3):** reverse normal wins and losses for this round; ties remain ties. Announce the twist before the player chooses.
- **Double Stakes (Round 4):** double the points awarded that round and announce the event before play.
- **Final Round (Round 5):** finish the match with no additional bonus.
- **Hack Chip:** pressing it automatically wins the current round. It can be used once per match, the match then continues, and later attempts are rejected.

Keep these mechanics explicit and testable. Random AI choices should not make a round's result impossible to explain on screen.

## 8. Build the Screen and Leaderboard

Create a browser interface with:

- Attract screen and Madam Glitch dialogue
- Nickname entry and story introduction
- Five-round progress and a visible move timer
- Player and AI moves, round outcome, and match score
- Glitch Mode, random-event, and Hack Chip indicators
- Top 10 leaderboard
- Recent players feed and statistics cards
- Big-screen layout for the booth display

After Round 5, save a result record containing the nickname, score, wins, losses, ties, Hack Chip usage, and match duration. Update the leaderboard from the saved data. A QR-code ranking feature is optional and should be added only after the local leaderboard works.

## 9. Integrate and Test the ESP32

1. Run the laptop server and confirm the game page loads.
2. Connect the ESP32 to the same Wi-Fi network and confirm that the WebSocket connects.
3. Press each physical button and confirm the server receives the correct event exactly once.
4. Confirm the laptop sends feedback and the expected LED or buzzer responds.
5. Disconnect and restore Wi-Fi to test reconnection.
6. Play a complete five-round match and confirm that the saved result appears on the leaderboard.
7. Test a USB serial fallback only if it is included in the build; keep its event format consistent with the Wi-Fi path.

## 10. Test the Complete Booth

Before a demonstration, verify:

- All four buttons work and are debounced.
- No-move timeouts choose a move and resolve the round.
- Wins, losses, ties, and points are calculated correctly.
- The Hack Chip works once and cannot be reused.
- Glitch Mode and Double Stakes are visible and applied as documented; Round 5 has no additional bonus.
- AI choices use player history without becoming fully predictable.
- WebSocket loss does not corrupt or silently complete a match.
- Completed matches persist after the server restarts.
- The leaderboard ranks saved scores correctly.
- The interface is readable from the intended viewing distance.

Test the game rules with automated or simulated inputs before relying on physical hardware. Test the physical controls separately, then run end-to-end matches.

## 11. Finish and Demonstrate

1. Mount the working electronics in the enclosure and secure loose wiring.
2. Label the four controls and make the Hack Chip's one-use rule clear.
3. Re-test the booth with its final power source and network setup.
4. Prepare a short demonstration: enter a nickname, play all five rounds, show the special mechanics, and point out the leaderboard result.
5. Keep a spare USB cable, ESP32, and a documented Wi-Fi setup available.

## Development Milestones

| Phase | Completion criteria |
|---|---|
| Planning | Game rules, connection choice, and hardware pin assignments are recorded |
| Hardware testing | Buttons, LEDs, and buzzer work independently |
| Core gameplay | Implemented and covered by automated tests |
| Adaptive AI | Implemented using up to 10 recent moves, including saved player history |
| Special mechanics | Glitch Mode, Double Stakes, and Hack Chip are implemented and tested |
| ESP32 integration | Next: physical controls and server feedback over WebSockets |
| Dashboard | Top 10 leaderboard and local match storage are implemented |
| Polish | Carnival presentation and big-screen layout are ready |
| Enclosure | Booth is portable and wiring is secure |
| Final testing | A full demonstration completes reliably |
