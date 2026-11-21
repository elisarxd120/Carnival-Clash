import { MOVES } from "./rules.js";

const HISTORY_LIMIT = 10;
const PREDICTION_CHANCE = 0.7;
const COUNTERS = Object.freeze({
  rock: "paper",
  paper: "scissors",
  scissors: "rock",
});

function randomIndex(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("random must return a number from 0 inclusive to 1 exclusive.");
  }
  return Math.floor(value * MOVES.length);
}

export function predictPlayerMove(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("history must be an array of moves.");
  }
  const recentMoves = history.slice(-HISTORY_LIMIT);
  const counts = new Map(MOVES.map((move) => [move, 0]));

  for (const move of recentMoves) {
    if (!MOVES.includes(move)) {
      throw new TypeError(`History contains an invalid move: ${move}.`);
    }
    counts.set(move, counts.get(move) + 1);
  }

  const highestCount = Math.max(...counts.values());
  for (let index = recentMoves.length - 1; index >= 0; index -= 1) {
    const move = recentMoves[index];
    if (counts.get(move) === highestCount) {
      return move;
    }
  }

  return null;
}

export function chooseMadamMove(
  history,
  random = Math.random,
  predictionChance = PREDICTION_CHANCE,
) {
  if (!Array.isArray(history)) {
    throw new TypeError("history must be an array of moves.");
  }
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }
  if (!Number.isFinite(predictionChance) || predictionChance < 0 || predictionChance > 1) {
    throw new RangeError("predictionChance must be between 0 and 1.");
  }

  const prediction = predictPlayerMove(history);
  if (prediction === null) {
    return MOVES[randomIndex(random)];
  }

  if (random() < predictionChance) {
    return COUNTERS[prediction];
  }

  return MOVES[randomIndex(random)];
}
