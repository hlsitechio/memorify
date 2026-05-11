import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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

function writeLocal(ws: CurrentWorkspace | null) {
  if (typeof window === "undefined") return;
  if (ws) localStorage.setItem(KEY, JSON.stringify(ws));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVT));
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
      })
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("current_workspace_id, current_workspace_name, current_workspace_kind, current_workspace_subtitle")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data?.current_workspace_id) return;
      const remote: CurrentWorkspace = {
        id: data.current_workspace_id,
        name: data.current_workspace_name ?? "Workspace",
        kind: (data.current_workspace_kind as "user" | "agent") ?? "user",
        subtitle: data.current_workspace_subtitle ?? undefined,
      };
      // Only override local if it differs (avoid clobbering an in-flight choice).
      const local = readCurrentWorkspace();
      if (!local || local.id !== remote.id) {
        writeLocal(remote);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((next: CurrentWorkspace | null) => {
    setCurrentWorkspace(next);
  }, []);

  return [ws, update] as const;
}
