import { chooseMadamMove, predictPlayerMove } from "./ai.js";
import { resolveRound } from "./rules.js";

const DEFAULT_MATCH_LENGTH = 5;
const ROUND_POINTS = Object.freeze({
  player: 100,
  "madam-glitch": 0,
  tie: 50,
});

function assertActiveMatch(match) {
  if (!match || match.status !== "active") {
    throw new Error("The match is not active.");
  }
}

function finishRound(match, roundResult) {
  const score = { ...match.score };
  if (roundResult.outcome === "player") {
    score.wins += 1;
  } else if (roundResult.outcome === "madam-glitch") {
    score.losses += 1;
  } else {
    score.ties += 1;
  }
  const event = match.roundEvents[match.currentRound - 1] ?? null;
  const pointsAwarded = ROUND_POINTS[roundResult.outcome] * (event === "double-stakes" ? 2 : 1);
  score.points += pointsAwarded;

  const history = [
    ...match.history,
    { round: match.currentRound, event, pointsAwarded, ...roundResult },
  ];
  const roundsPlayed = match.roundsPlayed + 1;
  const completed = roundsPlayed === match.roundLimit;

  return {
    ...match,
    currentRound: completed ? match.currentRound : match.currentRound + 1,
    roundsPlayed,
    status: completed ? "completed" : "active",
    score,
    history,
  };
}

export function createMatch(playerName, {
  rounds = DEFAULT_MATCH_LENGTH,
  glitchMode = true,
  randomEvents = true,
  eventFrequencyPct = 100,
  predictionPct = 70,
  hackEnabled = true,
  random = Math.random,
} = {}) {
  if (typeof playerName !== "string" || playerName.trim().length === 0) {
    throw new TypeError("playerName must be a non-empty string.");
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > DEFAULT_MATCH_LENGTH) {
    throw new RangeError("rounds must be an integer from 1 to 5.");
  }
  if (!Number.isInteger(eventFrequencyPct) || eventFrequencyPct < 0 || eventFrequencyPct > 100) {
    throw new RangeError("eventFrequencyPct must be an integer from 0 to 100.");
  }
  if (!Number.isInteger(predictionPct) || predictionPct < 0 || predictionPct > 100) {
    throw new RangeError("predictionPct must be an integer from 0 to 100.");
  }
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }
  for (const [name, value] of Object.entries({ glitchMode, randomEvents, hackEnabled })) {
    if (typeof value !== "boolean") {
      throw new TypeError(`${name} must be a boolean.`);
    }
  }
  const eventOccurs = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("random must return a number from 0 inclusive to 1 exclusive.");
    }
    return value * 100 < eventFrequencyPct;
  };
  const roundEvents = Array.from({ length: rounds }, (_, index) => {
    const round = index + 1;
    if (round === 3 && glitchMode && eventOccurs()) {
      return "glitch-mode";
    }
    if (round === 4 && randomEvents && eventOccurs()) {
      return "double-stakes";
    }
    return null;
  });

  return {
    playerName: playerName.trim(),
    currentRound: 1,
    roundLimit: rounds,
    roundEvents,
    predictionPct,
    hackEnabled,
    roundsPlayed: 0,
    status: "active",
    hackUsed: false,
    score: { wins: 0, losses: 0, ties: 0, points: 0 },
    history: [],
  };
}

export function submitMove(match, playerMove, madamMove) {
  assertActiveMatch(match);
  const outcome = resolveRound(playerMove, madamMove, {
    reverseOutcome: match.roundEvents[match.currentRound - 1] === "glitch-mode",
  });

  return finishRound(match, {
    playerMove,
    madamMove,
    outcome,
    hacked: false,
  });
}

export function playPlayerMove(
  match,
  playerMove,
  { random = Math.random, priorHistory = [] } = {},
) {
  assertActiveMatch(match);
  if (!Array.isArray(priorHistory)) {
    throw new TypeError("priorHistory must be an array of moves.");
  }
  const playerHistory = [
    ...priorHistory,
    ...match.history.map((round) => round.playerMove),
  ].filter((move) => move !== "hack");
  const predictedMove = predictPlayerMove(playerHistory);
  const madamMove = chooseMadamMove(playerHistory, random, match.predictionPct / 100);
  const nextMatch = submitMove(match, playerMove, madamMove);
  const lastRoundIndex = nextMatch.history.length - 1;
  return {
    ...nextMatch,
    history: nextMatch.history.map((round, index) =>
      index === lastRoundIndex ? { ...round, predictedMove } : round,
    ),
  };
}

export function useHack(match) {
  assertActiveMatch(match);
  if (!match.hackEnabled) {
    throw new Error("The Hack Chip is disabled for this match.");
  }
  if (match.hackUsed) {
    throw new Error("The Hack Chip has already been used.");
  }

  const nextMatch = finishRound(match, {
    playerMove: "hack",
    madamMove: null,
    outcome: "player",
    hacked: true,
  });

  return { ...nextMatch, hackUsed: true };
}
