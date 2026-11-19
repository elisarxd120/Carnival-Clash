import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabase,
  getLeaderboard,
  getPlayerMoveHistory,
  saveMatch,
  savePlayerMove,
} from "../../src/storage/database.js";
import { createMatch, submitMove } from "../../src/game/match.js";

test("saves player move history and returns the latest moves in order", (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());

  for (const move of ["rock", "paper", "scissors", "rock"]) {
    savePlayerMove(database, "JON", move);
  }

  assert.deepEqual(getPlayerMoveHistory(database, "jon", 3), ["paper", "scissors", "rock"]);
});

test("saves completed match results for leaderboard ranking", (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());

  let match = createMatch("JON");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "rock", "rock");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "rock", "rock");
  saveMatch(database, match, 78);

  const [entry] = getLeaderboard(database);
  assert.equal(entry.playerName, "JON");
  assert.equal(entry.points, 500);
  assert.equal(entry.wins, 3);
  assert.equal(entry.ties, 2);
  assert.equal(entry.losses, 0);
  assert.equal(entry.durationSec, 78);
});

test("rejects invalid leaderboard limits", (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());

  assert.throws(() => getLeaderboard(database, 0), {
    name: "RangeError",
    message: "limit must be an integer from 1 to 100.",
  });
});
