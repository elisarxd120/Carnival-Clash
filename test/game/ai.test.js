import assert from "node:assert/strict";
import test from "node:test";
import { chooseMadamMove } from "../../src/game/ai.js";

test("counters the most frequent recent player move in prediction mode", () => {
  const move = chooseMadamMove(["rock", "rock", "scissors"], () => 0.4);
  assert.equal(move, "paper");
});

test("breaks frequency ties in favor of the most recent tied move", () => {
  const move = chooseMadamMove(["rock", "paper"], () => 0.4);
  assert.equal(move, "scissors");
});

test("uses a random move 30 percent of the time", () => {
  const randomValues = [0.8, 0.5];
  const move = chooseMadamMove(["rock", "rock"], () => randomValues.shift());
  assert.equal(move, "paper");
});

test("uses a random move when there is no history", () => {
  assert.equal(chooseMadamMove([], () => 0.5), "paper");
});

test("predicts from only the most recent ten moves", () => {
  const history = [
    "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock", "rock",
    "scissors", "scissors", "scissors", "scissors", "scissors", "scissors", "scissors", "scissors", "scissors", "scissors",
  ];
  const move = chooseMadamMove(history, () => 0.4);
  assert.equal(move, "rock");
});

test("rejects invalid histories and random values", () => {
  assert.throws(() => chooseMadamMove("rock"), {
    name: "TypeError",
    message: "history must be an array of moves.",
  });
  assert.throws(() => chooseMadamMove(["lizard"], () => 0.5), {
    name: "TypeError",
    message: "History contains an invalid move: lizard.",
  });
  assert.throws(() => chooseMadamMove([], () => 1), {
    name: "RangeError",
    message: "random must return a number from 0 inclusive to 1 exclusive.",
  });
});
