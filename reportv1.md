# INTELLIGENT SYSTEMS PROGRESS REPORT

## Intelligent Features, Sensor Pipeline & Model Tracking

## 1. Project & Team Information

**Project / Carnival Attraction Title:** Carnival Clash — Predictive Rock, Paper, Scissors AIoT Booth

**Course & Section:** Intelligent Systems (IS) / BSIT / BSCS \_\_\_\_

**Course Instructor:** Ms. Mikaela Arciaga

**Report Number & Period:** Report #1 | November 11, 2026

**Overall Project Status:** ☑ On Track ☐ Slightly Delayed ☐ At Risk

**Estimated Overall Completion:** 65% _(Target for this period: 70%)_

### Team Roster & Role Assignments

| Assigned Role                                      | Student Full Name |
| -------------------------------------------------- | ----------------- |
| Project Manager                                    | [Full Name]       |
| IoT Hardware & Sensor Lead (ESP32/Arduino/Sensors) | [Full Name]       |
| AI / Machine Learning / Rule-Engine Developer      | [Full Name]       |
| UI & Documentation Lead                            | [Full Name]       |

---

## 2. Executive Summary & Carnival IoT Theme Overview

Carnival Clash is an interactive carnival booth based on Rock, Paper, Scissors. The completed laptop application uses a Node.js and Express server, WebSocket communication, SQLite persistent storage, and a responsive browser interface. Madam Glitch is the intelligent opponent: it evaluates the player's recent moves, predicts the likely next move, and selects a counter move 70% of the time while randomizing 30% of the time.

The five-round match includes a 10-second timer, timeout fallback, a one-use Hack Chip, Round 3 Glitch Mode, and Round 4 Double Stakes. Completed results are ranked in a Top 10 leaderboard. The browser interface is connected to the server as the source of truth, while planned ESP32 controls and hardware feedback will use the documented Wi-Fi/WebSocket message contract.

During this reporting period, the team completed the game rules, adaptive AI, match flow, SQLite persistence, leaderboard, result presentation, responsive UI, and automated server/game tests. The main remaining work is physical ESP32 integration, button and feedback hardware testing, enclosure installation, and a complete live demonstration.

---

## 3. Intelligent System (IS) Features Integration

### Minimum Three Integrated Features

| IS Feature Name                             | IoT Sensor Input(s)                                                                                | AI / IS Technique Used                                                                                                   | Intelligent Action / Output                                                                                         | Completion % |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -----------: |
| Adaptive Madam Glitch Opponent              | Browser move selection; ESP32 Rock, Paper, and Scissors buttons planned; saved player move history | Frequency analysis over the last 10 moves, most-frequent pattern prediction, 70% counter selection, 30% random selection | Predicts the player's move and counters it, while keeping outcomes uncertain                                        |          90% |
| Special-Round Rule Engine                   | Current round number and player move                                                               | Rule-based expert system                                                                                                 | Applies reversed outcomes in Round 3 Glitch Mode, doubles points in Round 4, and keeps Round 5 as normal play       |          95% |
| Match Scoring, Timeout & Persistence System | Move timer, player or Hack Chip action, match history                                              | Deterministic rule engine plus timeout fallback                                                                          | Assigns 100 points for a win, 50 for a tie, 0 for a loss, handles timeout randomization, and saves match statistics |          95% |
| Top 10 Leaderboard                          | Completed match name, points, wins, ties, losses, Hack usage, and duration                         | Ranked database query                                                                                                    | Sorts records by points, wins, ties, and earlier completion; updates the browser before and after play              |          85% |

### Optional Additional Feature

| IS Feature Name                   | IoT Sensor Input                           | AI / IS Algorithm                                    | Automated Decision / Output                                                                         | Completion % |
| --------------------------------- | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -----------: |
| ESP32 Physical Control & Feedback | Four push buttons; planned LEDs and buzzer | Debounced event handling and server feedback mapping | Sends moves through WebSocket, lights green/red/yellow for wins/losses/ties, and plays result tones |          35% |

---

## 4. System Architecture & Component Completion

| System Layer / Component                  | Target % | Actual % | Current Status                                                                                                     |
| ----------------------------------------- | -------: | -------: | ------------------------------------------------------------------------------------------------------------------ |
| IoT Hardware & Carnival Prototype Build   |     100% |      35% | ESP32 pin plan and wiring guide are documented; physical control build and enclosure remain                        |
| Data Acquisition & Sensor Pipeline        |     100% |      40% | Browser actions are operational; ESP32 JSON/WebSocket pipeline is planned but not hardware-tested                  |
| IS Models / Algorithms & Training         |      90% |      90% | Adaptive frequency/counter rules and special-round engine are implemented and automated tests cover core behavior  |
| Machine Learning / Rule Engine Deployment |      80% |      85% | Server-side AI and deterministic rules are connected to the live game flow                                         |
| Monitoring Dashboard & Documentation      |     100% |      80% | Browser dashboard, Top 10 leaderboard, project guide, Arduino integration guide, and progress report are available |

---

## 5. Accomplishments & Next Period Targets

### A. Completed Tasks (This Reporting Period)

| Completed Task / Deliverable                                                                        | Related IS Feature / Layer       | Assigned Member | Date Completed |
| --------------------------------------------------------------------------------------------------- | -------------------------------- | --------------- | -------------- |
| Implemented Express and WebSocket server state, validation, timer, and match lifecycle              | Match Server / IoT Data Pipeline | [Full Name]     | 11/19/2026     |
| Implemented the five-round match, scoring, Glitch Mode, Double Stakes, and one-use Hack Chip        | Rule Engine / Special Mechanics  | [Full Name]     | 11/19/2026     |
| Implemented adaptive AI using up to 10 recent player moves with 70% counter and 30% random behavior | Madam Glitch / AI Logic          | [Full Name]     | 11/19/2026     |

| Implemented SQLite match and player-move storage | Data Storage / Leaderboard | [Full Name] | 11/19/2026 |
| Implemented the browser UI, Top 10 leaderboard, round result format, and responsive presentation | UI / Dashboard | [Full Name] | 11/19/2026 |
| Added automated tests for AI, match rules, database storage, and WebSocket server behavior | Testing / Documentation | [Full Name] | 11/19/2026 |

### B. Work in Progress & Next Targets

| Planned Task / Target                                                             | Current Status    | Assigned Member | Target Deadline |
| --------------------------------------------------------------------------------- | ----------------- | --------------- | --------------- |
| Assemble and test ESP32 buttons, LEDs, and buzzer                                 | In Progress (35%) | [Full Name]     | [MM/DD/YYYY]    |
| Upload, configure, and test the ESP32 WebSocket firmware                          | In Progress (20%) | [Full Name]     | [MM/DD/YYYY]    |
| Verify Wi-Fi reconnection and disconnected-state behavior                         | Not Started       | [Full Name]     | [MM/DD/YYYY]    |
| Run complete five-round physical demonstrations and collect sensor and match logs | Not Started       | [Full Name]     | [MM/DD/YYYY]    |
| Prepare live accuracy / model behavior evidence and final documentation           | In Progress (40%) | [Full Name]     | [MM/DD/YYYY]    |

Mount the controls, lighting, and laptop screen in the carnival enclosure | Not Started | [Full Name] | [MM/DD/YYYY] |
|

---

## 6. Technical Issues, Sensor/Model Bottlenecks & Mitigation

| Identified Issue (Hardware / Sensor / AI Model)               | Impact | Root Cause & Action / Mitigation Plan                                                                                                                    |
| ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESP32 firmware and physical sensor wiring are not yet tested  | High   | Build the starter firmware and verify all four buttons, LEDs, and buzzer with the documented Arduino IDE integration guide before full booth integration |
| Physical button presses may generate repeated or false events | Medium | Apply 35 ms debouncing in firmware and validate that one physical press sends one JSON WebSocket action                                                  |
| Wi-Fi or WebSocket may disconnect during a match              | High   | Keep laptop server state authoritative, implement ESP32 reconnect logic, preserve browser reconnection, and test network disconnection and recovery      |

| Frequency prediction can become predictable to repeated players | Medium | Retain the 70% prediction and 30% randomization balance; evaluate live match histories for adaptive behavior and variation |
| Hardware input differs from browser input if message contracts diverge | High | Use one lowercase move contract, validate server actions, and test ESP32 and browser inputs against the same server rules |
| External Wi-Fi networks may isolate devices | Medium | Use a trusted private hotspot or network, record the laptop IPv4 address, and allow only TCP port 3000 for the local game |

---

## 7. Verifiable Evidence & Visual Proof

### Repository and Data Links

**Source Code & AI/IoT Repository:** [Paste GitHub repository URL here]

**Sample Dataset / Sensor Logs Link:** [Paste sensor-log or match-log URL here]

**Demo Video / Live Dashboard Link:** [Paste demo-video or dashboard URL here]

### Attached Screenshots

**Figure 1: [Meeting Attendees / Actual Meeting]**

[Insert meeting photo or attendance screenshot]

**Figure 2: [Screenshot of IS Model Output, Accuracy Metrics, or Rule-Engine Logic]**

[Insert adaptive-AI or automated-test result screenshot]

**Figure 3: [Photo of Carnival IoT Prototype / Sensor Wiring & Hardware Setup]**

[Insert ESP32 wiring or booth prototype photo]

**Figure 4: [Screenshot of Live Dashboard / Serial Monitor / Git Commit Contributions]**

[Insert browser leaderboard, live dashboard, or Serial Monitor screenshot]

---

## Implementation Evidence Summary

- `src/game/ai.js` implements adaptive move prediction from the latest 10 player moves.
- `src/game/match.js` implements the five-round match, win/tie/loss scoring, Glitch Mode, Double Stakes, and Hack Chip.
- `src/game/rules.js` implements standard Rock, Paper, Scissors match resolution.
- `src/server.js` implements Express, WebSocket state management, the 10-second timer, and result feedback.
- `src/storage/database.js` implements match storage and Top 10 leaderboard ranking.
- `public/game.js`, `public/index.html`, and `public/styles.css` implement the browser dashboard and result display.
- Automated test files cover the AI, rules, match flow, database, and server behavior.
- `npm test` currently passes 27 tests.

---

Republic of the Philippines

**CAVITE STATE UNIVERSITY**

CvSU Bacoor City Campus  
City of Bacoor, Cavite  
(046) 476-5029  
www.cvsu.edu.ph
