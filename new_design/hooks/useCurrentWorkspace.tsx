import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrganization, useUser } from "@clerk/react";

/**
 * Derive a workspace ID from an agent UUID that is visibly distinct
 * from the agent ID itself. Stable + deterministic — no browser storage.
 * Example: agent "659cdca2-045d-46b5-af04-5f6a7ffe40b3" -> "ws_5f6a7ffe40b3"
 */
export function workspaceIdForAgent(agentId: string): string {
  const compact = (agentId || "").replace(/-/g, "");
  return `ws_${compact.slice(-12) || compact || "unknown"}`;
}

export type CurrentWorkspace = {
  id: string;
  name: string;
  subtitle?: string;
  kind: "org" | "agent";
  short?: string;
  agentId?: string;
};

const EVT = "memorify:workspace-changed";

let inMemoryWorkspace: CurrentWorkspace | null = null;

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
  return inMemoryWorkspace;
}

function writeMemory(ws: CurrentWorkspace | null) {
  if (sameWorkspace(inMemoryWorkspace, ws)) return;
  inMemoryWorkspace = ws;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
}

export function setCurrentWorkspace(ws: CurrentWorkspace | null) {
  writeMemory(ws);
}

export function useCurrentWorkspace() {
  const { organization } = useOrganization();
  const { user } = useUser();
  const [ws, setWs] = useState<CurrentWorkspace | null>(() => readCurrentWorkspace());

  const orgWorkspace = useMemo<CurrentWorkspace | null>(() => {
    if (!organization) return null;
    return {
      id: organization.id,
      name: organization.name || "Workspace",
      subtitle: organization.slug || organization.id,
      kind: "org",
      short: (organization.name || user?.primaryEmailAddress?.emailAddress || "M").slice(0, 2).toUpperCase(),
    };
  }, [organization, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    const handler = () => setWs(readCurrentWorkspace());
    window.addEventListener(EVT, handler);
    return () => window.removeEventListener(EVT, handler);
  }, []);

  const update = useCallback((next: CurrentWorkspace | null) => {
    setCurrentWorkspace(next);
  }, []);

  return [ws ?? orgWorkspace, update] as const;
}
