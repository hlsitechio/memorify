// src/renderer.ts — hidden renderer that owns the WebRTC screen stream.
//
// Electron's RTCPeerConnection + getDisplayMedia are RENDERER APIs, so the
// actual streaming runs here (in a hidden BrowserWindow), while the main
// process coordinates pairing + signaling + native OS input injection via IPC.
//
// SCREEN CAPTURE: the main process grants screen access via
// session.defaultSession.setDisplayMediaRequestHandler(); the renderer then
// calls navigator.mediaDevices.getDisplayMedia().
//
// IPC contract (main ⇄ renderer):
//   main → renderer:  { type: "start", host, machineToken, sessionId }
//   main → renderer:  { type: "signal", messages: SignalMessage[] }
//   main → renderer:  { type: "stop" }
//   renderer → main:  { type: "send", kind, payload }   (forward a signal)
//   renderer → main:  { type: "input", data }            (forward mouse/keyboard to main process)
//   renderer → main:  { type: "ready" | "error", detail? }

type SignalMessage = { kind: string; payload: any };

let pc: RTCPeerConnection | null = null;
let dc: RTCDataChannel | null = null;
let host = "";
let machineToken = "";
let sessionId = "";
let pendingIceCandidates: RTCIceCandidateInit[] = [];

function post(msg: unknown) {
  // @ts-expect-error — ipcRenderer injected via preload/contextBridge
  window.__memorifyIpc?.send(msg);
}

async function sendSignal(kind: string, payload: unknown) {
  post({ type: "send", kind, payload });
}

function handleInput(data: unknown) {
  // Forward input directly to main process where Node.js native input injector runs
  post({ type: "input", data });
}

async function start(opts: { host: string; machineToken: string; sessionId: string; sourceId?: string }) {
  host = opts.host;
  machineToken = opts.machineToken;
  sessionId = opts.sessionId;
  pendingIceCandidates = [];

  console.log("[agentd:renderer] Starting stream session:", sessionId, "sourceId:", opts.sourceId);

  let stream: MediaStream;
  try {
    if (opts.sourceId) {
      stream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: opts.sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "never",
          frameRate: { ideal: 30, max: 60 },
        } as any,
        audio: false,
      });
    }
    console.log("[agentd:renderer] Captured screen stream successfully:", stream.id, "tracks:", stream.getTracks().length);
  } catch (e) {
    const err = (e as Error).message || String(e);
    console.error("[agentd:renderer] desktop capture error:", err);
    post({ type: "error", detail: `desktop capture failed: ${err}` });
    return;
  }

  pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  });

  stream.getTracks().forEach((track: MediaStreamTrack) => pc!.addTrack(track, stream));

  dc = pc.createDataChannel("input", { ordered: true });
  dc.onmessage = (ev) => handleInput(ev.data);
  dc.onopen = () => console.log("[agentd:renderer] Input data channel opened");
  dc.onclose = () => console.log("[agentd:renderer] Input data channel closed");

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      void sendSignal("ice", { candidate: ev.candidate.toJSON() });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log("[agentd:renderer] PeerConnection state:", pc?.connectionState);
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal("offer", { sdp: pc.localDescription });
    console.log("[agentd:renderer] Sent WebRTC offer to viewer");
  } catch (e) {
    console.error("[agentd:renderer] Create offer error:", e);
    post({ type: "error", detail: `Failed to create offer: ${(e as Error).message}` });
  }
}

async function onSignal(msgs: SignalMessage[]) {
  if (!pc) return;
  for (const msg of msgs) {
    try {
      if (msg.kind === "answer") {
        console.log("[agentd:renderer] Received answer from viewer");
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
        // Drain any ICE candidates received prior to answer
        while (pendingIceCandidates.length > 0) {
          const cand = pendingIceCandidates.shift()!;
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch((e) =>
            console.warn("[agentd:renderer] buffered ice add error:", e),
          );
        }
      } else if (msg.kind === "ice") {
        if (msg.payload.candidate) {
          if (!pc.remoteDescription) {
            pendingIceCandidates.push(msg.payload.candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate)).catch((e) =>
              console.warn("[agentd:renderer] addIceCandidate error:", e),
            );
          }
        }
      } else if (msg.kind === "bye") {
        console.log("[agentd:renderer] Received bye signal");
        stop();
      }
    } catch (e) {
      console.error("[agentd:renderer] signal error:", e);
    }
  }
}

function stop() {
  pendingIceCandidates = [];
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

// Signal readiness so the main process knows it can send "start"
post({ type: "ready" });
