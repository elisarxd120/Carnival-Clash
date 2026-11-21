import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function createDatabase(filename = "data/carnival-clash.sqlite") {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      player_name TEXT NOT NULL COLLATE NOCASE,
      points INTEGER NOT NULL CHECK (points >= 0),
      wins INTEGER NOT NULL CHECK (wins >= 0),
      losses INTEGER NOT NULL CHECK (losses >= 0),
      ties INTEGER NOT NULL CHECK (ties >= 0),
      hacks_used INTEGER NOT NULL CHECK (hacks_used IN (0, 1)),
      duration_sec INTEGER NOT NULL CHECK (duration_sec >= 0),
      display_name TEXT,
      hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
      flagged INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS matches_leaderboard
      ON matches (points DESC, wins DESC, ties DESC, created_at ASC);

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      round_number INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 5),
      player_move TEXT NOT NULL,
      madam_move TEXT,
      predicted_move TEXT,
      result TEXT NOT NULL CHECK (result IN ('player', 'madam-glitch', 'tie')),
      event TEXT,
      hacked INTEGER NOT NULL CHECK (hacked IN (0, 1)),
      timed_out INTEGER NOT NULL CHECK (timed_out IN (0, 1)),
      points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
      UNIQUE (match_id, round_number)
    );

    CREATE INDEX IF NOT EXISTS rounds_analytics ON rounds (round_number, event);

    CREATE TABLE IF NOT EXISTS player_moves (
      id INTEGER PRIMARY KEY,
      player_name TEXT NOT NULL COLLATE NOCASE,
      move TEXT NOT NULL CHECK (move IN ('rock', 'paper', 'scissors')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS player_moves_recent
      ON player_moves (player_name, id DESC);

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL
    );

    INSERT OR IGNORE INTO game_settings (id, config_json)
    VALUES (1, '{"predictionPct":70,"moveTimerSec":10,"rounds":5,"glitchMode":true,"randomEvents":true,"hackEnabled":true,"eventFrequencyPct":100,"maintenanceMode":false}');
  `);

  const matchColumns = new Set(
    database.prepare("PRAGMA table_info(matches)").all().map((column) => column.name),
  );
  for (const [name, definition] of [
    ["display_name", "TEXT"],
    ["hidden", "INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1))"],
    ["flagged", "INTEGER NOT NULL DEFAULT 0 CHECK (flagged IN (0, 1))"],
  ]) {
    if (!matchColumns.has(name)) {
      database.exec(`ALTER TABLE matches ADD COLUMN ${name} ${definition}`);
    }
    const roundColumns = new Set(
      database.prepare("PRAGMA table_info(rounds)").all().map((column) => column.name),
    );
    if (!roundColumns.has("predicted_move")) {
      database.exec("ALTER TABLE rounds ADD COLUMN predicted_move TEXT");
    }
  }

  return database;
}

export function getPlayerMoveHistory(database, playerName, limit = 10) {
  const rows = database.prepare(`
    SELECT move
    FROM player_moves
    WHERE player_name = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(playerName, limit);

  return rows.reverse().map((row) => row.move);
}

export function savePlayerMove(database, playerName, move) {
  database.prepare(`
    INSERT INTO player_moves (player_name, move)
    VALUES (?, ?)
  `).run(playerName, move);
}

export function saveMatch(database, match, durationSec) {
  const save = database.transaction(() => {
    const result = database.prepare(`
    INSERT INTO matches (
      player_name, points, wins, losses, ties, hacks_used, duration_sec
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      match.playerName,
      match.score.points,
      match.score.wins,
      match.score.losses,
      match.score.ties,
      Number(match.hackUsed),
      Math.max(0, Math.floor(durationSec)),
    );
    const matchId = Number(result.lastInsertRowid);
    const insertRound = database.prepare(`
      INSERT INTO rounds (
        match_id, round_number, player_move, madam_move, predicted_move,
        result, event, hacked, timed_out, points_awarded
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const round of match.history) {
      insertRound.run(
        matchId,
        round.round,
        round.playerMove,
        round.madamMove,
        round.predictedMove ?? null,
        round.outcome,
        round.event,
        Number(round.hacked),
        Number(round.timedOut ?? false),
        round.pointsAwarded,
      );
    }
    return matchId;
  });

  return save();
}

export function getLeaderboard(database, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100.");
  }

  return database.prepare(`
    SELECT
      COALESCE(display_name, player_name) AS playerName,
      points,
      wins,
      losses,
      ties,
      hacks_used AS hacksUsed,
      duration_sec AS durationSec,
      created_at AS playedAt,
      flagged
    FROM matches
    WHERE hidden = 0
    ORDER BY points DESC, wins DESC, ties DESC, created_at ASC, id ASC
    LIMIT ?
  `).all(limit);
}

export function getAdminOverview(database) {
  return database.prepare(`
    SELECT
      COUNT(*) AS gamesAllTime,
      SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime')
        THEN 1 ELSE 0 END) AS gamesToday,
      COUNT(DISTINCT player_name) AS uniquePlayers,
      COALESCE(SUM(wins) * 1.0 / NULLIF(SUM(wins + losses + ties), 0), 0)
        AS playerWinRate,
      COALESCE(AVG(points), 0) AS averageScore,
      COALESCE(AVG(duration_sec), 0) AS averageDurationSec
    FROM matches
  `).get();
}

export function getHighestScoreToday(database) {
  return database.prepare(`
    SELECT COALESCE(display_name, player_name) AS playerName, points
    FROM matches
    WHERE hidden = 0 AND date(created_at, 'localtime') = date('now', 'localtime')
    ORDER BY points DESC, created_at ASC, id ASC
    LIMIT 1
  `).get() ?? null;
}

export function getAdminLeaderboard(database, { search = "", period = "all" } = {}) {
  if (!["all", "today"].includes(period)) {
    throw new TypeError("period must be all or today.");
  }
  return database.prepare(`
    SELECT
      id, player_name AS playerName,
      COALESCE(display_name, player_name) AS displayName,
      points, wins, losses, ties, hacks_used AS hacksUsed,
      duration_sec AS durationSec, created_at AS playedAt,
      hidden, flagged
    FROM matches
    WHERE (? = '' OR player_name LIKE ? OR COALESCE(display_name, player_name) LIKE ?)
      AND (? = 'all' OR date(created_at, 'localtime') = date('now', 'localtime'))
    ORDER BY hidden ASC, points DESC, wins DESC, ties DESC, created_at ASC, id ASC
  `).all(search, `%${search}%`, `%${search}%`, period);
}

export function getGameHistory(database, {
  search = "",
  page = 1,
  pageSize = 20,
  sort = "created_at",
  direction = "desc",
} = {}) {
  const sortColumns = {
    created_at: "created_at",
    player_name: "player_name",
    points: "points",
    duration_sec: "duration_sec",
  };
  if (!Number.isInteger(page) || page < 1 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !sortColumns[sort] || !["asc", "desc"].includes(direction)) {
    throw new TypeError("Invalid game history pagination or sorting.");
  }
  const where = "WHERE player_name LIKE ? OR COALESCE(display_name, player_name) LIKE ?";
  const values = [`%${search}%`, `%${search}%`];
  const total = database.prepare(`SELECT COUNT(*) AS total FROM matches ${where}`).get(...values).total;
  const rows = database.prepare(`
    SELECT
      id, COALESCE(display_name, player_name) AS playerName, points,
      wins, losses, ties, hacks_used AS hacksUsed,
      duration_sec AS durationSec, created_at AS playedAt
    FROM matches ${where}
    ORDER BY ${sortColumns[sort]} ${direction.toUpperCase()}, id DESC
    LIMIT ? OFFSET ?
  `).all(...values, pageSize, (page - 1) * pageSize);
  return { rows, total, page, pageSize };
}

export function getAllGames(database) {
  return database.prepare(`
    SELECT
      id, COALESCE(display_name, player_name) AS playerName, points,
      wins, losses, ties, hacks_used AS hacksUsed,
      duration_sec AS durationSec, created_at AS playedAt
    FROM matches ORDER BY created_at DESC, id DESC
  `).all();
}

export function getMatchDetails(database, matchId) {
  return database.prepare(`
    SELECT
      round_number AS round, player_move AS playerMove,
      madam_move AS madamMove, predicted_move AS predictedMove,
      result, event, hacked, timed_out AS timedOut,
      points_awarded AS pointsAwarded
    FROM rounds WHERE match_id = ? ORDER BY round_number
  `).all(matchId);
}

export function updateMatch(database, matchId, changes) {
  const fields = [];
  const values = [];
  if (Object.hasOwn(changes, "hidden")) {
    fields.push("hidden = ?");
    values.push(Number(changes.hidden));
  }
  if (Object.hasOwn(changes, "flagged")) {
    fields.push("flagged = ?");
    values.push(Number(changes.flagged));
  }
  if (Object.hasOwn(changes, "displayName")) {
    fields.push("display_name = ?");
    values.push(changes.displayName);
  }
  if (fields.length === 0) {
    throw new TypeError("At least one match field must be updated.");
  }
  values.push(matchId);
  return database.prepare(`UPDATE matches SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
}

export function deleteMatch(database, matchId) {
  return database.prepare("DELETE FROM matches WHERE id = ?").run(matchId).changes > 0;
}

export function resetLeaderboard(database) {
  const reset = database.transaction(() => {
    database.prepare("DELETE FROM matches").run();
    database.prepare("DELETE FROM player_moves").run();
  });
  reset();
}

export function getGameAnalytics(database) {
  const moves = database.prepare(`
    SELECT player_move AS move, COUNT(*) AS count
    FROM rounds WHERE player_move != 'hack' GROUP BY player_move
  `).all();
  const roundWinRates = database.prepare(`
    SELECT round_number AS round,
      COUNT(*) AS games,
      COALESCE(SUM(result = 'player') * 1.0 / COUNT(*), 0) AS playerWinRate
    FROM rounds GROUP BY round_number ORDER BY round_number
  `).all();
  const events = database.prepare(`
    SELECT COALESCE(event, 'normal') AS event, COUNT(*) AS rounds,
      COALESCE(SUM(result = 'player') * 1.0 / COUNT(*), 0) AS playerWinRate
    FROM rounds GROUP BY event ORDER BY event
  `).all();
  const hacks = database.prepare(`
    SELECT COUNT(*) AS gamesUsingHack,
      COALESCE(SUM(CASE WHEN wins > 0 THEN 1 ELSE 0 END), 0) AS hackGamesWithWin
    FROM matches WHERE hacks_used = 1
  `).get();
  const hourly = database.prepare(`
    SELECT strftime('%H', created_at, 'localtime') AS hour, COUNT(*) AS games
    FROM matches WHERE date(created_at, 'localtime') = date('now', 'localtime')
    GROUP BY hour ORDER BY hour
  `).all();
  const aiAccuracy = database.prepare(`
    SELECT COUNT(predicted_move) AS predictions,
      COALESCE(SUM(predicted_move = player_move), 0) AS correct,
      COALESCE(SUM(predicted_move = player_move) * 1.0 /
        NULLIF(COUNT(predicted_move), 0), 0) AS accuracy
    FROM rounds WHERE predicted_move IS NOT NULL AND player_move != 'hack'
  `).get();
  return { moves, roundWinRates, events, hacks, hourly, aiAccuracy };
}

export function addSystemLog(database, level, message) {
  database.prepare("INSERT INTO system_logs (level, message) VALUES (?, ?)").run(level, message);
}

export function getSystemLogs(database, limit = 100) {
  return database.prepare(`
    SELECT created_at AS createdAt, level, message
    FROM system_logs ORDER BY id DESC LIMIT ?
  `).all(limit);
}

export function getGameSettings(database) {
  const row = database.prepare("SELECT config_json FROM game_settings WHERE id = 1").get();
  return JSON.parse(row.config_json);
}

export function saveGameSettings(database, settings) {
  database.prepare(`
    INSERT INTO game_settings (id, config_json) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json
  `).run(JSON.stringify(settings));
}
