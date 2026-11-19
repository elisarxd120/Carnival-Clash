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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS matches_leaderboard
      ON matches (points DESC, wins DESC, ties DESC, created_at ASC);

    CREATE TABLE IF NOT EXISTS player_moves (
      id INTEGER PRIMARY KEY,
      player_name TEXT NOT NULL COLLATE NOCASE,
      move TEXT NOT NULL CHECK (move IN ('rock', 'paper', 'scissors')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS player_moves_recent
      ON player_moves (player_name, id DESC);
  `);

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

  return Number(result.lastInsertRowid);
}

export function getLeaderboard(database, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100.");
  }

  return database.prepare(`
    SELECT
      player_name AS playerName,
      points,
      wins,
      losses,
      ties,
      hacks_used AS hacksUsed,
      duration_sec AS durationSec,
      created_at AS playedAt
    FROM matches
    ORDER BY points DESC, wins DESC, ties DESC, created_at ASC, id ASC
    LIMIT ?
  `).all(limit);
}
