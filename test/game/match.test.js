import assert from "node:assert/strict";
import test from "node:test";
import { createMatch, playPlayerMove, submitMove, useHack } from "../../src/game/match.js";

test("starts a five-round match with a trimmed player name", () => {
  const match = createMatch("  JON  ");

  assert.equal(match.playerName, "JON");
  assert.equal(match.currentRound, 1);
  assert.equal(match.roundsPlayed, 0);
  assert.equal(match.status, "active");
});

test("requires a non-empty player name", () => {
  assert.throws(() => createMatch("  "), {
    name: "TypeError",
    message: "playerName must be a non-empty string.",
  });
});

test("records outcomes and advances through five rounds", () => {
  let match = createMatch("JON");
  match = submitMove(match, "rock", "scissors");
  assert.equal(match.currentRound, 2);

  match = submitMove(match, "rock", "paper");
  match = submitMove(match, "paper", "paper");
  match = submitMove(match, "scissors", "paper");
  match = submitMove(match, "rock", "rock");

  assert.equal(match.status, "completed");
  assert.equal(match.currentRound, 5);
  assert.equal(match.roundsPlayed, 5);
  assert.deepEqual(match.score, { wins: 2, losses: 1, ties: 2, points: 400 });
  assert.equal(match.history.length, 5);
});

test("uses player history to choose Madam Glitch's move", () => {
  let match = createMatch("JON");
  match = playPlayerMove(match, "rock", { random: () => 0.9 });
  assert.equal(match.history[0].madamMove, "scissors");
  assert.equal(match.history[0].outcome, "player");

  match = playPlayerMove(match, "rock", { random: () => 0.4 });
  assert.equal(match.history[1].madamMove, "paper");
  assert.equal(match.history[1].outcome, "madam-glitch");
});

test("uses a player's persisted history when selecting Madam Glitch's move", () => {
  const match = playPlayerMove(createMatch("JON"), "rock", {
    random: () => 0.4,
    priorHistory: ["scissors", "scissors"],
  });

  assert.equal(match.history[0].madamMove, "rock");
  assert.equal(match.history[0].outcome, "tie");
});

test("reverses wins and losses in Round 3 but leaves ties unchanged", () => {
  let match = createMatch("JON");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "rock", "scissors");
  match = submitMove(match, "rock", "scissors");
  assert.equal(match.history[2].outcome, "madam-glitch");

  match = submitMove(match, "rock", "rock");
  assert.equal(match.history[3].outcome, "tie");
});

test("doubles Round 4 points and records the event", () => {
  let match = createMatch("JON");
  match = submitMove(match, "rock", "rock");
  match = submitMove(match, "rock", "rock");
  match = submitMove(match, "rock", "rock");
  match = submitMove(match, "rock", "scissors");

  assert.equal(match.history[3].event, "double-stakes");
  assert.equal(match.history[3].pointsAwarded, 200);
  assert.equal(match.score.points, 350);
});

test("Hack Chip automatically wins one round and can only be used once", () => {
  const initialMatch = createMatch("JON");
  const hackedMatch = useHack(initialMatch);

  assert.equal(initialMatch.hackUsed, false);
  assert.equal(hackedMatch.hackUsed, true);
  assert.equal(hackedMatch.history[0].playerMove, "hack");
  assert.equal(hackedMatch.history[0].outcome, "player");
  assert.equal(hackedMatch.history[0].hacked, true);
  assert.equal(hackedMatch.score.wins, 1);
  assert.equal(hackedMatch.score.points, 100);
  assert.throws(() => useHack(hackedMatch), {
    name: "Error",
    message: "The Hack Chip has already been used.",
  });
});

test("does not accept moves after the match is complete", () => {
  let match = createMatch("JON");
  for (let round = 0; round < 5; round += 1) {
    match = submitMove(match, "rock", "rock");
  }

  assert.throws(() => submitMove(match, "rock", "rock"), {
    name: "Error",
    message: "The match is not active.",
  });
});
