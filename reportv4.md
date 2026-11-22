# INTELLIGENT SYSTEMS PROGRESS REPORT

## Intelligent Features, Sensor Pipeline & Model Tracking

## 1. Project & Team Information

**Project / Carnival Attraction Title:** Carnival Clash - Predictive Rock, Paper, Scissors AIoT Booth

**Course & Section:** Intelligent Systems (IS) / BSIT / BSCS ___

**Course Instructor:** Ms. Mikaela Arciaga

**Report Number & Period:** Report #3 | November 18, 2026

**Overall Project Status:** ☑ On Track ☐ Slightly Delayed ☐ At Risk

**Estimated Overall Completion:** 82% _(Target for this period: 85%)_

### Team Roster & Role Assignments

| Assigned Role | Student Full Name |
| --- | --- |
| Project Manager | [Full Name] |
| IoT Hardware & Sensor Lead (ESP32/Arduino/Sensors) | [Full Name] |
| AI / Machine Learning / Rule-Engine Developer | [Full Name] |
| UI & Documentation Lead | [Full Name] |

---

## 2. Executive Summary & Carnival IoT Theme Overview

Carnival Clash is an intelligent carnival booth based on Rock, Paper, Scissors. The system uses a Node.js and Express server, WebSocket communication, SQLite persistent storage, a responsive browser interface, and an administrator dashboard. Madam Glitch predicts the player's next move from recent move history and uses that prediction to select a counter move.

The attraction currently supports a complete five-round match, a 10-second round timer, timeout randomization, a one-use Hack Chip, Glitch Mode, Double Stakes, round-by-round results, and a Top 10 leaderboard. Completed matches save player moves, predictions, outcomes, events, and match statistics.

During this reporting period, the team expanded the software beyond the basic game. The public interface now separates gameplay from leaderboard management, the administrator dashboard provides live monitoring and analytics, and the server supports persisted game settings, feedback messages, CSV export, database backup, and ESP32 device status. Physical ESP32 assembly and live hardware testing remain the main tasks before the attraction can be demonstrated as a complete AIoT booth.

---

## 3. Intelligent System (IS) Features Integration

### Minimum Three Integrated Features

| IS Feature Name | IoT Sensor Input(s) | AI / IS Technique Used | Intelligent Action / Output | Completion % |
| --- | --- | --- | --- | ---: |
| Adaptive Madam Glitch Opponent | Browser move selections or planned ESP32 Rock, Paper, Scissors, and Hack buttons; the most recent 10 valid player moves | Frequency analysis and most-frequent move prediction with a configurable 70% counter-prediction ratio | Predicts the player's next move, counters it through the Rock-Paper-Scissors mapping, or chooses a random move for variability | 95% |
| Special-Round Rule Engine | Current round number, active game settings, player move, and Glitch/Double-Stakes event state | Rule-based expert system | Reverses outcomes in Round 3 Glitch Mode, doubles points in Round 4 Double Stakes, and applies normal resolution in other rounds | 95% |
| Match Scoring, Timeout & Persistence System | Selected move, Hack Chip action, round timer, match duration, and completed round history | Deterministic rules, timeout fallback, and SQLite analytics | Awards 100 points for a win, 50 for a tie, 0 for a loss, randomly selects timed-out moves, and stores match and round records | 98% |
| Live ESP32 Feedback and Device Monitor | Device connection state, move/hack WebSocket actions, and feedback test controls | Event-driven state monitoring and message routing | Reports physical button activity in the administrator dashboard and sends win, loss, tie, glitch, or chaos feedback to connected devices | 60% |

### Optional Additional Feature

| IS Feature Name | Sensor Input | AI / IS Algorithm | Automated Decision / Output | Completion % |
| --- | --- | --- | --- | ---: |
| Administrator Analytics and Prediction Tracking | Saved match totals, round moves, player moves, events, and Madam Glitch predictions | SQL aggregation and accuracy analysis | Produces dashboard totals, game analytics, round win rates, move distribution, Hack Chip usage, and AI prediction accuracy | 90% |

---

## 4. System Architecture & Component Completion

| System Layer / Component | Target % | Actual % | Current Status |
| --- | ---: | ---: | --- |
| IoT Hardware & Carnival Prototype Build | 100% | 40% | ESP32 integration instructions and the WebSocket message contract are documented; physical assembly and live hardware testing remain. |
| Data Acquisition & Sensor Pipeline | 100% | 65% | Browser actions, server WebSocket state, round logging, and player-move history are operational. ESP32 button input still requires hardware validation. |
| IS Models / Algorithms & Training | 90% | 95% | Adaptive move prediction, configurable prediction ratio, special-round rules, and scoring logic are implemented and covered by tests. |
| Machine Learning / Rule Engine Deployment | 85% | 95% | The server-side rule engine and adaptive opponent are deployed directly into the live match flow. |
| Monitoring Dashboard & Documentation | 100% | 90% | Public UI, administrator dashboard, leaderboard, analytics, Arduino integration guide, setup documentation, and progress reports are available. |

---

## 5. Accomplishments & Next Period Targets

### A. Completed Tasks (This Reporting Period)

| Completed Task / Deliverable | Related IS Feature / Layer | Assigned Member | Date Completed |
| --- | --- | --- | --- |
| Implemented the five-round match lifecycle, timer, scoring, Glitch Mode, Double Stakes, and Hack Chip | Match Server / Rule Engine | [Full Name] | 11/21/2026 |
| Implemented adaptive move prediction using up to 10 recent moves and a configurable prediction ratio | Madam Glitch / AI Logic | [Full Name] | 11/21/2026 |
| Added SQLite match, round, player-move, settings, and system-log storage | Data Persistence / Analytics | [Full Name] | 11/21/2026 |
| Created the public game interface and separated it from the Hall of Fame and replay flow | Public UI / Match Display | [Full Name] | 11/21/2026 |
| Added a secure administrator dashboard with live status, analytics, match management, settings, CSV export, and backup | Monitoring / Administration | [Full Name] | 11/21/2026 |
| Added ESP32 device connection, last-button, feedback, and test-effect support to the WebSocket server | IoT Pipeline / ESP32 Integration | [Full Name] | 11/21/2026 |
| Ran and maintained automated tests for AI, rules, matches, database storage, and server behavior | Testing / Quality Assurance | [Full Name] | 11/21/2026 |

### B. Work in Progress & Next Targets

| Planned Task / Target | Current Status | Assigned Member | Target Deadline |
| --- | --- | --- | --- |
| Assemble and test ESP32 Rock, Paper, Scissors, Hack, LED, and buzzer controls | In Progress (40%) | [Full Name] | [MM/DD/YYYY] |
| Upload ESP32 firmware and test the documented WebSocket message contract | Not Started | [Full Name] | [MM/DD/YYYY] |
| Test Wi-Fi connection, reconnection, and disconnected-device behavior | Not Started | [Full Name] | [MM/DD/YYYY] |
| Play complete live five-round matches and collect match/sensor evidence | Not Started | [Full Name] | [MM/DD/YYYY] |
| Calculate live AI prediction accuracy and verify model behavior against real move histories | In Progress (45%) | [Full Name] | [MM/DD/YYYY] |
| Mount the electronics and display inside a final carnival booth enclosure | Not Started | [Full Name] | [MM/DD/YYYY] |
| Finalize demo video, meeting attendance, screenshots, and repository submission | In Progress (50%) | [Full Name] | [MM/DD/YYYY] |

---

## 6. Technical Issues, Sensor/Model Bottlenecks & Mitigation

| Identified Issue (Hardware / Sensor / AI Model) | Impact | Root Cause & Action / Mitigation Plan |
| --- | --- | --- |
| ESP32 hardware and firmware have not been tested together | High | Assemble the controls, use debounced physical inputs, test the JSON/WebSocket contract, and verify move, Hack, and feedback messages. |
| Physical button presses may generate repeated or false events | Medium | Apply a 35 ms or equivalent debounce interval in firmware and confirm that one press sends only one server action. |
| Wi-Fi or WebSocket may disconnect during a match | High | Keep the laptop/Node.js server as the authoritative state, implement firmware reconnect logic, and test recovery on a trusted private network. |
| AI behavior can become predictable to repeated players | Medium | Preserve the configurable 70% prediction/30% random behavior, review AI accuracy in live data, and adjust the setting when necessary. |
| Browser input and ESP32 input may diverge | High | Share the same lowercase move contract (`rock`, `paper`, `scissors`, `hack`) and validate every action in the server. |
| The booth may have inconsistent network access | Medium | Use a private hotspot or known local network, record the server IPv4 address, and keep the server and clients on the same subnet. |

---

## 7. Verifiable Evidence & Visual Proof

### Repository and Data Links

**Source Code & AI/IoT Repository:** https://github.com/elisarxd120/Carnival-Clash

**Sample Dataset / Sensor Logs Link:** [Paste sensor-log or match-log URL here]

**Demo Video / Live Dashboard Link:** [Paste demo-video or dashboard URL here]

### Attached Screenshots

**Figure 1: [Meeting Attendees / Actual Meeting]**

[Insert meeting photo or attendance screenshot]

**Figure 2: [Screenshot of IS Model Output, Accuracy Metrics, or Rule-Engine Logic]**

[Insert adaptive-AI test result, administrator AI accuracy screen, or prediction log]

**Figure 3: [Photo of Carnival IoT Prototype / Sensor Wiring & Hardware Setup]**

[Insert ESP32 wiring or carnival booth assembly photo]

**Figure 4: [Screenshot of Live Dashboard / Serial Monitor / Git Commit Contributions]**

[Insert administrator dashboard, leaderboard, Serial Monitor, or Git history screenshot]

---

## Implementation Evidence Summary

- `src/game/ai.js` implements frequency-based prediction from the latest 10 player moves and configurable counter selection.
- `src/game/match.js` implements match state, round events, Hack Chip behavior, scoring, and predicted-move tracking.
- `src/game/rules.js` implements standard and Glitch Mode Rock-Paper-Scissors resolution.
- `src/server.js` implements the Express/WebSocket server, 10-second round timer, device communication, administrator APIs, settings, feedback, and system logs.
- `src/storage/database.js` implements match, round, player-move, leaderboard, analytics, settings, and backup data support.
- `public/game.js`, `public/index.html`, and `public/styles.css` implement the public carnival interface and replay flow.
- `public/admin.html` and `public/admin.js` implement live monitoring, analytics, match management, device status, and system controls.
- Automated test files cover adaptive AI, match rules, database storage, and WebSocket/server behavior.
- The project test suite passes **32 tests with 0 failures**.
- The ESP32 is not yet included as firmware or physical hardware in the current workspace.

---

Republic of the Philippines

**CAVITE STATE UNIVERSITY**

CvSU Bacoor City Campus  
City of Bacoor, Cavite  
(046) 476-5029  
www.cvsu.edu.ph
