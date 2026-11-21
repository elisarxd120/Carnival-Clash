const ROUND_INTRO_TYPING_MS = 5_000;
const MOVE_TIMEOUT_MS = 10_000;
const INPUT_LOCK_MS = 300;
const RESULT_INPUT_LOCK_MS = 300;
const ROUND_MESSAGES = [
  "Welcome, challenger. I have never lost. Do not get your hopes up.",
  "Interesting. You are learning my patterns... or are you?",
  "Glitch Mode soon. The rules will not be on your side.",
  "You are doing well. That is exactly what I wanted.",
  "Final round. Make it count.",
];
const EVENT_MESSAGES = {
  "glitch-mode":
    "Glitch Mode is live. This round, the rules are mine to rewrite.",
  chaos: "Chaos round. Expect the unexpected, challenger.",
  "double-stakes":
    "Double stakes. Let's see if your nerve can match your score.",
  "double-damage": "Double damage. One mistake will cost you twice as much.",
};

const startPanel = document.querySelector("#start-panel");
const gamePanel = document.querySelector("#game-panel");
const startForm = document.querySelector("#start-form");
const playerNameInput = document.querySelector("#player-name");
const connectionStatus = document.querySelector("#connection-status");
const phaseTitle = document.querySelector("#phase-title");
const roundNumber = document.querySelector("#round-number");
const eventBadge = document.querySelector("#event-badge");
const gameMessage = document.querySelector("#game-message");
const roundResult = document.querySelector("#round-result");
const persistenceError = document.querySelector("#persistence-error");
const timer = document.querySelector("#timer");
const timerBar = document.querySelector("#timer-bar");
const moveButtons = [...document.querySelectorAll("[data-move]")];
const hackButton = document.querySelector("#hack-button");
const playAgainButton = document.querySelector("#play-again");
const leaderboardLists = [...document.querySelectorAll(".leaderboard-list")];
const madamFace = document.querySelector("#madam-face");
const madamFaceImage = document.querySelector("#madam-face-image");
const madamPick = document.querySelector("#madam-pick");
const pickComparison = document.querySelector("#pick-comparison");
const resultDialog = document.querySelector("#result-dialog");
const resultIcon = document.querySelector("#result-icon");
const resultEyebrow = document.querySelector("#result-eyebrow");
const resultPicks = document.querySelector("#result-picks");
const resultPlayerPick = document.querySelector("#result-player-pick");
const resultMadamPick = document.querySelector("#result-madam-pick");
const resultTitle = document.querySelector("#result-title");
const resultMessage = document.querySelector("#result-message");
const resultPoints = document.querySelector("#result-points");
const finalSummary = document.querySelector("#final-summary");
const continueButton = document.querySelector("#continue-button");
const dialogPlayAgain = document.querySelector("#dialog-play-again");
let socket;
let currentState;
let roundPhase = "NEXT_ROUND";
let activeRound = 0;
let handledRound = 0;
let selectedMove = null;
let pendingLocalPick = false;
let revealTimer = null;
let typingTimer = null;
let popupReadyTimer = null;
let inputLockedUntil = 0;

const moveNames = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
  hack: "Hack Chip",
};

const moveIcons = {
  rock: "✊",
  paper: "✋",
  scissors: "✌",
  hack: "⚡",
};

const eventNames = {
  "glitch-mode": "Glitch Mode: wins reversed",
  "double-stakes": "Double Stakes",
};

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);

  socket.addEventListener("open", () => {
    connectionStatus.textContent = "Booth connected";
    connectionStatus.classList.add("connected");
  });

  socket.addEventListener("close", () => {
    connectionStatus.textContent = "Connection lost — reconnecting...";
    connectionStatus.classList.remove("connected");
    setTimeout(connect, 1500);
  });

  socket.addEventListener("error", () => {
    connectionStatus.textContent = "Could not connect to the booth";
    connectionStatus.classList.remove("connected");
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      gameMessage.textContent =
        "Received an invalid message from the game server.";
      return;
    }

    if (message.type === "state") {
      const previousState = currentState;
      currentState = message.state;
      renderState(currentState, previousState);
    } else if (message.type === "continue") {
      if (
        currentState?.phase === "complete" &&
        roundPhase === "WAIT_FOR_CLICK"
      ) {
        showFinalPopup(currentState);
      }
    } else if (message.type === "error") {
      gameMessage.textContent = message.message;
      if (
        currentState?.phase === "awaiting-move" &&
        roundPhase === "PICK_LOCKED"
      ) {
        roundPhase = "WAITING_FOR_PICK";
        selectedMove = null;
        pendingLocalPick = false;
        updatePickControls(currentState);
      }
    } else if (message.type === "feedback") {
      gameMessage.textContent =
        message.result === "win"
          ? "Round won!"
          : message.result === "loss"
            ? "Madam Glitch wins this round."
            : "It's a tie!";
      playOutcomeSound(message.result);
    } else if (message.type === "leaderboard-updated") {
      refreshLeaderboard();
    }
  });
}

function sendAction(action) {
  if (socket?.readyState !== WebSocket.OPEN) {
    gameMessage.textContent = "The booth is reconnecting. Please try again.";
    return false;
  }
  socket.send(JSON.stringify(action));
  return true;
}

function setEvent(event) {
  if (!event) {
    eventBadge.hidden = true;
    eventBadge.textContent = "";
    return;
  }
  eventBadge.textContent = eventNames[event] ?? event;
  eventBadge.hidden = false;
}

function playPickSound() {
  // Add a short pick sound here when audio is ready.
}

function playWinSound() {
  // Add a win sound here when audio is ready.
}

function playTieSound() {
  // Add a tie sound here when audio is ready.
}

function playLoseSound() {
  // Add a lose sound here when audio is ready.
}

function playOutcomeSound(result) {
  if (result === "win") {
    playWinSound();
  } else if (result === "tie") {
    playTieSound();
  } else if (result === "loss") {
    playLoseSound();
  }
}

function setFaceState(state) {
  madamFace.dataset.faceState = state;
}

function closeResultDialog() {
  clearTimeout(popupReadyTimer);
  if (resultDialog.open) {
    resultDialog.close();
  }
}

function updatePickControls(state) {
  const canPick =
    state?.phase === "awaiting-move" &&
    roundPhase === "WAITING_FOR_PICK" &&
    Date.now() >= inputLockedUntil;
  moveButtons.forEach((button) => {
    const selected = button.dataset.move === selectedMove;
    button.disabled = !canPick;
    button.classList.toggle("is-selected", selected);
    button.classList.toggle(
      "is-unselected",
      Boolean(selectedMove) && !selected,
    );
    button.setAttribute("aria-pressed", String(selected));
  });
  hackButton.disabled = !canPick || state.hackUsed || !state.hackEnabled;
  hackButton.classList.toggle("is-selected", selectedMove === "hack");
}

function renderLastRound(round) {
  roundResult.textContent = "";
  if (!round) {
    return;
  }

  const outcome =
    round.outcome === "player"
      ? "You win this round!"
      : round.outcome === "madam-glitch"
        ? "Madam Glitch wins this round."
        : "It's a tie!";
  const details = round.hacked
    ? "Hack Chip activated: automatic round win."
    : `You played ${moveNames[round.playerMove]}; Madam Glitch played ${moveNames[round.madamMove]}.`;
  const notes = [];
  if (round.event === "glitch-mode") {
    notes.push("Glitch Mode reversed the normal result.");
  }
  if (round.event === "double-stakes") {
    notes.push("Double Stakes!");
  }
  if (round.timedOut) {
    notes.push("Time ran out; your move was selected randomly.");
  }
  notes.push(`${round.pointsAwarded} points.`);
  roundResult.textContent = [details, outcome, ...notes].join(" ");
}

function roundMessage(state) {
  return (
    EVENT_MESSAGES[state.event] ??
    ROUND_MESSAGES[state.currentRound - 1] ??
    "Another round. Show me what you have learned."
  );
}

function startRoundTyping(state) {
  clearTimeout(typingTimer);
  roundPhase = "ROUND_INTRO_TYPING";
  activeRound = state.currentRound;
  selectedMove = null;
  pendingLocalPick = false;
  madamPick.textContent = "?";
  madamPick.classList.remove("is-revealing");
  pickComparison.hidden = true;
  setFaceState("thinking");
  updatePickControls(state);

  const message = roundMessage(state);
  const characterDelay = ROUND_INTRO_TYPING_MS / message.length;
  const startedAt = performance.now();
  gameMessage.textContent = "";
  gameMessage.classList.add("is-typing");

  function typeNextCharacters() {
    const elapsed = performance.now() - startedAt;
    const visibleCharacters = Math.min(
      message.length,
      Math.floor(elapsed / characterDelay),
    );
    gameMessage.textContent = message.slice(0, visibleCharacters);

    if (elapsed >= ROUND_INTRO_TYPING_MS) {
      gameMessage.textContent = message;
      gameMessage.classList.remove("is-typing");
      if (
        currentState?.phase === "intro" &&
        currentState.currentRound === state.currentRound
      ) {
        sendAction({ type: "intro-complete" });
      }
      return;
    }

    typingTimer = setTimeout(
      typeNextCharacters,
      Math.min(characterDelay, ROUND_INTRO_TYPING_MS - elapsed),
    );
  }

  typeNextCharacters();
}

function showRoundPopup(round, isFinalRound) {
  const result =
    round.outcome === "player"
      ? { key: "win", title: "You win this round!", icon: "✦", face: "lose" }
      : round.outcome === "madam-glitch"
        ? {
            key: "loss",
            title: "Madam Glitch wins this round!",
            icon: "✹",
            face: "win",
          }
        : { key: "tie", title: "It's a tie!", icon: "✧", face: "tie" };

  roundPhase = "RESULT_POPUP";
  continueButton.hidden = true;
  continueButton.disabled = true;
  continueButton.textContent = isFinalRound
    ? "Press any button to view final results"
    : "Press any button to continue";
  resultDialog.dataset.result = result.key;
  resultIcon.textContent = result.icon;
  resultEyebrow.textContent = `Round ${round.round} result`;
  resultPicks.hidden = false;
  resultPlayerPick.textContent = round.hacked
    ? moveNames.hack
    : moveNames[round.playerMove] ?? "No move";
  resultMadamPick.textContent = moveNames[round.madamMove] ?? "No move";
  resultTitle.textContent = result.title;
  resultMessage.textContent = round.timedOut
    ? "Time ran out; your move was selected randomly."
    : round.event === "glitch-mode"
      ? "Glitch Mode reversed the normal result."
      : round.event === "double-stakes"
        ? "Double Stakes applied to this round."
        : "The carnival crowd is watching!";
  resultPoints.textContent =
    round.outcome === "player"
      ? `+${round.pointsAwarded} points`
      : `${round.pointsAwarded} points`;
  finalSummary.hidden = true;
  dialogPlayAgain.hidden = true;
  setFaceState(result.face);
  if (!resultDialog.open) {
    resultDialog.showModal();
  }
  clearTimeout(popupReadyTimer);
  popupReadyTimer = setTimeout(() => {
    if (roundPhase !== "RESULT_POPUP") {
      return;
    }
    roundPhase = "WAIT_FOR_CLICK";
    continueButton.disabled = false;
    continueButton.hidden = false;
    sendAction({ type: "result-ready" });
  }, RESULT_INPUT_LOCK_MS);
}

function showFinalPopup(state) {
  clearTimeout(popupReadyTimer);
  roundPhase = "MATCH_COMPLETE";
  continueButton.hidden = true;
  continueButton.disabled = true;
  resultDialog.dataset.result = "complete";
  resultIcon.textContent = "★";
  resultEyebrow.textContent = "Hall of Fame";
  resultPicks.hidden = true;
  resultTitle.textContent = "Match complete";
  resultMessage.textContent = `${state.playerName}, your final score is ${state.score.points} points.`;
  resultPoints.textContent = "";
  document.querySelector("#final-points").textContent = state.score.points;
  document.querySelector("#final-wins").textContent = state.score.wins;
  document.querySelector("#final-ties").textContent = state.score.ties;
  document.querySelector("#final-losses").textContent = state.score.losses;
  finalSummary.hidden = false;
  dialogPlayAgain.hidden = false;
  if (!resultDialog.open) {
    resultDialog.showModal();
  }
}

function revealResolvedRound(state) {
  const round = state.lastRound;
  if (!round || state.roundsPlayed <= handledRound) {
    return;
  }

  handledRound = state.roundsPlayed;
  selectedMove = round.playerMove;
  if (!pendingLocalPick) {
    playPickSound();
  }
  pendingLocalPick = false;
  roundPhase = "PICK_LOCKED";
  updatePickControls(state);

  madamPick.classList.remove("is-revealing");
  madamPick.textContent = "?";
  pickComparison.hidden = true;
  setFaceState("reveal");
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    roundPhase = "REVEAL";
    madamPick.textContent = round.madamMove
      ? `${moveIcons[round.madamMove]} ${moveNames[round.madamMove]}`
      : "No move";
    madamPick.classList.remove("is-revealing");
    void madamPick.offsetWidth;
    madamPick.classList.add("is-revealing");
    const playerPick = round.hacked ? "Hack Chip" : moveNames[round.playerMove];
    const opponentPick = round.madamMove
      ? moveNames[round.madamMove]
      : "no move";
    pickComparison.textContent = `You: ${playerPick} vs Madam Glitch: ${opponentPick}`;
    pickComparison.hidden = false;

    revealTimer = setTimeout(() => {
      setFaceState(
        round.outcome === "player"
          ? "lose"
          : round.outcome === "madam-glitch"
            ? "win"
            : "tie",
      );
      showRoundPopup(round, state.phase === "complete");
    }, 500);
  }, 0);
}

function renderState(state, previousState) {
  const canStart = state.phase === "attract";
  startPanel.hidden = !canStart;
  gamePanel.hidden = canStart;
  gamePanel.dataset.event = state.event ?? state.lastRound?.event ?? "";
  playAgainButton.hidden = state.phase !== "complete";
  document.querySelector("#player-label").textContent =
    state.playerName || "Player";
  document.querySelector("#start-description").textContent =
    `You have ${state.totalRounds ?? 5} rounds and ${state.hackEnabled ? "one Hack Chip" : "no Hack Chip"}. Make your moves count and earn a place on the Hall of Fame.`;
  phaseTitle.textContent =
    state.phase === "complete"
      ? "Match complete"
      : state.phase === "intro"
        ? "Madam's challenge"
        : state.phase === "round-result"
          ? "Round result"
          : state.phase === "awaiting-move"
            ? "Your move!"
            : "Welcome to the booth";
  const displayedRound =
    state.phase === "round-result" ? state.roundsPlayed : state.currentRound;
  roundNumber.textContent = displayedRound > 0 ? String(displayedRound) : "-";
  roundNumber.nextElementSibling.textContent = `round of ${state.totalRounds ?? 5}`;
  setEvent(state.event ?? state.lastRound?.event);
  document.querySelector("#points").textContent = state.score.points;
  document.querySelector("#wins").textContent = state.score.wins;
  document.querySelector("#ties").textContent = state.score.ties;
  document.querySelector("#losses").textContent = state.score.losses;
  timer.hidden = state.phase !== "awaiting-move";
  document.querySelector(".timer-wrap").hidden =
    state.phase !== "awaiting-move";
  persistenceError.hidden = !state.persistenceError;
  persistenceError.textContent = state.persistenceError
    ? `Your match played, but could not be saved: ${state.persistenceError}`
    : "";
  renderLastRound(state.lastRound);

  if (
    state.phase === "intro" &&
    state.roundsPlayed === 0 &&
    previousState?.phase !== "intro"
  ) {
    clearTimeout(revealTimer);
    closeResultDialog();
    activeRound = 0;
    handledRound = 0;
    selectedMove = null;
    pendingLocalPick = false;
    roundPhase = "ROUND_INTRO_TYPING";
    madamPick.textContent = "?";
    pickComparison.hidden = true;
  }

  if (state.phase === "intro") {
    if (activeRound !== state.currentRound) {
      closeResultDialog();
      if (state.roundsPlayed > 0) {
        inputLockedUntil = Date.now() + INPUT_LOCK_MS;
      }
      startRoundTyping(state);
    }
    setFaceState("thinking");
  }

  if (state.phase === "awaiting-move" && roundPhase === "ROUND_INTRO_TYPING") {
    roundPhase = "WAITING_FOR_PICK";
    setFaceState("thinking");
  }

  if (
    (state.phase === "round-result" || state.phase === "complete") &&
    state.lastRound
  ) {
    revealResolvedRound(state);
  }
  updatePickControls(state);

  if (state.phase === "complete") {
    refreshLeaderboard();
  } else if (canStart) {
    gameMessage.textContent = "Enter your nickname to challenge Madam Glitch.";
  }
}

function updateTimer() {
  if (
    !currentState ||
    currentState.phase !== "awaiting-move" ||
    !currentState.deadline
  ) {
    timer.textContent = String((currentState?.moveTimeoutMs ?? MOVE_TIMEOUT_MS) / 1000);
    timerBar.style.transform = "scaleX(1)";
    return;
  }

  const remainingMs = Math.max(0, currentState.deadline - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const timeoutMs = currentState.moveTimeoutMs ?? MOVE_TIMEOUT_MS;
  timer.textContent = String(remainingSeconds);
  timerBar.style.transform = `scaleX(${remainingMs / timeoutMs})`;
}

async function refreshLeaderboard() {
  try {
    const response = await fetch("/api/leaderboard");
    if (!response.ok) {
      throw new Error(`Leaderboard request failed (${response.status}).`);
    }
    const rows = await response.json();
    leaderboardLists.forEach((list) => {
      list.replaceChildren();
      if (rows.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty-leaderboard";
        empty.textContent = "No matches yet. Be the first!";
        list.append(empty);
        return;
      }
      for (const row of rows) {
        const item = document.createElement("li");
        const name = document.createElement("strong");
        const score = document.createElement("span");
        name.textContent = row.playerName;
        score.textContent = `${row.points} pts`;
        item.append(name, score);
        list.append(item);
      }
    });
  } catch (error) {
    leaderboardLists.forEach((list) => {
      const item = document.createElement("li");
      item.className = "empty-leaderboard";
      item.textContent =
        error instanceof Error ? error.message : "Could not load leaderboard.";
      list.replaceChildren(item);
    });
  }
}

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendAction({ type: "start", playerName: playerNameInput.value });
});

function lockPick(move) {
  if (
    currentState?.phase !== "awaiting-move" ||
    roundPhase !== "WAITING_FOR_PICK" ||
    Date.now() < inputLockedUntil
  ) {
    return;
  }

  selectedMove = move;
  roundPhase = "PICK_LOCKED";
  pendingLocalPick = true;
  playPickSound();
  updatePickControls(currentState);
  const action = move === "hack" ? { type: "hack" } : { type: "move", move };
  if (!sendAction(action)) {
    selectedMove = null;
    roundPhase = "WAITING_FOR_PICK";
    pendingLocalPick = false;
    updatePickControls(currentState);
  }
}

function continueAfterResult() {
  if (
    roundPhase !== "WAIT_FOR_CLICK" ||
    Date.now() < inputLockedUntil ||
    !currentState
  ) {
    return;
  }

  inputLockedUntil = Date.now() + INPUT_LOCK_MS;
  continueButton.disabled = true;
  continueButton.hidden = true;

  if (currentState.phase === "complete") {
    sendAction({ type: "continue" });
    showFinalPopup(currentState);
    return;
  }

  roundPhase = "NEXT_ROUND";
  closeResultDialog();
  sendAction({ type: "continue" });
}

function handleMoveButton(move) {
  if (roundPhase === "WAIT_FOR_CLICK") {
    continueAfterResult();
    return;
  }
  lockPick(move);
}

moveButtons.forEach((button) => {
  button.addEventListener("click", () => {
    handleMoveButton(button.dataset.move);
  });
});

hackButton.addEventListener("click", () => handleMoveButton("hack"));
continueButton.addEventListener("click", continueAfterResult);
resultDialog.addEventListener("cancel", (event) => event.preventDefault());

function returnToStart() {
  closeResultDialog();
  startPanel.hidden = false;
  gamePanel.hidden = true;
  playerNameInput.value = currentState?.playerName ?? "";
  playerNameInput.focus();
}

playAgainButton.addEventListener("click", returnToStart);
dialogPlayAgain.addEventListener("click", returnToStart);
madamFaceImage.addEventListener("error", () => {
  madamFace.classList.add("image-unavailable");
});

setInterval(updateTimer, 100);
connect();
refreshLeaderboard();
