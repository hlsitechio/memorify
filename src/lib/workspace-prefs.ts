// Per-workspace dashboard preferences (layout + visible widgets + accent).
// Source of truth = `workspace_prefs` table. localStorage acts as a cache so
// the UI paints instantly while the network round-trips.

import { supabase } from "@/integrations/supabase/client";
import type { HSL } from "./theme";
import { applyAccent, resetAccent as resetAccentVars } from "./theme";

export type StoredLayoutItem = { i: string; x: number; y: number; w: number; h: number };
export type WorkspacePrefs = {
  layout: StoredLayoutItem[];
  visible_ids: string[];
  accent: HSL | null;
};

const cacheKey = (ws: string) => `memorify:ws_prefs:${ws}`;

export function readPrefsCache(workspaceId: string): WorkspacePrefs | null {
  try {
    const raw = localStorage.getItem(cacheKey(workspaceId));
    return raw ? (JSON.parse(raw) as WorkspacePrefs) : null;
  } catch { return null; }
}

function writePrefsCache(workspaceId: string, prefs: WorkspacePrefs) {
  try { localStorage.setItem(cacheKey(workspaceId), JSON.stringify(prefs)); } catch {}
}

export async function loadPrefs(workspaceId: string): Promise<WorkspacePrefs | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("workspace_prefs")
    .select("layout,visible_ids,accent")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  const prefs: WorkspacePrefs = {
    layout: (data.layout as StoredLayoutItem[]) ?? [],
    visible_ids: (data.visible_ids as string[]) ?? [],
    accent: (data.accent as HSL | null) ?? null,
  };
  writePrefsCache(workspaceId, prefs);
  return prefs;
}

// Coalesce rapid writes (drag/resize) into a single upsert.
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPatches = new Map<string, Partial<WorkspacePrefs>>();

export function savePrefs(workspaceId: string, patch: Partial<WorkspacePrefs>, debounceMs = 600) {
  // Update local cache immediately for resilience.
  const merged = { ...(readPrefsCache(workspaceId) ?? { layout: [], visible_ids: [], accent: null }), ...patch };
  writePrefsCache(workspaceId, merged);

  pendingPatches.set(workspaceId, { ...(pendingPatches.get(workspaceId) ?? {}), ...patch });
  const existing = pendingTimers.get(workspaceId);
  if (existing) clearTimeout(existing);
  pendingTimers.set(
    workspaceId,
    setTimeout(async () => {
      const body = pendingPatches.get(workspaceId) ?? {};
      pendingPatches.delete(workspaceId);
      pendingTimers.delete(workspaceId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("workspace_prefs").upsert(
          {
            user_id: user.id,
            workspace_id: workspaceId,
            ...body,
          },
          { onConflict: "user_id,workspace_id" }
        );
      } catch { /* offline — cache will eventually sync on next save */ }
    }, debounceMs)
  );
}

// Apply (or clear) the accent for a given workspace. Used both when
// the user switches workspace and when they pick a new color.
export function applyWorkspaceAccent(accent: HSL | null) {
  if (accent) applyAccent(accent);
  else resetAccentVars();
}
