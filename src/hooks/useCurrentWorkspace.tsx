import { useEffect, useState, useCallback } from "react";

export type CurrentWorkspace = {
  id: string;          // e.g. "user:<uid>" or "agent:<aid>"
  name: string;        // display name
  subtitle?: string;   // e.g. "main" or workspace ID
  kind: "user" | "agent";
};

const KEY = "synapse:current_workspace";
const EVT = "synapse:workspace-changed";

export function readCurrentWorkspace(): CurrentWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentWorkspace) : null;
  } catch {
    return null;
  }
}

export function setCurrentWorkspace(ws: CurrentWorkspace | null) {
  if (typeof window === "undefined") return;
  if (ws) localStorage.setItem(KEY, JSON.stringify(ws));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useCurrentWorkspace() {
  const [ws, setWs] = useState<CurrentWorkspace | null>(() => readCurrentWorkspace());
  useEffect(() => {
    const handler = () => setWs(readCurrentWorkspace());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  const update = useCallback((next: CurrentWorkspace | null) => {
    setCurrentWorkspace(next);
  }, []);
  return [ws, update] as const;
}
