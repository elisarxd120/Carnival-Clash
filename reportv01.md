# INTELLIGENT SYSTEMS PROGRESS REPORT

## Midpoint Progress: Carnival Clash

## 1. Project & Team Information

**Project / Carnival Attraction Title:** Carnival Clash — Predictive Rock, Paper, Scissors with ESP32  

**Course & Section:** Intelligent Systems (IS) / BSIT / BSCS \_\_\_\_  

**Course Instructor:** Ms. Mikaela Arciaga  

**Report Number & Period:** Midpoint Progress Report | November 20, 2026  

**Overall Project Status:** ☑ On Track ☐ Slightly Delayed ☐ At Risk  

**Estimated Overall Completion:** 50% _(midpoint estimate; physical hardware integration remains)_  

### Team Roster & Role Assignments

| Assigned Role | Student Full Name |
| --- | --- |
| Project Manager | [Full Name] |
| IoT Hardware & Sensor Lead (ESP32/Arduino/Sensors) | [Full Name] |
| AI / Machine Learning / Rule-Engine Developer | [Full Name] |
| UI & Documentation Lead | [Full Name] |

---

## 2. Executive Summary & Carnival IoT Theme Overview

Carnival Clash is a Rock, Paper, Scissors carnival game. The laptop game is working: players can play five rounds against Madam Glitch, earn points, and see results on a leaderboard. Madam Glitch uses recent player moves to help choose a counter move.

The team has completed the main game software, including the rules, browser screen, server, and saved match results. The ESP32 buttons, lights, and buzzer are still planned and have not yet been tested as a physical booth. The next step is to build and connect that hardware, then test a full game.

---

## 3. Intelligent System (IS) Features Integration

### Minimum Three Integrated Features

| IS Feature Name | Input(s) | Technique Used | Output / Action | Completion % |
| --- | --- | --- | --- | ---: |
| Madam Glitch Opponent | Recent player moves | Counts up to 10 recent moves; counters the likely move about 70% of the time and otherwise chooses randomly | Chooses the computer's move | 80% |
| Special Round Rules | Current round and player move | Rule-based game logic | Reverses results in Round 3 and doubles points in Round 4 | 90% |
| Match Scoring and Timer | Player move and round timer | Game rules and timeout handling | Records wins, ties, losses, points, and a random move after timeout | 85% |
| Top 10 Leaderboard | Completed match results | Database ranking | Shows the highest-ranked completed matches | 75% |

### Optional Additional Feature

| IS Feature Name | Input | Technique | Output / Action | Completion % |
| --- | --- | --- | --- | ---: |
| ESP32 Controls and Feedback | Planned Rock, Paper, Scissors, and Hack buttons | WebSocket messages and server feedback | Sends player actions and will show results with LEDs and a buzzer | 20% |

---

## 4. System Architecture & Component Completion

| System Layer / Component | Target % | Actual % | Current Status |
| --- | ---: | ---: | --- |
| IoT Hardware & Booth Build | 100% | 20% | Pin plan and wiring instructions are documented; physical assembly remains. |
| Data Collection & Sensor Pipeline | 100% | 30% | Browser input works; ESP32 input has not been tested. |
| AI Models and Game Rules | 90% | 80% | Adaptive move selection and special-round rules are implemented. |
| Game Server and Deployment | 80% | 75% | The server manages matches, timers, and game actions. |
| Dashboard and Documentation | 100% | 70% | Browser game and leaderboard are available; final evidence and documentation remain. |

---

## 5. Accomplishments & Next Period Targets

### A. Completed Tasks (This Reporting Period)

| Completed Task / Deliverable | Related Feature / Layer | Assigned Member | Date Completed |
| --- | --- | --- | --- |
| Built the five-round game and its scoring rules | Game Rules | [Full Name] | [MM/DD/YYYY] |
| Added Madam Glitch's move selection and special rounds | AI / Rule Engine | [Full Name] | [MM/DD/YYYY] |
| Created the browser game and leaderboard | UI / Dashboard | [Full Name] | [MM/DD/YYYY] |
| Added the server and database for game results | Server / Data Storage | [Full Name] | [MM/DD/YYYY] |
| Added automated tests for game and server behavior | Testing | [Full Name] | [MM/DD/YYYY] |
| Wrote an ESP32 setup and integration guide | IoT Documentation | [Full Name] | [MM/DD/YYYY] |

### B. Work in Progress & Next Targets

| Planned Task / Target | Current Status | Assigned Member | Target Deadline |
| --- | --- | --- | --- |
| Assemble and test the ESP32 buttons, LEDs, and buzzer | Not Started | [Full Name] | [MM/DD/YYYY] |
| Connect ESP32 actions to the game over Wi-Fi | Planned | [Full Name] | [MM/DD/YYYY] |
| Test connection loss and reconnection | Planned | [Full Name] | [MM/DD/YYYY] |
| Play and record complete five-round hardware tests | Planned | [Full Name] | [MM/DD/YYYY] |
| Add demonstration evidence and finish the report | In Progress | [Full Name] | [MM/DD/YYYY] |

---

## 6. Technical Issues, Sensor/Model Bottlenecks & Mitigation

| Identified Issue | Impact | Mitigation Plan |
| --- | --- | --- |
| ESP32 hardware has not been assembled or tested | High | Build and test each button, LED, and buzzer using the integration guide. |
| Wi-Fi or WebSocket connection may fail during play | High | Test on a trusted shared network and verify that the ESP32 reconnects. |
| Physical buttons may send repeated actions | Medium | Use button debouncing and confirm one message is sent per press. |
| AI may become predictable | Medium | Keep some random choices and test it with different player move histories. |

---

## 7. Verifiable Evidence & Visual Proof

### Repository and Data Links

**Source Code & AI/IoT Repository:** [Paste GitHub repository URL here]  

**Sample Dataset / Sensor Logs Link:** [Add match or sensor-log link when available]  

**Demo Video / Live Dashboard Link:** [Add demo or dashboard link when available]  

### Attached Screenshots

**Figure 1: Team Meeting or Attendance**  

[Insert meeting photo or attendance screenshot]

**Figure 2: Game or AI Output**  

[Insert screenshot of a game round, AI behavior, or test result]

**Figure 3: ESP32 Hardware Setup**  

[Insert a photo after the ESP32 controls are assembled]

**Figure 4: Dashboard or Test Evidence**  

[Insert leaderboard, dashboard, or test screenshot]

---

## Implementation Evidence Summary

- The game logic, adaptive opponent, server, browser interface, and SQLite leaderboard are implemented.
- The ESP32 wiring and WebSocket message plan are documented, but physical hardware integration is not yet complete.
- Automated tests cover the main game and server behavior.

---

Republic of the Philippines

**CAVITE STATE UNIVERSITY**

CvSU Bacoor City Campus  
City of Bacoor, Cavite  
(046) 476-5029  
www.cvsu.edu.ph
