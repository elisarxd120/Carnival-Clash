import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabase,
  deleteMatch,
  getGameAnalytics,
  getAdminLeaderboard,
  getLeaderboard,
  getMatchDetails,
  getPlayerMoveHistory,
  saveMatch,
  savePlayerMove,
  updateMatch,
} from "../../src/storage/database.js";
import { createMatch, playPlayerMove, submitMove } from "../../src/game/match.js";

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

test("persists round details and keeps hidden scores off the public leaderboard", (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());
  let match = createMatch("JON");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "paper", "rock");
  match = submitMove(match, "scissors", "rock");
  match = submitMove(match, "rock", "rock");
  match = submitMove(match, "paper", "scissors");
  const id = saveMatch(database, match, 42);

  assert.equal(getMatchDetails(database, id).length, 5);
  assert.equal(getMatchDetails(database, id)[0].playerMove, "rock");
  assert.equal(getLeaderboard(database).length, 1);
  assert.equal(updateMatch(database, id, { flagged: true, displayName: "Guest" }), true);
  assert.equal(getLeaderboard(database)[0].playerName, "Guest");
  assert.equal(updateMatch(database, id, { hidden: true }), true);
  assert.equal(getLeaderboard(database).length, 0);
  const [adminRow] = getAdminLeaderboard(database);
  assert.equal(adminRow.displayName, "Guest");
  assert.equal(adminRow.flagged, 1);
  assert.equal(deleteMatch(database, id), true);
  assert.deepEqual(getMatchDetails(database, id), []);
});

test("stores AI predictions for accuracy analytics", (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());
  let match = playPlayerMove(createMatch("JON"), "rock", {
    priorHistory: ["rock"],
    random: () => 0.4,
  });
  for (let round = 1; round < 5; round += 1) {
    match = submitMove(match, "rock", "rock");
  }
  const id = saveMatch(database, match, 30);

  assert.equal(getMatchDetails(database, id)[0].predictedMove, "rock");
  assert.deepEqual(getGameAnalytics(database).aiAccuracy, {
    predictions: 1,
    correct: 1,
    accuracy: 1,
  });
});
