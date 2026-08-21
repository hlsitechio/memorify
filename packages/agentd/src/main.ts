// src/main.ts — Memorify Remote daemon (Electron main process).
//
// The ONLY local UI is the tray icon + a small pairing window that shows the
// 6-char code. Everything else (viewer, control surface) lives in the Memorify
// dashboard. This app is a background daemon: it pairs, then loops
// poll → execute → result forever.
//
// Security: commands are allowlisted in allowlist.ts. The machine token is
// held only in memory (never written to disk).

import {
  app,
  Tray,
  Menu,
  nativeImage,
  shell,
  dialog,
  BrowserWindow,
  ipcMain,
  clipboard,
  session,
  desktopCapturer,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pairUntilApproved,
  pollCommands,
  executeCommand,
  postResult,
  MachineRevokedError,
  PairingDenied,
  DEFAULT_HOST,
  type DaemonStatus,
} from "./daemon.js";
import { loadState, saveState, clearState } from "./store.js";
import { createInjector } from "./injector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOST = process.env.MEMORIFY_HOST || DEFAULT_HOST;
const MACHINE_NAME =
  process.env.MEMORIFY_MACHINE_NAME ||
  `${process.env.USERNAME || process.env.USER || "user"}'s ${process.platform}`;
const PLATFORM = `${process.platform} ${process.arch}`;

let tray: Tray | null = null;
let status: DaemonStatus = "unpaired";
let machineToken: string | null = null;
let userCode: string | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | null = null;

// Remote desktop streaming state (Layer 2/3).
// WebRTC runs in a hidden renderer window (renderer-only APIs); the main
// process relays signaling between the renderer and the backend and executes native OS input.
let streamWindow: BrowserWindow | null = null;
let streamReady = false;
let activeSessionId: string | null = null;
let signalTimer: ReturnType<typeof setTimeout> | null = null;
let injector: Awaited<ReturnType<typeof createInjector>> = null;

// ── tray ─────────────────────────────────────────────────────────

function setStatus(next: DaemonStatus, err?: string) {
  status = next;
  lastError = err ?? null;
  rebuildTray();
}

function rebuildTray() {
  if (!tray) return;
  const label = {
    unpaired: "Memorify Remote — not paired",
    pairing: "Memorify Remote — pairing…",
    waiting_approval: `Memorify Remote — code ${userCode ?? ""}`,
    connected: "Memorify Remote — connected",
    revoked: "Memorify Remote — revoked",
    error: "Memorify Remote — error",
  }[status];

  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: "separator" },
    ...(status === "unpaired" || status === "error" || status === "revoked"
      ? [{ label: "Pair this machine…", click: () => void startPair() }]
      : []),
    ...(userCode
      ? [{ label: `Copy code: ${userCode}`, click: () => copyUserCode() }]
      : []),
    ...(status === "connected"
      ? [{ label: "Forget this machine", click: () => void forgetMachine() }]
      : []),
    { label: "Open Memorify dashboard", click: () => shell.openExternal(`${HOST}/dashboard/machines`) },
    { type: "separator" },
    { label: "Quit Memorify Remote", click: () => app.quit() },
  ]);

  tray.setToolTip(label);
  tray.setContextMenu(menu);
}

async function forgetMachine() {
  machineToken = null;
  stopStreaming();
  await clearState();
  setStatus("unpaired");
  dialog.showMessageBox({
    type: "info",
    title: "Memorify Remote",
    message: "Machine forgotten",
    detail: "This machine is no longer paired. Pair it again from the tray menu when ready.",
  });
}

function copyUserCode() {
  if (!userCode) return;
  clipboard.writeText(userCode);
}

// ── pairing ──────────────────────────────────────────────────────

async function startPair() {
  if (status === "pairing" || status === "waiting_approval") return;
  setStatus("pairing");
  try {
    const token = await pairUntilApproved(HOST, MACHINE_NAME, PLATFORM, (msg) => {
      const code = msg.match(/code ([A-Z0-9]{6})/)?.[1];
      if (code) {
        userCode = code;
        setStatus("waiting_approval");
        // Show the code prominently so the user can enter it in the dashboard.
        showPairingCode(code);
      }
    });
    machineToken = token;
    userCode = null;
    setStatus("connected");
    void saveState({ machineToken: token, machineName: MACHINE_NAME, pairedAt: new Date().toISOString() });
    startPollLoop();
    dialog.showMessageBox({
      type: "info",
      title: "Memorify Remote",
      message: "Machine paired ✓",
      detail: "Your machine is now connected. You (or an agent) can control it from the Memorify dashboard.",
    });
  } catch (e) {
    if (e instanceof PairingDenied) {
      setStatus("error", e.message);
      dialog.showMessageBox({
        type: "warning",
        title: "Memorify Remote",
        message: "Pairing did not complete",
        detail: e.message,
      });
    } else {
      const msg = (e as Error).message || String(e);
      setStatus("error", msg);
      // Show the actual error so the user knows what went wrong.
      dialog.showMessageBox({
        type: "error",
        title: "Memorify Remote",
        message: "Pairing failed",
        detail: msg,
      });
    }
  }
}

function showPairingCode(code: string) {
  const buttons = ["Copy code", "Open dashboard", "Close"];
  dialog
    .showMessageBox({
      type: "info",
      title: "Memorify Remote",
      message: `Your pairing code: ${code}`,
      detail:
        `Open the Memorify dashboard (Machines page) and enter this code to approve the machine.\n\n` +
        `Verification URL: ${HOST}/dashboard/machines`,
      buttons,
      defaultId: 0,
      cancelId: 2,
    })
    .then(({ response }) => {
      if (response === 0) copyUserCode();
      else if (response === 1) shell.openExternal(`${HOST}/dashboard/machines`);
    });
}

// ── input execution (Node main process) ─────────────────────────

const MAX_TYPE_LENGTH = 2000;
const ALLOWED_BUTTONS = new Set(["left", "right", "middle"]);
const ALLOWED_KEYS = new Set([
  "Enter", "Backspace", "Escape", "Tab", "Space",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Delete", "Home", "End", "PageUp", "PageDown",
]);

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(1, Math.max(0, v));
}

async function handleRemoteInput(data: unknown) {
  if (!injector) return;
  try {
    const ev = typeof data === "string" ? JSON.parse(data) : data;
    if (!ev || typeof ev !== "object") return;
    switch (ev.type) {
      case "move":
        await injector.move(clamp01(ev.x), clamp01(ev.y));
        break;
      case "click": {
        const button = typeof ev.button === "string" && ALLOWED_BUTTONS.has(ev.button) ? ev.button : "left";
        await injector.click(button);
        break;
      }
      case "type": {
        const text = typeof ev.text === "string" ? ev.text : "";
        await injector.type(text.slice(0, MAX_TYPE_LENGTH));
        break;
      }
      case "key": {
        const key = typeof ev.key === "string" && ALLOWED_KEYS.has(ev.key) ? ev.key : null;
        if (key) await injector.key(key);
        break;
      }
      case "scroll": {
        const dx = typeof ev.dx === "number" && Number.isFinite(ev.dx) ? ev.dx : 0;
        const dy = typeof ev.dy === "number" && Number.isFinite(ev.dy) ? ev.dy : 0;
        await injector.scroll(Math.max(-100, Math.min(100, dx)), Math.max(-100, Math.min(100, dy)));
        break;
      }
    }
  } catch (e) {
    console.error("[agentd:input] error:", e);
  }
}

// ── poll / execute loop ─────────────────────────────────────────

function startPollLoop() {
  if (pollTimer) clearTimeout(pollTimer);
  void pollOnce();
}

async function pollOnce() {
  if (!machineToken) return;
  let interval = 3;
  try {
    const res = await pollCommands(HOST, machineToken);
    interval = res.interval || 3;
    for (const cmd of res.commands) {
      const result = await executeCommand(cmd.command);
      await postResult(HOST, machineToken, cmd.id, result);
    }

    // Start/stop remote desktop streaming based on the active session.
    const sessionId = (res as any).session_id ?? null;
    if (sessionId && sessionId !== activeSessionId) {
      console.log("[agentd:main] Active session discovered:", sessionId);
      await startStreaming(sessionId);
    } else if (!sessionId && activeSessionId) {
      console.log("[agentd:main] Active session ended:", activeSessionId);
      stopStreaming();
    }
  } catch (e) {
    if (e instanceof MachineRevokedError) {
      machineToken = null;
      stopStreaming();
      void clearState();
      setStatus("revoked", e.reason);
      return; // stop polling — must re-pair
    }
    // transient network error — keep polling, back off
    interval = Math.min(interval * 2, 30);
  }
  pollTimer = setTimeout(() => void pollOnce(), interval * 1000);
}

function ensureStreamWindow(): BrowserWindow {
  if (streamWindow) return streamWindow;
  streamReady = false;
  streamWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  streamWindow.webContents.on("console-message", (_ev, level, message, line, sourceId) => {
    console.log(`[agentd:renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  streamWindow.webContents.on("did-fail-load", (_ev, code, desc) => {
    console.error(`[agentd:renderer:fail-load] ${code}: ${desc}`);
  });

  streamWindow.loadFile(path.join(__dirname, "renderer.html"));
  streamWindow.on("closed", () => {
    streamWindow = null;
    streamReady = false;
  });
  return streamWindow;
}

function startStreaming(sessionId: string) {
  if (!machineToken) return;
  const win = ensureStreamWindow();
  activeSessionId = sessionId;
  const sendStart = () => {
    if (!streamReady) {
      // Renderer not loaded yet — retry shortly.
      setTimeout(sendStart, 200);
      return;
    }
    win.webContents.send("memorify:main", {
      type: "start",
      host: HOST,
      machineToken,
      sessionId,
    });
  };
  sendStart();
  startSignalLoop();
  setStatus("connected");
}

function stopStreaming() {
  if (streamWindow) {
    streamWindow.webContents.send("memorify:main", { type: "stop" });
  }
  activeSessionId = null;
  if (signalTimer) clearTimeout(signalTimer);
  signalTimer = null;
}

// Poll viewer → machine signaling and forward to the renderer.
async function signalLoop() {
  if (!machineToken || !activeSessionId) return;
  try {
    const res = await fetch(`${HOST}/api/machine/signal/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${machineToken}`,
      },
      body: JSON.stringify({ session_id: activeSessionId }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      const msgs = body.messages ?? [];
      if (msgs.length > 0 && streamWindow) {
        streamWindow.webContents.send("memorify:main", { type: "signal", messages: msgs });
      }
    }
  } catch (e) {
    console.error("[agentd:signal:poll] error:", e);
  }
  signalTimer = setTimeout(() => void signalLoop(), 500);
}

function startSignalLoop() {
  if (signalTimer) clearTimeout(signalTimer);
  void signalLoop();
}

// Renderer → main: forward signaling to the backend or handle input/status.
ipcMain.on("memorify:renderer", async (_ev, msg: any) => {
  if (msg?.type === "ready") {
    streamReady = true;
    return;
  }
  if (msg?.type === "error") {
    console.error("[agentd:renderer:error]", msg.detail);
    return;
  }
  if (msg?.type === "input") {
    void handleRemoteInput(msg.data);
    return;
  }
  if (!machineToken || !activeSessionId) return;
  if (msg?.type === "send") {
    await fetch(`${HOST}/api/machine/signal/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${machineToken}`,
      },
      body: JSON.stringify({
        session_id: activeSessionId,
        kind: msg.kind,
        payload: msg.payload,
      }),
    }).catch((e) => console.error("[agentd:signal:send] error:", e));
  }
});

// ── app lifecycle ────────────────────────────────────────────────

function loadTrayIcon() {
  // Use the bundled brand icon (copied to dist/ during build); fall back to empty.
  const iconPath = path.join(__dirname, "icon.png");
  const img = nativeImage.createFromPath(iconPath);
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 });
}

function enableAutoLaunch() {
  // A remote-control daemon must be running to accept control — start on login.
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    });
  } catch (e) {
    console.warn("setLoginItemSettings failed:", e);
  }
}

async function checkForUpdates() {
  // Only in a packaged build (autoUpdater needs the published app metadata).
  if (!app.isPackaged) return;
  try {
    const mod = await import("electron-updater");
    const autoUpdater = mod.default?.autoUpdater || (mod as any).autoUpdater;
    if (autoUpdater) {
      autoUpdater.autoDownload = true;
      autoUpdater.checkForUpdatesAndNotify().catch((e: any) => {
        console.warn("update check failed:", e?.message ?? e);
      });
    }
  } catch (e) {
    console.warn("electron-updater not available:", e);
  }
}

function setupScreenCapture() {
  // Grant screen access to the hidden renderer via getDisplayMedia.
  // desktopCapturer is main-process only, so we resolve the screen source here.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => {
        const primary = sources[0];
        if (!primary) {
          console.warn("[agentd:screen] No display screen source found!");
          callback({});
          return;
        }
        console.log(`[agentd:screen] Granted capture for source: ${primary.name} (${primary.id})`);
        callback({
          video: primary,
          ...(request.audioRequested ? { audio: "loopback" } : {}),
        });
      })
      .catch((e) => {
        console.error("[agentd:screen] desktopCapturer.getSources failed:", e);
        callback({});
      });
  });
}

app.whenReady().then(async () => {
  tray = new Tray(loadTrayIcon());
  rebuildTray();
  enableAutoLaunch();
  checkForUpdates();
  setupScreenCapture();

  // Lazy load native input injector in the Node main process
  injector = await createInjector();

  // Restore a previously-saved machine token (daemon survives restarts
  // without re-pairing). Only pair if we have no saved token.
  const saved = await loadState();
  if (saved.machineToken) {
    machineToken = saved.machineToken;
    setStatus("connected");
    startPollLoop();
  } else {
    // Auto-start pairing on first launch to display the 6-character code popup on screen!
    void startPair();
  }
});

app.on("window-all-closed", () => {
  // Keep running in the tray — do NOT quit.
});
