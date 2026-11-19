import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { chooseMadamMove } from "./game/ai.js";
import {
  createMatch,
  playPlayerMove,
  submitMove,
  useHack,
} from "./game/match.js";
import { MOVES } from "./game/rules.js";
import {
  createDatabase,
  getLeaderboard,
  getPlayerMoveHistory,
  saveMatch,
  savePlayerMove,
} from "./storage/database.js";

const MAX_PLAYER_NAME_LENGTH = 16;
const DEFAULT_MOVE_TIMEOUT_MS = 10_000;
const PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const ASSETS_DIRECTORY = fileURLToPath(new URL("../assets/", import.meta.url));

function randomMove(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(
      "random must return a number from 0 inclusive to 1 exclusive.",
    );
  }
  return MOVES[Math.floor(value * MOVES.length)];
}

function eventForRound(round) {
  if (round === 3) {
    return "glitch-mode";
  }
  if (round === 4) {
    return "double-stakes";
  }
  return null;
}

function feedbackForOutcome(outcome) {
  if (outcome === "player") {
    return { result: "win", led: "green", sound: "win" };
  }
  if (outcome === "madam-glitch") {
    return { result: "loss", led: "red", sound: "loss" };
  }
  return { result: "tie", led: "yellow", sound: "tie" };
}

export function createGameServer({
  database = createDatabase(),
  random = Math.random,
  moveTimeoutMs = DEFAULT_MOVE_TIMEOUT_MS,
} = {}) {
  const app = express();
  app.use(express.static(PUBLIC_DIRECTORY));
  app.use("/assets", express.static(ASSETS_DIRECTORY));
  app.get("/api/leaderboard", (_request, response) => {
    response.json(getLeaderboard(database));
  });
  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({ server: httpServer });
  let match = null;
  let phase = "attract";
  let priorHistory = [];
  let matchStartedAt = null;
  let deadline = null;
  let lastRound = null;
  let resultReady = false;
  let persistenceError = null;
  let roundTimer = null;

  function publicState() {
    return {
      phase,
      playerName: match?.playerName ?? "",
      currentRound: match?.currentRound ?? 0,
      roundsPlayed: match?.roundsPlayed ?? 0,
      status: match?.status ?? "idle",
      score: match?.score ?? { wins: 0, losses: 0, ties: 0, points: 0 },
      hackUsed: match?.hackUsed ?? false,
      event:
        phase === "awaiting-move" || phase === "intro"
          ? eventForRound(match.currentRound)
          : null,
      deadline,
      lastRound,
      resultReady,
      history: match?.history ?? [],
      persistenceError,
    };
  }

  function send(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function sendError(socket, message) {
    send(socket, { type: "error", message });
  }

  function broadcast(payload) {
    for (const client of webSocketServer.clients) {
      send(client, payload);
    }
  }

  function broadcastState() {
    broadcast({ type: "state", state: publicState() });
  }

  function clearTimer(timer) {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }

  function startRound() {
    if (!match || match.status !== "active") {
      return;
    }
    phase = "awaiting-move";
    deadline = Date.now() + moveTimeoutMs;
    roundTimer = setTimeout(() => {
      try {
        resolveMove({ type: "move", move: randomMove(random) }, true, null);
      } catch (error) {
        handleMoveFailure(error, null);
      }
    }, moveTimeoutMs);
    broadcastState();
  }

  function beginRoundIntro() {
    if (!match || match.status !== "active") {
      return;
    }
    deadline = null;
    resultReady = false;
    phase = "intro";
    broadcastState();
  }

  function startMatch(playerName) {
    const trimmedName = typeof playerName === "string" ? playerName.trim() : "";
    if (
      trimmedName.length === 0 ||
      trimmedName.length > MAX_PLAYER_NAME_LENGTH
    ) {
      throw new TypeError(
        `playerName must contain 1 to ${MAX_PLAYER_NAME_LENGTH} characters.`,
      );
    }

    clearTimer(roundTimer);
    const newMatch = createMatch(trimmedName);
    const newPriorHistory = getPlayerMoveHistory(database, newMatch.playerName);
    match = newMatch;
    priorHistory = newPriorHistory;
    matchStartedAt = Date.now();
    lastRound = null;
    resultReady = false;
    persistenceError = null;
    deadline = null;
    phase = "intro";
    broadcastState();
  }

  function resolveMove(action, timedOut, socket) {
    if (phase !== "awaiting-move" || !match) {
      if (socket) {
        sendError(socket, "The game is not currently accepting a move.");
      }
      return;
    }

    clearTimer(roundTimer);
    roundTimer = null;
    deadline = null;

    if (action.type === "hack") {
      match = useHack(match);
    } else {
      const nextMatch = playPlayerMove(match, action.move, {
        random,
        priorHistory,
      });
      savePlayerMove(database, nextMatch.playerName, action.move);
      match = nextMatch;
    }

    const playedRound = match.history.at(-1);
    lastRound = { ...playedRound, timedOut };
    resultReady = false;
    broadcast({ type: "feedback", ...feedbackForOutcome(lastRound.outcome) });

    if (match.status === "completed") {
      phase = "complete";
      try {
        saveMatch(database, match, (Date.now() - matchStartedAt) / 1000);
      } catch (error) {
        persistenceError =
          error instanceof Error ? error.message : "Could not save the match.";
        console.error("Failed to save completed match:", error);
      }
    } else {
      phase = "round-result";
    }
    broadcastState();
  }

  function handleMoveFailure(error, socket) {
    const message =
      error instanceof Error
        ? error.message
        : "The game could not process that action.";
    console.error("Failed to process game move:", error);
    if (socket) {
      sendError(socket, message);
    } else {
      broadcast({
        type: "error",
        message: "The automatic move failed. Choose a move to continue.",
      });
    }
    deadline = null;
    broadcastState();
  }

  webSocketServer.on("connection", (socket) => {
    send(socket, { type: "state", state: publicState() });
    socket.on("message", (rawMessage) => {
      let action;
      try {
        action = JSON.parse(rawMessage.toString());
      } catch {
        sendError(socket, "Message must be valid JSON.");
        return;
      }

      if (
        !action ||
        typeof action !== "object" ||
        Array.isArray(action) ||
        typeof action.type !== "string"
      ) {
        sendError(socket, "Message must be an object with a type.");
        return;
      }

      try {
        if (action.type === "start") {
          if (phase !== "attract" && phase !== "complete") {
            throw new Error("A match is already in progress.");
          }
          startMatch(action.playerName);
        } else if (action.type === "intro-complete") {
          if (phase !== "intro") {
            throw new Error("The round introduction is not active.");
          }
          startRound();
        } else if (action.type === "continue") {
          if (phase === "round-result" && resultReady) {
            beginRoundIntro();
          } else if (phase === "complete" && resultReady) {
            resultReady = false;
            broadcast({ type: "continue" });
          } else if (phase !== "round-result" && phase !== "complete") {
            throw new Error("The game is not waiting to continue.");
          }
        } else if (action.type === "result-ready") {
          if (phase !== "round-result" && phase !== "complete") {
            throw new Error("There is no round result to continue from.");
          }
          resultReady = true;
          broadcastState();
        } else if (action.type === "move") {
          if (!MOVES.includes(action.move)) {
            throw new TypeError(`move must be one of: ${MOVES.join(", ")}.`);
          }
          if (phase === "round-result") {
            if (resultReady) {
              beginRoundIntro();
            }
            return;
          }
          if (phase === "intro") {
            return;
          }
          if (phase === "complete") {
            if (resultReady) {
              resultReady = false;
              broadcast({ type: "continue" });
            }
            return;
          }
          resolveMove({ type: "move", move: action.move }, false, socket);
        } else if (action.type === "hack") {
          if (phase === "round-result") {
            if (resultReady) {
              beginRoundIntro();
            }
            return;
          }
          if (phase === "intro") {
            return;
          }
          if (phase === "complete") {
            if (resultReady) {
              resultReady = false;
              broadcast({ type: "continue" });
            }
            return;
          }
          resolveMove({ type: "hack" }, false, socket);
        } else {
          throw new TypeError(`Unknown message type: ${action.type}.`);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The game could not process that action.";
        console.error("Failed to process game message:", error);
        sendError(socket, message);
      }
    });
  });

  return {
    app,
    httpServer,
    webSocketServer,
    listen(port = 3000, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          resolve(httpServer.address());
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(port, host);
      });
    },
    async close() {
      clearTimer(roundTimer);
      for (const client of webSocketServer.clients) {
        client.terminate();
      }
      await new Promise((resolve, reject) => {
        webSocketServer.close((error) => (error ? reject(error) : resolve()));
      });
      if (httpServer.listening) {
        await new Promise((resolve, reject) => {
          httpServer.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  };
}

const isMainModule =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMainModule) {
  const database = createDatabase();
  const gameServer = createGameServer({ database });
  const port = Number(process.env.PORT ?? 3000);
  gameServer
    .listen(port, "0.0.0.0")
    .then(() => console.log(`Carnival Clash is available on port ${port}.`))
    .catch((error) => {
      console.error("Failed to start Carnival Clash:", error);
      database.close();
      process.exitCode = 1;
    });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      gameServer
        .close()
        .then(() => database.close())
        .catch((error) => {
          console.error("Failed to stop Carnival Clash cleanly:", error);
          process.exitCode = 1;
        });
    });
  }
}
