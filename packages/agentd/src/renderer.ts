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

async function handleInput(data: unknown) {
  if (!injector) return;
  try {
    const ev = typeof data === "string" ? JSON.parse(data) : data;
    switch (ev.type) {
      case "move":
        await injector.move(ev.x, ev.y);
        break;
      case "click":
        await injector.click(ev.button);
        break;
      case "type":
        await injector.type(ev.text);
        break;
      case "key":
        await injector.key(ev.key);
        break;
      case "scroll":
        await injector.scroll(ev.dx, ev.dy);
        break;
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
