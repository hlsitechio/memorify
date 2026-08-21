// src/main.ts — Memorify Remote daemon (Electron main process).
//
// The ONLY local UI is the tray icon + a small pairing window that shows the
// 6-char code. Everything else (viewer, control surface) lives in the Memorify
// dashboard. This app is a background daemon: it pairs, then loops
// poll → execute → result forever.
//
// Security: commands are allowlisted in allowlist.ts. The machine token is
// held only in memory (never written to disk).

import { app, Tray, Menu, nativeImage, shell, dialog, BrowserWindow, ipcMain, clipboard, session, desktopCapturer } from "electron";
// electron-updater is CommonJS — import the default and destructure (ESM named
// import fails at runtime: "Named export 'autoUpdater' not found").
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
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
// process relays signaling between the renderer and the backend.
let streamWindow: BrowserWindow | null = null;
let streamReady = false;
let activeSessionId: string | null = null;
let signalTimer: ReturnType<typeof setTimeout> | null = null;

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
    { label: "Open Memorify dashboard", click: () => shell.openExternal(`${HOST}/dashboard/machines`) },
    { type: "separator" },
    { label: "Quit Memorify Remote", click: () => app.quit() },
  ]);

  tray.setToolTip(label);
  tray.setContextMenu(menu);
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
      await startStreaming(sessionId);
    } else if (!sessionId && activeSessionId) {
      stopStreaming();
    }
  } catch (e) {
    if (e instanceof MachineRevokedError) {
      machineToken = null;
      stopStreaming();
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
    console.error("signal loop error:", e);
  }
  signalTimer = setTimeout(() => void signalLoop(), 500);
}

function startSignalLoop() {
  if (signalTimer) clearTimeout(signalTimer);
  void signalLoop();
}

// Renderer → main: forward signaling to the backend.
ipcMain.on("memorify:renderer", async (_ev, msg: any) => {
  if (msg?.type === "ready") {
    streamReady = true;
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
    }).catch(() => {});
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

function checkForUpdates() {
  // Only in a packaged build (autoUpdater needs the published app metadata).
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.checkForUpdatesAndNotify().catch((e) => {
    console.warn("update check failed:", e?.message ?? e);
  });
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
          callback({ video: undefined, audio: "loopback" });
          return;
        }
        callback({ video: primary, audio: "loopback" });
      })
      .catch(() => callback({ video: undefined, audio: "loopback" }));
  });
}

app.whenReady().then(() => {
  tray = new Tray(loadTrayIcon());
  rebuildTray();
  enableAutoLaunch();
  checkForUpdates();
  setupScreenCapture();

  // Auto-pair on first launch if not already paired.
  void startPair();
});

app.on("window-all-closed", () => {
  // Keep running in the tray — do NOT quit.
});
