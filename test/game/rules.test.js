import assert from "node:assert/strict";
import test from "node:test";
import { MOVES, resolveRound } from "../../src/game/rules.js";

test("lists the three valid moves", () => {
  assert.deepEqual(MOVES, ["rock", "paper", "scissors"]);
});

test("resolves every winning matchup", () => {
  assert.equal(resolveRound("rock", "scissors"), "player");
  assert.equal(resolveRound("paper", "rock"), "player");
  assert.equal(resolveRound("scissors", "paper"), "player");
});

test("resolves every losing matchup", () => {
  assert.equal(resolveRound("scissors", "rock"), "madam-glitch");
  assert.equal(resolveRound("rock", "paper"), "madam-glitch");
  assert.equal(resolveRound("paper", "scissors"), "madam-glitch");
});

test("resolves identical moves as ties", () => {
  for (const move of MOVES) {
    assert.equal(resolveRound(move, move), "tie");
  }
});

test("reverses a decisive outcome when Glitch Mode is enabled", () => {
  assert.equal(resolveRound("rock", "scissors", { reverseOutcome: true }), "madam-glitch");
  assert.equal(resolveRound("scissors", "rock", { reverseOutcome: true }), "player");
  assert.equal(resolveRound("rock", "rock", { reverseOutcome: true }), "tie");
});

test("rejects invalid player and Madam Glitch moves", () => {
  assert.throws(() => resolveRound("lizard", "rock"), {
    name: "TypeError",
    message: "playerMove must be one of: rock, paper, scissors.",
  });
  assert.throws(() => resolveRound("rock", "lizard"), {
    name: "TypeError",
    message: "madamMove must be one of: rock, paper, scissors.",
  });
});
