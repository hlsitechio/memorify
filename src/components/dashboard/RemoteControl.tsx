import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MonitorOff, X } from "lucide-react";

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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [state, setState] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, body?: Record<string, unknown>) => {
      const token = await getToken();
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
    },
    [getToken],
  );

  const sendSignal = useCallback(
    async (kind: string, payload: unknown) => {
      if (!sessionRef.current) return;
      await api("/api/machine/control/send", {
        session_id: sessionRef.current,
        kind,
        payload,
      });
    },
    [api],
  );

  const sendInput = useCallback((ev: Record<string, unknown>) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify(ev));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSignal = async (msg: SignalMessage, pc: RTCPeerConnection) => {
      try {
        if (msg.kind === "offer") {
          await pc.setRemoteDescription(msg.payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal("answer", { sdp: pc.localDescription });
        } else if (msg.kind === "ice") {
          if (msg.payload.candidate) await pc.addIceCandidate(msg.payload.candidate);
        } else if (msg.kind === "bye") {
          onClose();
        }
      } catch (e) {
        console.error("signal handling error:", e);
      }
    };

    const connect = async () => {
      try {
        const { ok, data } = await api("/api/machine/control/start", { machine_id: machineId });
        if (!ok) throw new Error(data.error ?? "failed to start session");
        sessionRef.current = data.session_id;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.onicecandidate = (ev) => {
          if (ev.candidate) void sendSignal("ice", { candidate: ev.candidate.toJSON() });
        };
        pc.ontrack = (ev) => {
          if (videoRef.current) {
            videoRef.current.srcObject = ev.streams[0];
            setState("connected");
          }
        };
        pc.ondatachannel = (ev) => {
          dcRef.current = ev.channel;
        };

        const pollForOffer = async () => {
          if (cancelled) return;
          const { ok: ok2, data: d2 } = await api(
            `/api/machine/control/poll?session_id=${sessionRef.current}`,
          );
          if (ok2) {
            for (const msg of d2.messages as SignalMessage[]) {
              await handleSignal(msg, pc);
            }
          }
          pollTimer = setTimeout(pollForOffer, 500);
        };
        void pollForOffer();
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
    };
  }, [machineId, api, sendSignal, onClose]);

  // ── input capture (mouse + keyboard) ────────────────────────────
  const onMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    sendInput({
      type: "move",
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };
  const onMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
    sendInput({
      type: "click",
      button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
    });
  };
  const onWheel = (e: React.WheelEvent<HTMLVideoElement>) => {
    sendInput({ type: "scroll", dx: e.deltaX, dy: e.deltaY });
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLVideoElement>) => {
    if (e.key.length === 1) sendInput({ type: "type", text: e.key });
    else sendInput({ type: "key", key: e.key });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      <div className="relative w-full max-w-6xl aspect-video bg-black rounded-lg overflow-hidden">
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <span className="text-sm font-medium text-white/90">{machineName}</span>
          {state === "connecting" && (
            <span className="flex items-center gap-1 text-xs text-white/60">
              <Loader2 className="h-3 w-3 animate-spin" /> connecting…
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full bg-white/10 hover:bg-white/20 p-1.5 text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <MonitorOff className="h-10 w-10 mb-3 text-white/60" />
            <p className="text-sm font-medium">Connection failed</p>
            <p className="text-xs text-white/60 mt-1 max-w-md text-center">{error}</p>
            <Button variant="outline" className="mt-4" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            tabIndex={0}
          />
        )}
      </div>
    </div>
  );
}
