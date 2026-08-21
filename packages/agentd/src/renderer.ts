// src/renderer.ts — hidden renderer that owns the WebRTC screen stream.
//
// Electron's RTCPeerConnection + getUserMedia(desktopCapturer) are RENDERER
// APIs, so the actual streaming runs here (in a hidden BrowserWindow), while
// the main process coordinates pairing + signaling via IPC.
//
// IPC contract (main ⇄ renderer):
//   main → renderer:  { type: "start", host, machineToken, sessionId }
//   main → renderer:  { type: "signal", messages: SignalMessage[] }
//   main → renderer:  { type: "stop" }
//   renderer → main:  { type: "send", kind, payload }   (forward a signal)
//   renderer → main:  { type: "ready" | "error", detail? }

import { desktopCapturer } from "electron";
import { createInjector } from "./injector.js";

type SignalMessage = { kind: string; payload: any };

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let injector: Awaited<ReturnType<typeof createInjector>> = null;
let host = "";
let machineToken = "";
let sessionId = "";

function post(msg: unknown) {
  // @ts-expect-error — ipcRenderer injected via preload/contextBridge
  window.__memorifyIpc?.send(msg);
}

async function sendSignal(kind: string, payload: unknown) {
  post({ type: "send", kind, payload });
}

// Input event validation — the data channel is authenticated (DTLS) but a
// compromised viewer could still send malformed/oversized events. Bound every
// field and whitelist discrete values before touching the injector.
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

async function handleInput(data: unknown) {
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
    console.error("input injection error:", e);
  }
}

async function start(opts: { host: string; machineToken: string; sessionId: string }) {
  host = opts.host;
  machineToken = opts.machineToken;
  sessionId = opts.sessionId;
  injector = await createInjector();

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  const primary = sources[0];
  if (!primary) {
    post({ type: "error", detail: "no screen source available" });
    return;
  }

  const stream = await (navigator.mediaDevices as any).getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: primary.id,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30,
      },
    } as any,
  });

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  stream.getTracks().forEach((track: MediaStreamTrack) => pc!.addTrack(track, stream));

  dc = pc.createDataChannel("input", { ordered: true });
  dc.onmessage = (ev) => handleInput(ev.data);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) void sendSignal("ice", { candidate: ev.candidate.toJSON() });
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal("offer", { sdp: pc.localDescription });
  post({ type: "ready" });
}

async function onSignal(msgs: SignalMessage[]) {
  if (!pc) return;
  for (const msg of msgs) {
    try {
      if (msg.kind === "answer") {
        await pc.setRemoteDescription(msg.payload.sdp);
      } else if (msg.kind === "ice") {
        if (msg.payload.candidate) await pc.addIceCandidate(msg.payload.candidate);
      } else if (msg.kind === "bye") {
        stop();
      }
    } catch (e) {
      console.error("signal error:", e);
    }
  }
}

function stop() {
  if (pc) {
    pc.close();
    pc = null;
  }
  dc = null;
}

// @ts-expect-error — ipcRenderer injected via preload/contextBridge
window.__memorifyIpc?.on((msg: any) => {
  if (msg.type === "start") void start(msg);
  else if (msg.type === "signal") void onSignal(msg.messages ?? []);
  else if (msg.type === "stop") stop();
});
