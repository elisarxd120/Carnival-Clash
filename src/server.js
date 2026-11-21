import { createServer } from "node:http";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
  addSystemLog,
  deleteMatch,
  getAdminLeaderboard,
  getAdminOverview,
  getAllGames,
  getGameAnalytics,
  getGameHistory,
  getHighestScoreToday,
  getGameSettings,
  getMatchDetails,
  getLeaderboard,
  getPlayerMoveHistory,
  getSystemLogs,
  resetLeaderboard,
  saveMatch,
  saveGameSettings,
  savePlayerMove,
  updateMatch,
} from "./storage/database.js";

const MAX_PLAYER_NAME_LENGTH = 16;
const DEFAULT_MOVE_TIMEOUT_MS = 10_000;
const PUBLIC_DIRECTORY = fileURLToPath(new URL("../public/", import.meta.url));
const ASSETS_DIRECTORY = fileURLToPath(new URL("../assets/", import.meta.url));
const ADMIN_PAGE = fileURLToPath(
  new URL("../public/admin.html", import.meta.url),
);
const ADMIN_COOKIE = "carnival_admin";
const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const CSV_COLUMNS = [
  "id",
  "playerName",
  "points",
  "wins",
  "losses",
  "ties",
  "hacksUsed",
  "durationSec",
  "playedAt",
];

function loadLocalEnvironment() {
  const filename = fileURLToPath(new URL("../.env", import.meta.url));
  let contents;
  try {
    contents = readFileSync(filename, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(filename);
    return;
  }
  for (const line of contents.split(/\r?\n/)) {
    const entry =
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!entry || Object.hasOwn(process.env, entry[1])) {
      continue;
    }
    const value = entry[2].replace(/^(["'])(.*)\1$/, "$2");
    process.env[entry[1]] = value;
  }
}

function randomMove(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(
      "random must return a number from 0 inclusive to 1 exclusive.",
    );
  }
  return MOVES[Math.floor(value * MOVES.length)];
}

function eventForRound(round, currentMatch) {
  return currentMatch?.roundEvents?.[round - 1] ?? null;
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

function hashAdminPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    return undefined;
  }
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function createGameServer({
  database = createDatabase(),
  random = Math.random,
  moveTimeoutMs = DEFAULT_MOVE_TIMEOUT_MS,
  adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ??
    hashAdminPassword(process.env.ADMIN_PASSWORD),
  adminSessionTtlMs = ADMIN_SESSION_TTL_MS,
} = {}) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use(express.static(PUBLIC_DIRECTORY));
  app.use("/assets", express.static(ASSETS_DIRECTORY));
  const startedAt = Date.now();
  const settings = getGameSettings(database);
  let activeSettings = settings;
  let activeMoveTimeoutMs =
    moveTimeoutMs === DEFAULT_MOVE_TIMEOUT_MS
      ? activeSettings.moveTimerSec * 1000
      : moveTimeoutMs;
  let match = null;
  let phase = "attract";
  let priorHistory = [];
  let matchStartedAt = null;
  let deadline = null;
  let lastRound = null;
  let resultReady = false;
  let persistenceError = null;
  let maintenanceMode = settings.maintenanceMode;
  let roundTimer = null;
  const adminSessions = new Map();
  const loginFailures = new Map();
  const deviceSockets = new Set();
  let lastDeviceConnection = null;
  let lastButtonPress = null;
  let lastButton = null;
  let deviceReconnects = 0;
  const systemLog = (level, message) => {
    addSystemLog(database, level, message);
  };
  const adminSession = (request, response) => {
    const cookie = request.headers.cookie ?? "";
    const token = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
      ?.slice(ADMIN_COOKIE.length + 1);
    const session = token ? adminSessions.get(token) : null;
    if (!session || session.expiresAt < Date.now()) {
      if (token) {
        adminSessions.delete(token);
      }
      return null;
    }
    session.expiresAt = Date.now() + adminSessionTtlMs;
    const secureCookie = request.secure ? "; Secure" : "";
    response.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(adminSessionTtlMs / 1000)}${secureCookie}`,
    );
    return session;
  };
  const requireAdmin = (request, response, next) => {
    if (!adminSession(request, response)) {
      response.status(401).json({ error: "Admin login required." });
      return;
    }
    next();
  };
  const sendAdminCsv = (response, rows, columns, filename) => {
    const escapeCell = (value) => {
      const text = value == null ? "" : String(value);
      const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => escapeCell(row[column])).join(","),
      ),
    ].join("\r\n");
    response.type("text/csv").attachment(filename).send(`\uFEFF${csv}`);
  };

  app.get("/admin", (_request, response) => {
    response.sendFile(ADMIN_PAGE);
  });
  app.post("/api/admin/login", (request, response) => {
    if (!adminPasswordHash) {
      response.status(503).json({
        error:
          "Admin login is not configured. Set ADMIN_PASSWORD_HASH to enable it.",
      });
      return;
    }
    const [salt, expectedHash] = adminPasswordHash.split(":");
    if (
      !/^[0-9a-f]{32}$/i.test(salt ?? "") ||
      !/^[0-9a-f]{128}$/i.test(expectedHash ?? "")
    ) {
      response.status(503).json({ error: "ADMIN_PASSWORD_HASH is invalid." });
      return;
    }
    const clientAddress = request.socket.remoteAddress ?? "unknown";
    const attempt = loginFailures.get(clientAddress);
    if (attempt?.blockedUntil > Date.now()) {
      response
        .status(429)
        .json({ error: "Too many failed sign-in attempts. Try again later." });
      return;
    }
    const password = request.body?.password;
    if (typeof password !== "string" || password.length > 1024) {
      response.status(400).json({ error: "Enter a valid password." });
      return;
    }
    const actualHash = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");
    if (!timingSafeEqual(actualHash, expected)) {
      const currentAttempt =
        attempt && attempt.windowEndsAt > Date.now()
          ? attempt
          : {
              failures: 0,
              windowEndsAt: Date.now() + LOGIN_WINDOW_MS,
              blockedUntil: 0,
            };
      currentAttempt.failures += 1;
      if (currentAttempt.failures >= MAX_LOGIN_FAILURES) {
        currentAttempt.blockedUntil = Date.now() + LOGIN_WINDOW_MS;
      }
      loginFailures.set(clientAddress, currentAttempt);
      systemLog("warn", "Rejected admin login attempt");
      response.status(401).json({ error: "Incorrect password." });
      return;
    }
    const token = randomBytes(32).toString("hex");
    loginFailures.delete(clientAddress);
    adminSessions.set(token, { expiresAt: Date.now() + adminSessionTtlMs });
    const secureCookie = request.secure ? "; Secure" : "";
    response.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(adminSessionTtlMs / 1000)}${secureCookie}`,
    );
    systemLog("info", "Admin logged in");
    response.json({ ok: true });
  });
  app.post("/api/admin/logout", requireAdmin, (request, response) => {
    const token = request.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ADMIN_COOKIE}=`))
      ?.slice(ADMIN_COOKIE.length + 1);
    if (token) {
      adminSessions.delete(token);
    }
    response.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    );
    systemLog("info", "Admin logged out");
    response.json({ ok: true });
  });
  app.get("/api/admin/session", (request, response) => {
    response.json({ authenticated: Boolean(adminSession(request, response)) });
  });
  app.get("/api/admin/overview", requireAdmin, (_request, response) => {
    const overview = getAdminOverview(database);
    response.json({
      ...overview,
      highestScoreToday: getHighestScoreToday(database),
      playerWinRatePercent: Math.round(overview.playerWinRate * 100),
      live: {
        status: match?.status === "active" ? "playing" : "idle",
        playerName: match?.playerName ?? "",
        round: match?.currentRound ?? 0,
        totalRounds: match?.roundLimit ?? activeSettings.rounds,
        moveTimeoutMs: activeMoveTimeoutMs,
        score: match?.score.points ?? 0,
        mode:
          phase === "awaiting-move" || phase === "intro"
            ? eventForRound(match?.currentRound, match)
            : null,
        lastRound,
        hackUsed: match?.hackUsed ?? false,
        hackEnabled: match?.hackEnabled ?? activeSettings.hackEnabled,
      },
      device: {
        status: deviceSockets.size > 0 ? "online" : "offline",
        lastButtonPress,
        lastButton,
        lastConnected: lastDeviceConnection,
        reconnects: deviceReconnects,
      },
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      maintenanceMode,
      settings: activeSettings,
    });
  });
  app.get("/api/admin/leaderboard", requireAdmin, (request, response) => {
    try {
      response.json(
        getAdminLeaderboard(database, {
          search:
            typeof request.query.search === "string"
              ? request.query.search.slice(0, 100)
              : "",
          period: request.query.period === "today" ? "today" : "all",
        }),
      );
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });
  app.post(
    "/api/admin/leaderboard/reset",
    requireAdmin,
    (request, response) => {
      if (request.body?.confirm !== true) {
        response.status(400).json({ error: "Confirm the leaderboard reset." });
        return;
      }
      resetLeaderboard(database);
      systemLog("warn", "Leaderboard and player move history reset");
      broadcast({ type: "leaderboard-updated" });
      response.json({ ok: true });
    },
  );
  app.patch("/api/admin/matches/:id", requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    const changes = {};
    if (typeof request.body?.hidden === "boolean") {
      changes.hidden = request.body.hidden;
    }
    if (typeof request.body?.flagged === "boolean") {
      changes.flagged = request.body.flagged;
    }
    if (typeof request.body?.displayName === "string") {
      const name = request.body.displayName.trim();
      if (name.length < 1 || name.length > MAX_PLAYER_NAME_LENGTH) {
        response.status(400).json({
          error: `Nickname must contain 1 to ${MAX_PLAYER_NAME_LENGTH} characters.`,
        });
        return;
      }
      changes.displayName = name;
    }
    if (!Number.isInteger(id) || id < 1) {
      response.status(400).json({ error: "Invalid match id." });
      return;
    }
    try {
      if (!updateMatch(database, id, changes)) {
        response.status(404).json({ error: "Match not found." });
        return;
      }
      systemLog("info", `Updated leaderboard entry ${id}`);
      broadcast({ type: "leaderboard-updated" });
      response.json({ ok: true });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });
  app.delete("/api/admin/matches/:id", requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) {
      response.status(400).json({ error: "Invalid match id." });
      return;
    }
    if (!deleteMatch(database, id)) {
      response.status(404).json({ error: "Match not found." });
      return;
    }
    systemLog("warn", `Deleted match ${id}`);
    broadcast({ type: "leaderboard-updated" });
    response.json({ ok: true });
  });
  app.get("/api/admin/history", requireAdmin, (request, response) => {
    try {
      response.json(
        getGameHistory(database, {
          search:
            typeof request.query.search === "string"
              ? request.query.search.slice(0, 100)
              : "",
          page: Number(request.query.page ?? 1),
          pageSize: Number(request.query.pageSize ?? 20),
          sort:
            typeof request.query.sort === "string"
              ? request.query.sort
              : "created_at",
          direction: request.query.direction === "asc" ? "asc" : "desc",
        }),
      );
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });
  app.get("/api/admin/history/:id", requireAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) {
      response.status(400).json({ error: "Invalid match id." });
      return;
    }
    response.json(getMatchDetails(database, id));
  });
  app.get("/api/admin/analytics", requireAdmin, (_request, response) => {
    response.json(getGameAnalytics(database));
  });
  app.get("/api/admin/logs", requireAdmin, (_request, response) => {
    response.json(getSystemLogs(database));
  });
  app.post("/api/admin/maintenance", requireAdmin, (request, response) => {
    if (typeof request.body?.paused !== "boolean") {
      response.status(400).json({ error: "paused must be a boolean." });
      return;
    }
    maintenanceMode = request.body.paused;
    activeSettings = { ...activeSettings, maintenanceMode };
    saveGameSettings(database, activeSettings);
    systemLog(
      maintenanceMode ? "warn" : "info",
      maintenanceMode ? "Game paused for maintenance" : "Game resumed",
    );
    broadcastState();
    response.json({ paused: maintenanceMode });
  });
  app.get("/api/admin/settings", requireAdmin, (_request, response) => {
    response.json(activeSettings);
  });
  app.put("/api/admin/settings", requireAdmin, (request, response) => {
    const allowedKeys = new Set([
      "predictionPct",
      "moveTimerSec",
      "rounds",
      "glitchMode",
      "randomEvents",
      "hackEnabled",
      "eventFrequencyPct",
      "maintenanceMode",
    ]);
    const updates = request.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      response.status(400).json({ error: "Settings must be an object." });
      return;
    }
    if (Object.keys(updates).some((key) => !allowedKeys.has(key))) {
      response.status(400).json({ error: "Unknown game setting." });
      return;
    }
    const next = { ...activeSettings, ...updates };
    const numericRanges = {
      predictionPct: [0, 100],
      eventFrequencyPct: [0, 100],
      moveTimerSec: [3, 60],
      rounds: [1, 5],
    };
    for (const [key, [min, max]] of Object.entries(numericRanges)) {
      if (
        key in updates &&
        (!Number.isInteger(updates[key]) ||
          updates[key] < min ||
          updates[key] > max)
      ) {
        response
          .status(400)
          .json({ error: `${key} must be an integer from ${min} to ${max}.` });
        return;
      }
    }
    for (const key of [
      "glitchMode",
      "randomEvents",
      "hackEnabled",
      "maintenanceMode",
    ]) {
      if (key in updates && typeof updates[key] !== "boolean") {
        response.status(400).json({ error: `${key} must be a boolean.` });
        return;
      }
    }
    activeSettings = next;
    maintenanceMode = next.maintenanceMode;
    if (phase !== "awaiting-move") {
      activeMoveTimeoutMs = next.moveTimerSec * 1000;
    }
    saveGameSettings(database, activeSettings);
    systemLog("info", "Game settings updated");
    broadcastState();
    response.json(activeSettings);
  });
  app.get("/api/admin/export.csv", requireAdmin, (_request, response) => {
    sendAdminCsv(
      response,
      getAllGames(database),
      CSV_COLUMNS,
      "carnival-clash-games.csv",
    );
  });
  app.post(
    "/api/admin/backup",
    requireAdmin,
    async (_request, response, next) => {
      try {
        const folder = path.resolve("data");
        await mkdir(folder, { recursive: true });
        const backupPath = path.join(
          folder,
          `carnival-clash-backup-${Date.now()}.sqlite`,
        );
        await database.backup(backupPath);
        systemLog("info", "Database backup created");
        response.json({ ok: true, filename: path.basename(backupPath) });
      } catch (error) {
        next(error);
      }
    },
  );
  app.post("/api/admin/test-effect", requireAdmin, (request, response) => {
    const effects = {
      win: { result: "win", led: "green", sound: "win" },
      lose: { result: "loss", led: "red", sound: "loss" },
      glitch: { result: "glitch", led: "purple", sound: "glitch" },
      chaos: { result: "chaos", led: "rainbow", sound: "chaos" },
    };
    const effect = effects[request.body?.effect];
    if (!effect) {
      response
        .status(400)
        .json({ error: "Choose win, lose, glitch, or chaos." });
      return;
    }
    broadcast({ type: "feedback", ...effect });
    systemLog("info", `Sent ${request.body.effect} test effect`);
    response.json({ ok: true });
  });
  app.get("/api/leaderboard", (_request, response) => {
    response.json(getLeaderboard(database));
  });
  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  const httpServer = createServer(app);
  const webSocketServer = new WebSocketServer({ server: httpServer });

  function publicState() {
    return {
      phase,
      playerName: match?.playerName ?? "",
      currentRound: match?.currentRound ?? 0,
      totalRounds: match?.roundLimit ?? activeSettings.rounds,
      moveTimeoutMs: activeMoveTimeoutMs,
      roundsPlayed: match?.roundsPlayed ?? 0,
      status: match?.status ?? "idle",
      score: match?.score ?? { wins: 0, losses: 0, ties: 0, points: 0 },
      hackUsed: match?.hackUsed ?? false,
      hackEnabled: match?.hackEnabled ?? activeSettings.hackEnabled,
      event:
        phase === "awaiting-move" || phase === "intro"
          ? eventForRound(match.currentRound, match)
          : null,
      deadline,
      lastRound,
      resultReady,
      maintenanceMode,
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
    deadline = Date.now() + activeMoveTimeoutMs;
    roundTimer = setTimeout(() => {
      try {
        resolveMove({ type: "move", move: randomMove(random) }, true, null);
      } catch (error) {
        handleMoveFailure(error, null);
      }
    }, activeMoveTimeoutMs);
    broadcastState();
  }

  function beginRoundIntro() {
    if (!match || match.status !== "active") {
      return;
    }
    activeMoveTimeoutMs = activeSettings.moveTimerSec * 1000;
    deadline = null;
    resultReady = false;
    phase = "intro";
    broadcastState();
  }

  function startMatch(playerName) {
    if (maintenanceMode) {
      throw new Error("The game is paused for maintenance.");
    }
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
    const newMatch = createMatch(trimmedName, {
      ...activeSettings,
      random,
    });
    const newPriorHistory = getPlayerMoveHistory(database, newMatch.playerName);
    match = newMatch;
    priorHistory = newPriorHistory;
    matchStartedAt = Date.now();
    lastRound = null;
    resultReady = false;
    persistenceError = null;
    deadline = null;
    phase = "intro";
    systemLog("info", `Game started: ${trimmedName}`);
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

    const lastHistoryIndex = match.history.length - 1;
    match = {
      ...match,
      history: match.history.map((round, index) =>
        index === lastHistoryIndex ? { ...round, timedOut } : round,
      ),
    };
    lastRound = { ...match.history.at(-1), timedOut };
    resultReady = false;
    broadcast({ type: "feedback", ...feedbackForOutcome(lastRound.outcome) });

    if (match.status === "completed") {
      phase = "complete";
      try {
        saveMatch(database, match, (Date.now() - matchStartedAt) / 1000);
        systemLog(
          "info",
          `Score saved: ${match.playerName} (${match.score.points})`,
        );
      } catch (error) {
        persistenceError =
          error instanceof Error ? error.message : "Could not save the match.";
        console.error("Failed to save completed match:", error);
        systemLog(
          "error",
          `Failed to save match for ${match.playerName}: ${persistenceError}`,
        );
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
    systemLog("error", `Failed to process game move: ${message}`);
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
    socket.on("close", () => {
      if (deviceSockets.delete(socket)) {
        if (deviceSockets.size === 0) {
          systemLog("warn", "ESP32 disconnected");
        }
      }
    });
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
        if (action.type === "device-connect") {
          if (!deviceSockets.has(socket)) {
            if (deviceSockets.size === 0 && lastDeviceConnection !== null) {
              deviceReconnects += 1;
            }
            deviceSockets.add(socket);
            lastDeviceConnection = new Date().toISOString();
            systemLog("info", "ESP32 connected");
          }
          send(socket, { type: "device-status", connected: true });
          return;
        }
        if (
          deviceSockets.has(socket) &&
          ["move", "hack"].includes(action.type)
        ) {
          lastButtonPress = new Date().toISOString();
          lastButton = action.type === "hack" ? "hack" : action.move;
        }
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
  loadLocalEnvironment();
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
