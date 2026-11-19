import { chooseMadamMove } from "./ai.js";
import { resolveRound } from "./rules.js";

const MATCH_LENGTH = 5;
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
  const event = match.currentRound === 3
    ? "glitch-mode"
    : match.currentRound === 4
      ? "double-stakes"
      : null;
  const pointsAwarded = ROUND_POINTS[roundResult.outcome] * (event === "double-stakes" ? 2 : 1);
  score.points += pointsAwarded;

  const history = [
    ...match.history,
    { round: match.currentRound, event, pointsAwarded, ...roundResult },
  ];
  const roundsPlayed = match.roundsPlayed + 1;
  const completed = roundsPlayed === MATCH_LENGTH;

  return {
    ...match,
    currentRound: completed ? match.currentRound : match.currentRound + 1,
    roundsPlayed,
    status: completed ? "completed" : "active",
    score,
    history,
  };
}

export function createMatch(playerName) {
  if (typeof playerName !== "string" || playerName.trim().length === 0) {
    throw new TypeError("playerName must be a non-empty string.");
  }

  return {
    playerName: playerName.trim(),
    currentRound: 1,
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
    reverseOutcome: match.currentRound === 3,
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
  const madamMove = chooseMadamMove(playerHistory, random);
  return submitMove(match, playerMove, madamMove);
}

export function useHack(match) {
  assertActiveMatch(match);
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
