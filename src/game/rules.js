export const MOVES = Object.freeze(["rock", "paper", "scissors"]);

const WINNING_MOVES = Object.freeze({
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
});

function assertMove(move, label) {
  if (!MOVES.includes(move)) {
    throw new TypeError(`${label} must be one of: ${MOVES.join(", ")}.`);
  }
}

export function resolveRound(playerMove, madamMove, { reverseOutcome = false } = {}) {
  assertMove(playerMove, "playerMove");
  assertMove(madamMove, "madamMove");
  if (typeof reverseOutcome !== "boolean") {
    throw new TypeError("reverseOutcome must be a boolean.");
  }

  if (playerMove === madamMove) {
    return "tie";
  }

  const normalOutcome = WINNING_MOVES[playerMove] === madamMove ? "player" : "madam-glitch";
  if (!reverseOutcome) {
    return normalOutcome;
  }

  return normalOutcome === "player" ? "madam-glitch" : "player";
}
