const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const dashboardMessage = document.querySelector("#dashboard-message");
const leaderboardBody = document.querySelector("#leaderboard-body");
const historyBody = document.querySelector("#history-body");
const roundDetails = document.querySelector("#round-details");
let historyPage = 1;
let historyTotal = 0;
let refreshTimer;
let leaderboardTimer;
let historyTimer;
let historySort = "created_at";
let historyDirection = "desc";
let lastButton = null;
let lastButtonPress = null;
let buttonFlashTimer;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new Error(result?.error ?? `Request failed (${response.status}).`);
  }
  return result;
}

function showMessage(message) {
  dashboardMessage.textContent = message;
  dashboardMessage.hidden = false;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    dashboardMessage.hidden = true;
  }, 4500);
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function durationLabel(seconds) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}

function setAuthenticated(authenticated) {
  loginPanel.hidden = authenticated;
  dashboard.hidden = !authenticated;
  logoutButton.hidden = !authenticated;
  if (authenticated) {
    refreshDashboard();
    loadSettings().catch((error) => showMessage(error.message));
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshDashboard, 3000);
  } else {
    clearInterval(refreshTimer);
  }
}

async function checkSession() {
  try {
    const session = await request("/api/admin/session");
    setAuthenticated(session.authenticated);
  } catch (error) {
    loginPanel.hidden = false;
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  try {
    await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: document.querySelector("#admin-password").value }),
    });
    loginForm.reset();
    setAuthenticated(true);
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await request("/api/admin/logout", { method: "POST", body: "{}" });
    setAuthenticated(false);
  } catch (error) {
    showMessage(error.message);
  }
});

async function refreshDashboard() {
  try {
    const [overview, analytics, logs] = await Promise.all([
      request("/api/admin/overview"),
      request("/api/admin/analytics"),
      request("/api/admin/logs"),
    ]);
    renderOverview(overview);
    renderAnalytics(analytics);
    renderLogs(logs);
    await Promise.all([loadLeaderboard(), loadHistory()]);
  } catch (error) {
    if (error.message === "Admin login required.") {
      setAuthenticated(false);
      return;
    }
    showMessage(error.message);
  }
}

function renderOverview(data) {
  document.querySelector("#games-today").textContent = data.gamesToday ?? 0;
  document.querySelector("#games-all").textContent = data.gamesAllTime ?? 0;
  document.querySelector("#unique-players").textContent = data.uniquePlayers ?? 0;
  document.querySelector("#player-win-rate").textContent = `${data.playerWinRatePercent ?? 0}%`;
  document.querySelector("#machine-win-rate").textContent = `${100 - (data.playerWinRatePercent ?? 0)}%`;
  document.querySelector("#average-score").textContent = Math.round(data.averageScore ?? 0);
  document.querySelector("#average-duration").textContent = durationLabel(data.averageDurationSec);
  document.querySelector("#highest-score").textContent = data.highestScoreToday?.points ?? "—";
  document.querySelector("#highest-player").textContent =
    data.highestScoreToday?.playerName ?? "No scores today";
  const deviceOnline = data.device.status === "online";
  const deviceOverview = document.querySelector("#device-overview");
  deviceOverview.textContent = deviceOnline ? "Online" : "Offline";
  deviceOverview.classList.toggle("status-online", deviceOnline);
  document.querySelector("#server-uptime").textContent = durationLabel(data.uptimeSec);

  const live = data.live;
  const liveStatus = document.querySelector("#live-status");
  liveStatus.textContent = live.status === "playing" ? "Playing" : "Idle";
  liveStatus.classList.toggle("status-playing", live.status === "playing");
  document.querySelector("#live-player").textContent = live.playerName || "—";
  document.querySelector("#live-round").textContent = `${live.round || "—"} / ${live.totalRounds ?? 5}`;
  document.querySelector("#live-score").textContent = live.score ?? 0;
  document.querySelector("#live-mode").textContent =
    live.mode === "glitch-mode" ? "Glitch Mode" :
      live.mode === "double-stakes" ? "Double Stakes" :
        live.mode ? live.mode : "Normal";
  document.querySelector("#live-hack").textContent = live.hackUsed ? "Used" : "Not used";
  const playedRound = live.lastRound;
  document.querySelector("#last-move").textContent = playedRound
    ? `Round ${playedRound.round}: Player ${playedRound.hacked ? "used Hack Chip" : `played ${playedRound.playerMove}`} vs Madam Glitch ${playedRound.madamMove ?? "—"} — ${playedRound.outcome}.`
    : "No moves played yet.";

  const status = document.querySelector("#device-status");
  status.textContent = deviceOnline ? "Online" : "Offline";
  status.classList.toggle("status-online", deviceOnline);
  status.classList.toggle("status-offline", !deviceOnline);
  const buttonText = data.device.lastButton
    ? `${data.device.lastButton} · ${formatDate(data.device.lastButtonPress)}`
    : "None recorded";
  document.querySelector("#last-button").textContent = buttonText;
  document.querySelector("#last-connected").textContent = formatDate(data.device.lastConnected);
  document.querySelector("#reconnect-count").textContent = data.device.reconnects ?? 0;
  document.querySelector("#maintenance-toggle").checked = data.maintenanceMode;
  if (data.device.lastButton && data.device.lastButtonPress !== lastButtonPress) {
    lastButton = data.device.lastButton;
    lastButtonPress = data.device.lastButtonPress;
    document.querySelectorAll("[data-button]").forEach((light) => {
      light.classList.toggle("active", light.dataset.button === lastButton);
    });
    clearTimeout(buttonFlashTimer);
    buttonFlashTimer = setTimeout(() => {
      document.querySelectorAll("[data-button]").forEach((light) => {
        light.classList.remove("active");
      });
    }, 1400);
  }
}

function appendEmptyRow(parent, columnCount, message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.className = "empty-row";
  cell.textContent = message;
  row.append(cell);
  parent.replaceChildren(row);
}

function makeAction(label, action, id, enabled = true) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  button.disabled = !enabled;
  return button;
}

async function loadLeaderboard() {
  const search = document.querySelector("#leaderboard-search").value;
  const period = document.querySelector("#leaderboard-period").value;
  const entries = await request(`/api/admin/leaderboard?search=${encodeURIComponent(search)}&period=${period}`);
  if (entries.length === 0) {
    appendEmptyRow(leaderboardBody, 6, "No matching scores.");
    return;
  }
  const fragment = document.createDocumentFragment();
  entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.classList.toggle("flagged", Boolean(entry.flagged));
    const values = [index + 1, entry.displayName, entry.points, `${entry.wins} / ${entry.losses} / ${entry.ties}`, formatDate(entry.playedAt)];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    const actions = document.createElement("td");
    actions.className = "row-actions";
    actions.append(
      makeAction(entry.hidden ? "Show" : "Hide", "hide", entry.id, true),
      makeAction("Rename", "rename", entry.id, true),
      makeAction(entry.flagged ? "Unflag" : "Flag", "flag", entry.id, true),
      makeAction("Delete", "delete", entry.id, true),
    );
    row.append(actions);
    fragment.append(row);
  });
  leaderboardBody.replaceChildren(fragment);
}

async function loadHistory() {
  const params = new URLSearchParams({
    page: String(historyPage),
    pageSize: "20",
    search: document.querySelector("#history-search").value,
    sort: historySort,
    direction: historyDirection,
  });
  const data = await request(`/api/admin/history?${params}`);
  historyTotal = data.total;
  if (data.rows.length === 0) {
    appendEmptyRow(historyBody, 7, "No games recorded yet.");
  } else {
    const fragment = document.createDocumentFragment();
    data.rows.forEach((game) => {
      const row = document.createElement("tr");
      row.tabIndex = 0;
      row.dataset.id = game.id;
      row.setAttribute("aria-label", `View rounds for ${game.playerName}`);
      [formatDate(game.playedAt), game.playerName, game.points, `${game.wins} / ${game.losses} / ${game.ties}`, game.hacksUsed ? "Yes" : "No", durationLabel(game.durationSec), "View"].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      fragment.append(row);
    });
    historyBody.replaceChildren(fragment);
  }
  const totalPages = Math.max(1, Math.ceil(historyTotal / 20));
  document.querySelector("#history-page").textContent = `Page ${historyPage} of ${totalPages}`;
  document.querySelector("#history-prev").disabled = historyPage <= 1;
  document.querySelector("#history-next").disabled = historyPage >= totalPages;
}

function renderBarList(container, rows, labelFor, valueFor, maxValue) {
  container.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No round data yet.";
    container.append(empty);
    return;
  }
  rows.forEach((item) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = labelFor(item);
    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max(0, Math.min(100, maxValue(item)))}%`;
    track.append(fill);
    const value = document.createElement("strong");
    value.className = "bar-value";
    value.textContent = valueFor(item);
    row.append(label, track, value);
    container.append(row);
  });
}

function renderAnalytics(data) {
  const totalMoves = data.moves.reduce((sum, item) => sum + item.count, 0) || 1;
  document.querySelector("#ai-accuracy").textContent =
    data.aiAccuracy.predictions > 0
      ? `${Math.round(data.aiAccuracy.accuracy * 100)}% (${data.aiAccuracy.correct} correct of ${data.aiAccuracy.predictions} predicted rounds)`
      : "Not enough move history to make predictions.";
  renderBarList(
    document.querySelector("#move-analytics"),
    data.moves,
    (item) => item.move,
    (item) => `${item.count} (${Math.round(item.count / totalMoves * 100)}%)`,
    (item) => item.count / Math.max(...data.moves.map((move) => move.count)) * 100,
  );
  renderBarList(
    document.querySelector("#round-analytics"),
    data.roundWinRates,
    (item) => `Round ${item.round}`,
    (item) => `${Math.round(item.playerWinRate * 100)}% (${item.games})`,
    (item) => item.playerWinRate * 100,
  );
  renderBarList(
    document.querySelector("#event-analytics"),
    data.events,
    (item) => item.event,
    (item) => `${Math.round(item.playerWinRate * 100)}% (${item.rounds})`,
    (item) => item.playerWinRate * 100,
  );
  document.querySelector("#hack-analytics").textContent =
    `${data.hacks.gamesUsingHack} games used Hack; ${data.hacks.hackGamesWithWin} of those games included a win.`;
  const hours = new Map(data.hourly.map((item) => [Number(item.hour), item.games]));
  const peak = Math.max(1, ...hours.values());
  const hourly = document.querySelector("#hourly-analytics");
  hourly.replaceChildren();
  for (let hour = 0; hour < 24; hour += 1) {
    const column = document.createElement("span");
    column.className = "hour-bar";
    const bar = document.createElement("i");
    const count = hours.get(hour) ?? 0;
    bar.style.height = `${Math.max(2, count / peak * 82)}px`;
    bar.title = `${hour}:00 — ${count} games`;
    const label = document.createElement("small");
    label.textContent = hour % 3 === 0 ? String(hour).padStart(2, "0") : "";
    column.append(bar, label);
    hourly.append(column);
  }
}

function renderLogs(logs) {
  const list = document.querySelector("#system-log");
  list.replaceChildren();
  if (logs.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No system events logged.";
    list.append(empty);
    return;
  }
  logs.forEach((log) => {
    const row = document.createElement("li");
    const time = document.createElement("time");
    time.textContent = formatDate(log.createdAt);
    const level = document.createElement("strong");
    level.className = `log-${log.level}`;
    level.textContent = log.level.toUpperCase();
    const message = document.createElement("span");
    message.textContent = log.message;
    row.append(time, level, message);
    list.append(row);
  });
}

leaderboardBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  try {
    if (button.dataset.action === "delete") {
      if (!confirm("Permanently delete this score and its round details?")) return;
      await request(`/api/admin/matches/${id}`, { method: "DELETE" });
    } else if (button.dataset.action === "rename") {
      const currentName = button.closest("tr").children[1].textContent;
      const displayName = prompt("Enter the replacement nickname:", currentName);
      if (displayName === null) return;
      await request(`/api/admin/matches/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
    } else {
      const property = button.dataset.action === "hide" ? "hidden" : "flagged";
      const row = button.closest("tr");
      const current = property === "hidden"
        ? button.textContent === "Show"
        : button.textContent === "Unflag";
      await request(`/api/admin/matches/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ [property]: !current }),
      });
    }
    await loadLeaderboard();
    showMessage("Leaderboard entry updated.");
  } catch (error) {
    showMessage(error.message);
  }
});

historyBody.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (row) loadRoundDetails(row.dataset.id);
});
historyBody.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    const row = event.target.closest("tr[data-id]");
    if (row) {
      event.preventDefault();
      loadRoundDetails(row.dataset.id);
    }
  }
});

async function loadRoundDetails(id) {
  try {
    const rounds = await request(`/api/admin/history/${id}`);
    roundDetails.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = "Round-by-round details";
    roundDetails.append(title);
    if (rounds.length === 0) {
      const note = document.createElement("p");
      note.textContent = "Round data is not available for this match.";
      roundDetails.append(note);
    } else {
      rounds.forEach((round) => {
        const line = document.createElement("p");
        line.textContent = `Round ${round.round}: ${round.playerMove} vs ${round.madamMove ?? "—"} · ${round.result} · ${round.event ?? "normal"} · ${round.pointsAwarded} points${round.hacked ? " · hack used" : ""}${round.timedOut ? " · timed out" : ""}`;
        roundDetails.append(line);
      });
    }
    roundDetails.hidden = false;
  } catch (error) {
    showMessage(error.message);
  }
}

document.querySelector("#leaderboard-search").addEventListener("input", () => {
  clearTimeout(leaderboardTimer);
  leaderboardTimer = setTimeout(() => loadLeaderboard().catch((error) => showMessage(error.message)), 200);
});
document.querySelector("#leaderboard-period").addEventListener("change", () => {
  loadLeaderboard().catch((error) => showMessage(error.message));
});
document.querySelector("#history-search").addEventListener("input", () => {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyPage = 1;
    loadHistory().catch((error) => showMessage(error.message));
  }, 200);
});
document.querySelector("#history-sort").addEventListener("change", (event) => {
  historySort = event.target.value;
  historyPage = 1;
  loadHistory().catch((error) => showMessage(error.message));
});
document.querySelector("#history-direction").addEventListener("change", (event) => {
  historyDirection = event.target.value;
  historyPage = 1;
  loadHistory().catch((error) => showMessage(error.message));
});
document.querySelector("#history-prev").addEventListener("click", () => {
  historyPage = Math.max(1, historyPage - 1);
  loadHistory().catch((error) => showMessage(error.message));
});
document.querySelector("#history-next").addEventListener("click", () => {
  if (historyPage * 20 < historyTotal) historyPage += 1;
  loadHistory().catch((error) => showMessage(error.message));
});

document.querySelectorAll("[data-effect]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await request("/api/admin/test-effect", {
        method: "POST",
        body: JSON.stringify({ effect: button.dataset.effect }),
      });
      showMessage(`${button.textContent} test effect sent.`);
    } catch (error) {
      showMessage(error.message);
    }
  });
});

document.querySelector("#reset-leaderboard").addEventListener("click", async () => {
  if (!confirm("Reset all leaderboard scores and player move history? This cannot be undone.")) return;
  try {
    await request("/api/admin/leaderboard/reset", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
    await refreshDashboard();
    showMessage("Leaderboard reset.");
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#backup-button").addEventListener("click", async () => {
  try {
    const result = await request("/api/admin/backup", { method: "POST", body: "{}" });
    showMessage(`Database backup created: ${result.filename}`);
  } catch (error) {
    showMessage(error.message);
  }
});

document.querySelector("#maintenance-toggle").addEventListener("change", async (event) => {
  const toggle = event.currentTarget;
  toggle.disabled = true;
  try {
    const result = await request("/api/admin/maintenance", {
      method: "POST",
      body: JSON.stringify({ paused: toggle.checked }),
    });
    showMessage(result.paused ? "Game paused for maintenance." : "Game resumed.");
  } catch (error) {
    toggle.checked = !toggle.checked;
    showMessage(error.message);
  } finally {
    toggle.disabled = false;
  }
});

function renderSettings(settings) {
  document.querySelector("#setting-prediction").value = settings.predictionPct;
  document.querySelector("#setting-timer").value = settings.moveTimerSec;
  document.querySelector("#setting-rounds").value = settings.rounds;
  document.querySelector("#setting-frequency").value = settings.eventFrequencyPct;
  document.querySelector("#setting-glitch").checked = settings.glitchMode;
  document.querySelector("#setting-events").checked = settings.randomEvents;
  document.querySelector("#setting-hack").checked = settings.hackEnabled;
  document.querySelector("#maintenance-toggle").checked = settings.maintenanceMode;
}

async function loadSettings() {
  renderSettings(await request("/api/admin/settings"));
}

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const saveButton = form.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  const settings = {
    predictionPct: Number(document.querySelector("#setting-prediction").value),
    moveTimerSec: Number(document.querySelector("#setting-timer").value),
    rounds: Number(document.querySelector("#setting-rounds").value),
    eventFrequencyPct: Number(document.querySelector("#setting-frequency").value),
    glitchMode: document.querySelector("#setting-glitch").checked,
    randomEvents: document.querySelector("#setting-events").checked,
    hackEnabled: document.querySelector("#setting-hack").checked,
    maintenanceMode: document.querySelector("#maintenance-toggle").checked,
  };
  try {
    renderSettings(await request("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }));
    showMessage("Game settings saved.");
  } catch (error) {
    showMessage(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

checkSession();
