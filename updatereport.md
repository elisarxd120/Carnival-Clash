# Carnival Clash update report

**Date:** November 21, 2026

## Opening the admin dashboard

1. Open a terminal in the Carnival Clash project folder.
2. Start the server:

   ```powershell
   npm start
   ```

3. Open [http://localhost:3000/admin](http://localhost:3000/admin).
4. Sign in with the admin password configured for this installation. The local server reads `ADMIN_PASSWORD` from the Git-ignored `.env` file and hashes it with scrypt when it starts.

If setting up a fresh copy, create a local `.env` file containing:

```text
ADMIN_PASSWORD=choose-a-strong-password
```

Do not commit `.env` or put the password in a report or source file. Use a strong password before exposing the server to other devices or networks. The public game and leaderboard remain at [http://localhost:3000/](http://localhost:3000/).

## Changes delivered today

### Separate public and admin pages

- The public page continues to show the Hall of Fame before a game.
- The leaderboard is removed from the active game layout so players can focus on Madam Glitch and choosing a move.
- The admin dashboard is a separate page at `/admin`; its data APIs require an admin session.

### Admin dashboard

- Overview: games today and all-time, unique players, player/machine win rates, average score and duration, today's highest score, ESP32 status, and server uptime.
- Live monitor: current player, round, score, mode, Hack Chip usage, and latest move result.
- Device monitor: connection state, last button press, connection time, reconnect count, physical-button indicator, and win/lose/glitch/chaos test effects.
- Leaderboard management: search, today/all-time filters, hide/show, rename, flag, delete, and confirmed reset.
- Game history: search, sorting, pagination, and round-by-round details.
- Analytics: move distribution, AI prediction accuracy, player win rate by round and event, Hack Chip use, and games per hour.
- Controls and operations: persisted AI ratio, timer, round count, Glitch Mode, event settings, Hack Chip, and maintenance pause; system log; CSV export; and SQLite backup.

### Game data and security

- Completed games now save round-level moves, results, events, timeouts, Hack Chip usage, and AI predictions alongside match totals.
- SQLite schema changes migrate automatically when the server starts.
- Admin passwords are checked using salted scrypt hashes. Admin sessions use an HttpOnly, SameSite cookie and expire after inactivity; repeated failed logins are temporarily blocked.
- Admin actions are recorded in the system log. CSV export includes all recorded games, and database backups are written under `data/`.

## ESP32 note

The current workspace does not include ESP32 firmware. Until the device connects to the game WebSocket and sends `{"type":"device-connect"}`, the dashboard correctly reports it as offline. After connecting, it can send the existing `move` and `hack` messages; admin test effects are sent as `feedback` messages.

## Validation

The project test suite passed: **32 tests, 0 failures**.

## Related files

- Public game page: [public/index.html](public/index.html)
- Admin page: [public/admin.html](public/admin.html)
- Admin dashboard behavior: [public/admin.js](public/admin.js)
- Server routes and authentication: [src/server.js](src/server.js)
- SQLite storage and migrations: [src/storage/database.js](src/storage/database.js)
- Project run and setup guide: [carnival clash.md](carnival%20clash.md)
