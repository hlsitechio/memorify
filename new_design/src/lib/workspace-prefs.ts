// Per-workspace dashboard preferences (layout + visible widgets + accent).
// Stored in-memory only. Backend persistence will be wired via /api/copilot/action
// when the workspace.prefs command is available.

import type { HSL } from "./theme";
import { applyAccent, resetAccent as resetAccentVars } from "./theme";

export type StoredLayoutItem = { i: string; x: number; y: number; w: number; h: number };
export type WorkspacePrefs = {
  layout: StoredLayoutItem[];
  visible_ids: string[];
  accent: HSL | null;
};

const prefsCache = new Map<string, WorkspacePrefs>();

export function readPrefsCache(workspaceId: string): WorkspacePrefs | null {
  return prefsCache.get(workspaceId) ?? null;
}

function writePrefsCache(workspaceId: string, prefs: WorkspacePrefs) {
  prefsCache.set(workspaceId, prefs);
}

export async function loadPrefs(workspaceId: string): Promise<WorkspacePrefs | null> {
  return readPrefsCache(workspaceId);
}

export function savePrefs(workspaceId: string, patch: Partial<WorkspacePrefs>, _debounceMs = 600) {
  const merged = { ...(readPrefsCache(workspaceId) ?? { layout: [], visible_ids: [], accent: null }), ...patch };
  writePrefsCache(workspaceId, merged);
}

export function applyWorkspaceAccent(accent: HSL | null) {
  if (accent) applyAccent(accent);
  else resetAccentVars();
}