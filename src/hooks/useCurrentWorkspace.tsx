import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Derive a workspace ID from an agent UUID that is visibly distinct
 * from the agent ID itself. Stable + deterministic — no DB write needed.
 * Example: agent "659cdca2-045d-46b5-af04-5f6a7ffe40b3" → "ws_5f6a7ffe40b3"
 */
export function workspaceIdForAgent(agentId: string): string {
  const compact = (agentId || "").replace(/-/g, "");
  return `ws_${compact.slice(-12) || compact || "unknown"}`;
}

export type CurrentWorkspace = {
  id: string;          // e.g. "user:<uid>" or "ws_<shortid>"
  name: string;        // display name
  subtitle?: string;   // e.g. "main" or workspace ID
  kind: "user" | "agent";
  short?: string;      // 1–3 char placeholder for logo/avatar (e.g. "Sam")
  agentId?: string;    // full agent UUID when kind === "agent" (drives data scoping)
};

const KEY = "memorify:current_workspace";
const EVT = "memorify:workspace-changed";

function sameWorkspace(a: CurrentWorkspace | null, b: CurrentWorkspace | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.subtitle === b.subtitle &&
    a.kind === b.kind &&
    a.short === b.short &&
    a.agentId === b.agentId
  );
}

export function readCurrentWorkspace(): CurrentWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentWorkspace) : null;
  } catch {
    return null;
  }
}

function writeLocal(ws: CurrentWorkspace | null) {
  if (typeof window === "undefined") return;
  const current = readCurrentWorkspace();
  if (sameWorkspace(current, ws)) return;
  if (ws) localStorage.setItem(KEY, JSON.stringify(ws));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
}

let remoteWorkspacePromise: Promise<CurrentWorkspace | null> | null = null;
let remoteWorkspaceUserId: string | null = null;

async function loadRemoteWorkspace() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    remoteWorkspacePromise = null;
    remoteWorkspaceUserId = null;
    return null;
  }

  if (remoteWorkspacePromise && remoteWorkspaceUserId === user.id) {
    return remoteWorkspacePromise;
  }

  remoteWorkspaceUserId = user.id;
  remoteWorkspacePromise = (async () => {
    const { data } = await supabase
      .from("profiles")
      .select("current_workspace_id, current_workspace_name, current_workspace_kind, current_workspace_subtitle, current_workspace_agent_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data?.current_workspace_id) return null;

    return {
      id: data.current_workspace_id,
      name: data.current_workspace_name ?? "Workspace",
      kind: (data.current_workspace_kind as "user" | "agent") ?? "user",
      subtitle: data.current_workspace_subtitle ?? undefined,
      agentId: (data as any).current_workspace_agent_id ?? undefined,
    } satisfies CurrentWorkspace;
  })();

  return remoteWorkspacePromise;
}

async function persistRemote(ws: CurrentWorkspace | null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        current_workspace_id: ws?.id ?? null,
        current_workspace_name: ws?.name ?? null,
        current_workspace_kind: ws?.kind ?? null,
        current_workspace_subtitle: ws?.subtitle ?? null,
        current_workspace_agent_id: ws?.agentId ?? null,
      } as any)
      .eq("user_id", user.id);
  } catch {
    /* ignore — local copy still works */
  }
}

export function setCurrentWorkspace(ws: CurrentWorkspace | null) {
  writeLocal(ws);
  void persistRemote(ws);
}

export function useCurrentWorkspace() {
  const [ws, setWs] = useState<CurrentWorkspace | null>(() => readCurrentWorkspace());

  // Listen for changes (this tab + other tabs)
  useEffect(() => {
    const handler = () => setWs(readCurrentWorkspace());
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // On mount, hydrate from backend so the choice survives across devices.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const remote = await loadRemoteWorkspace();
      if (cancelled || !remote) return;
      const local = readCurrentWorkspace();
      const merged = local ? { ...local, ...remote } : remote;
      if (!sameWorkspace(local, merged)) {
        writeLocal(merged);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((next: CurrentWorkspace | null) => {
    setCurrentWorkspace(next);
  }, []);

  return [ws, update] as const;
}
