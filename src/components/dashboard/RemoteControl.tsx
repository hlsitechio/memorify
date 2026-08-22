import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MonitorOff, X, RefreshCw } from "lucide-react";

type SignalMessage = {
  kind: "offer" | "answer" | "ice" | "input" | "bye";
  payload: any;
};

/**
 * RemoteControl — the in-dashboard viewer for a machine's screen.
 *
 * Establishes a WebRTC peer connection with the daemon (via pull-based
 * signaling through /api/machine/control/*), renders the screen stream, and
 * relays mouse/keyboard input over a data channel.
 */
export function RemoteControl({
  machineId,
  machineName,
  getToken,
  onClose,
}: {
  machineId: string;
  machineName: string;
  getToken: () => Promise<string | null>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sessionRef = useRef<string | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const [state, setState] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<"frame" | "webrtc">("frame");
  const [isWebRtcPlaying, setIsWebRtcPlaying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const api = useCallback(async (path: string, body?: Record<string, unknown>) => {
    const token = await getTokenRef.current();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }, []);

  const sendSignal = useCallback(async (kind: string, payload: unknown) => {
    if (!sessionRef.current) return;
    await api("/api/machine/control/send", {
      session_id: sessionRef.current,
      kind,
      payload,
    });
  }, [api]);

  const sendInput = useCallback((ev: Record<string, unknown>) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(ev));
    } else {
      void sendSignal("input", ev);
    }
  }, [sendSignal]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    pendingCandidates.current = [];
    setIsWebRtcPlaying(false);
    setStreamType("frame");

    const handleSignal = async (msg: SignalMessage, pc: RTCPeerConnection) => {
      try {
        if (msg.kind === "frame") {
          const frameData = (msg.payload as any)?.data;
          if (frameData && canvasRef.current) {
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              if (canvas.width !== img.width || canvas.height !== img.height) {
                canvas.width = img.width;
                canvas.height = img.height;
                setResolution(`${img.width}×${img.height}`);
              }
              ctx.drawImage(img, 0, 0);
              setState("connected");
            };
            img.src = frameData;
          }
        } else if (msg.kind === "offer") {
          console.log("[RemoteControl] Received WebRTC offer from machine");
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));

          // Drain queued ICE candidates received prior to offer
          while (pendingCandidates.current.length > 0) {
            const cand = pendingCandidates.current.shift()!;
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch((e) =>
              console.warn("[RemoteControl] Buffered ICE candidate add error:", e),
            );
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", { sdp: pc.localDescription });
          console.log("[RemoteControl] Sent WebRTC answer to machine");
        } else if (msg.kind === "ice") {
          const cand = msg.payload?.candidate;
          if (cand) {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch((e) =>
                console.warn("[RemoteControl] ICE candidate add error:", e),
              );
            } else {
              pendingCandidates.current.push(cand);
            }
          }
        } else if (msg.kind === "bye") {
          console.log("[RemoteControl] Received bye from machine");
          setState("error");
          setError("Machine disconnected the remote session.");
        }
      } catch (e) {
        console.error("[RemoteControl] Signal handle error:", e);
      }
    };

    const connect = async () => {
      setState("connecting");
      setError(null);

      try {
        const { ok, data } = await api("/api/machine/control/start", { machine_id: machineId });
        if (!ok) throw new Error(data.error ?? "failed to start session");
        sessionRef.current = data.session_id;
        console.log("[RemoteControl] Session started:", sessionRef.current);

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.relay.metered.ca:80" },
            {
              urls: "turn:standard.relay.metered.ca:80",
              username: "openrelayproject",
              credential: "openrelayproject",
            },
            {
              urls: "turn:standard.relay.metered.ca:443",
              username: "openrelayproject",
              credential: "openrelayproject",
            },
            {
              urls: "turn:standard.relay.metered.ca:443?transport=tcp",
              username: "openrelayproject",
              credential: "openrelayproject",
            },
          ],
        });
        pcRef.current = pc;
        try {
          pc.addTransceiver("video", { direction: "recvonly" });
        } catch {}

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            void sendSignal("ice", { candidate: ev.candidate.toJSON() });
          }
        };

        pc.ontrack = (ev) => {
          console.log("[RemoteControl] Received video track from machine:", ev.streams, ev.track);
          const stream = (ev.streams && ev.streams[0]) ? ev.streams[0] : new MediaStream([ev.track]);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch((e) => {
              console.warn("[RemoteControl] Initial video play call:", e);
            });
          }
        };

        pc.ondatachannel = (ev) => {
          console.log("[RemoteControl] Data channel received:", ev.channel.label);
          dcRef.current = ev.channel;
        };

        pc.onconnectionstatechange = () => {
          console.log("[RemoteControl] Connection state:", pc.connectionState);
          if (pc.connectionState === "connected") {
            setState("connected");
          }
        };

        const pollForSignals = async () => {
          if (cancelled) return;
          try {
            const { ok: ok2, data: d2 } = await api(
              `/api/machine/control/poll?session_id=${sessionRef.current}`,
            );
            if (ok2 && Array.isArray(d2.messages)) {
              for (const msg of d2.messages as SignalMessage[]) {
                await handleSignal(msg, pc);
              }
            }
          } catch (err) {
            console.warn("[RemoteControl] Poll signaling error:", err);
          }
          if (!cancelled) {
            pollTimer = setTimeout(pollForSignals, 250);
          }
        };

        void pollForSignals();
      } catch (e) {
        if (!cancelled) {
          setState("error");
          setError((e as Error).message);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      void sendSignal("bye", {});
      if (pcRef.current) pcRef.current.close();
      pcRef.current = null;
      dcRef.current = null;
    };
  }, [machineId, retryCount, api, sendSignal]);

  const lastMoveSent = useRef(0);
  // ── input capture (mouse + keyboard) ────────────────────────────
  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const now = Date.now();
    if (dcRef.current?.readyState === "open" || now - lastMoveSent.current > 40) {
      lastMoveSent.current = now;
      const rect = e.currentTarget.getBoundingClientRect();
      sendInput({
        type: "move",
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    }
  };
  const onMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    sendInput({
      type: "click",
      button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };
  const onWheel = (e: React.WheelEvent<HTMLElement>) => {
    sendInput({ type: "scroll", dx: e.deltaX, dy: e.deltaY });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key.length === 1) sendInput({ type: "type", text: e.key });
    else sendInput({ type: "key", key: e.key });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="relative w-full max-w-6xl aspect-video bg-black rounded-xl overflow-hidden border border-border shadow-2xl flex flex-col justify-center items-center">
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-background/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border/40 pointer-events-none">
          <span className="text-sm font-medium text-foreground">{machineName}</span>
          {state === "connecting" && (
            <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
              <Loader2 className="h-3 w-3 animate-spin" /> connecting…
            </span>
          )}
          {state === "connected" && (
            <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {isWebRtcPlaying ? "live (60 FPS WebRTC)" : "live (Instant Frame Relay)"}
            </span>
          )}
          {resolution && (
            <span className="text-[11px] text-muted-foreground font-mono bg-background/60 px-1.5 py-0.5 rounded border border-border/30">
              {resolution}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 rounded-full bg-background/80 hover:bg-background/95 backdrop-blur-md p-2 text-foreground transition-colors border border-border/40"
          title="Close viewer"
        >
          <X className="h-4 w-4" />
        </button>

        {state === "error" ? (
          <div className="flex flex-col items-center justify-center text-foreground p-6 text-center">
            <MonitorOff className="h-12 w-12 mb-3 text-destructive" />
            <p className="text-base font-semibold">Connection failed</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">{error}</p>
            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" variant="outline" onClick={() => setRetryCount((c) => c + 1)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
              </Button>
              <Button size="sm" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="relative w-full h-full flex items-center justify-center cursor-crosshair focus:outline-none"
            tabIndex={0}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
          >
            {/* Layer 1: Instant High-Reliability Canvas Frame Relay */}
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-contain bg-black ${isWebRtcPlaying ? "hidden" : "block"}`}
            />

            {/* Layer 2: 60 FPS WebRTC Hardware Video Upgrade */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain bg-black ${isWebRtcPlaying ? "block" : "hidden"}`}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  const w = videoRef.current.videoWidth;
                  const h = videoRef.current.videoHeight;
                  if (w && h) setResolution(`${w}×${h}`);
                  console.log("[RemoteControl] WebRTC metadata loaded:", w, "x", h);
                  videoRef.current.play().catch(console.warn);
                }
              }}
              onCanPlay={() => {
                if (videoRef.current) {
                  const w = videoRef.current.videoWidth;
                  const h = videoRef.current.videoHeight;
                  if (w && h) setResolution(`${w}×${h}`);
                  videoRef.current.play().catch(console.warn);
                }
              }}
              onPlay={() => {
                console.log("[RemoteControl] WebRTC video playing -> upgrading to 60 FPS layer");
                setIsWebRtcPlaying(true);
                setStreamType("webrtc");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
