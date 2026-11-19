import assert from "node:assert/strict";
import test from "node:test";
import WebSocket from "ws";
import { createGameServer } from "../src/server.js";
import {
  createDatabase,
  getPlayerMoveHistory,
} from "../src/storage/database.js";

function createMessageReader(socket) {
  const queue = [];
  const waiters = [];

  socket.on("message", (rawMessage) => {
    const message = JSON.parse(rawMessage.toString());
    const waiterIndex = waiters.findIndex((waiter) =>
      waiter.predicate(message),
    );
    if (waiterIndex === -1) {
      queue.push(message);
      return;
    }

    const [waiter] = waiters.splice(waiterIndex, 1);
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  });

  return {
    waitFor(predicate) {
      const messageIndex = queue.findIndex(predicate);
      if (messageIndex !== -1) {
        return Promise.resolve(queue.splice(messageIndex, 1)[0]);
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timeout: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index !== -1) {
              waiters.splice(index, 1);
            }
            reject(new Error("Timed out waiting for a WebSocket message."));
          }, 3000),
        };
        waiters.push(waiter);
      });
    },
  };
}

async function openTestSocket(server, context) {
  const address = await server.listen(0, "127.0.0.1");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`);
  const reader = createMessageReader(socket);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  context.after(async () => {
    socket.terminate();
    await server.close();
  });
  return { address, socket, reader };
}

async function startTestMatch(socket, reader, playerName) {
  socket.send(JSON.stringify({ type: "start", playerName }));
  await reader.waitFor(
    (message) => message.type === "state" && message.state.phase === "intro",
  );
  socket.send(JSON.stringify({ type: "intro-complete" }));
  return reader.waitFor(
    (message) =>
      message.type === "state" && message.state.phase === "awaiting-move",
  );
}

async function markResultReady(socket, reader, phase) {
  socket.send(JSON.stringify({ type: "result-ready" }));
  return reader.waitFor(
    (message) =>
      message.type === "state" &&
      message.state.phase === phase &&
      message.state.resultReady,
  );
}

test("plays a five-round match and persists the leaderboard result", async (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());
  const server = createGameServer({
    database,
    random: () => 0.99,
  });
  const { address, socket, reader } = await openTestSocket(server, context);

  const pageResponse = await fetch(`http://127.0.0.1:${address.port}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Carnival Clash/);

  const madamImageResponse = await fetch(
    `http://127.0.0.1:${address.port}/assets/madam.png`,
  );
  assert.equal(madamImageResponse.status, 200);
  assert.match(madamImageResponse.headers.get("content-type"), /image\/png/);
  assert.ok((await madamImageResponse.arrayBuffer()).byteLength > 0);

  await startTestMatch(socket, reader, "JON");

  for (let round = 1; round <= 5; round += 1) {
    socket.send(JSON.stringify({ type: "move", move: "rock" }));
    const expectedPhase = round === 5 ? "complete" : "round-result";
    const result = await reader.waitFor(
      (message) =>
        message.type === "state" &&
        message.state.phase === expectedPhase &&
        message.state.roundsPlayed === round,
    );
    assert.equal(
      result.state.lastRound.event,
      round === 3 ? "glitch-mode" : round === 4 ? "double-stakes" : null,
    );
    await markResultReady(socket, reader, expectedPhase);

    if (round < 5) {
      socket.send(JSON.stringify({ type: "continue" }));
      await reader.waitFor(
        (message) =>
          message.type === "state" &&
          message.state.phase === "intro" &&
          message.state.currentRound === round + 1,
      );
      socket.send(JSON.stringify({ type: "intro-complete" }));
      await reader.waitFor(
        (message) =>
          message.type === "state" &&
          message.state.phase === "awaiting-move" &&
          message.state.currentRound === round + 1,
      );
    } else {
      socket.send(JSON.stringify({ type: "continue" }));
      await reader.waitFor((message) => message.type === "continue");
    }
  }

  assert.equal(getPlayerMoveHistory(database, "JON").length, 5);
  const leaderboardResponse = await fetch(
    `http://127.0.0.1:${address.port}/api/leaderboard`,
  );
  const [entry] = await leaderboardResponse.json();
  assert.equal(entry.playerName, "JON");
  assert.equal(entry.points, 500);
  assert.equal(entry.wins, 4);
  assert.equal(entry.losses, 1);
});

test("reports invalid WebSocket input and automatically resolves a timeout", async (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());
  const server = createGameServer({
    database,
    random: () => 0,
    moveTimeoutMs: 30,
  });
  const { socket, reader } = await openTestSocket(server, context);

  socket.send("{not json");
  const parseError = await reader.waitFor(
    (message) => message.type === "error",
  );
  assert.equal(parseError.message, "Message must be valid JSON.");

  await startTestMatch(socket, reader, "JON");
  const result = await reader.waitFor(
    (message) =>
      message.type === "state" && message.state.phase === "round-result",
  );

  assert.equal(result.state.lastRound.timedOut, true);
  assert.equal(result.state.lastRound.playerMove, "rock");
  assert.equal(result.state.lastRound.outcome, "tie");
});

test("a move pressed during the result continues without playing that move", async (context) => {
  const database = createDatabase(":memory:");
  context.after(() => database.close());
  const server = createGameServer({
    database,
    random: () => 0.99,
    moveTimeoutMs: 5_000,
  });
  const { socket, reader } = await openTestSocket(server, context);

  await startTestMatch(socket, reader, "JON");
  socket.send(JSON.stringify({ type: "move", move: "rock" }));
  const result = await reader.waitFor(
    (message) =>
      message.type === "state" && message.state.phase === "round-result",
  );
  assert.equal(result.state.roundsPlayed, 1);

  socket.send(JSON.stringify({ type: "move", move: "paper" }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  await markResultReady(socket, reader, "round-result");
  socket.send(JSON.stringify({ type: "move", move: "paper" }));
  await reader.waitFor(
    (message) =>
      message.type === "state" &&
      message.state.phase === "intro" &&
      message.state.currentRound === 2,
  );
  socket.send(JSON.stringify({ type: "intro-complete" }));
  await reader.waitFor(
    (message) =>
      message.type === "state" &&
      message.state.phase === "awaiting-move" &&
      message.state.currentRound === 2,
  );

  assert.equal(result.state.roundsPlayed, 1);
});
