/**
 * api.ts — Clerk-authenticated API client for Memorify dashboard.
 * Replaces the dead Supabase stub (src/integrations/memorify/client.ts).
 *
 * All dashboard data calls go through /api/copilot/action with the Clerk
 * session token. The backend (copilot.ts) verifies the Clerk JWT, resolves
 * the workspace from the user's org membership, and dispatches to Neon.
 *
 * Usage:
 *   import { api } from "@/lib/api";
 *   const { data, error } = await api.action("memory.list", { namespace: "agent:..." });
 *   const { data, error } = await api.action("memory.add", { content: "..." });
 */

import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@clerk/react";
import { readCurrentWorkspace, useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { useCallback } from "react";

const API_URL = "/api/copilot/action";

export type ApiResult<T = unknown> = {
  data: T | null;
  error: string | null;
};

export type ApiFunction = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<ApiResult>;

/**
 * useApi — hook that returns an authenticated `action()` caller.
 * Uses the Clerk session token + current workspace from context.
 */
export function useApi(): { action: ApiFunction } {
  const { session, user } = useAuth();
  const { organization } = useOrganization();
  const [currentWs] = useCurrentWorkspace();

  const action = useCallback(
    async (name: string, args: Record<string, unknown> = {}): Promise<ApiResult> => {
      try {
        const token = await session?.getToken?.();
        if (!token) return { data: null, error: "Not authenticated" };

        const wsId = currentWs?.kind === "org" 
          ? currentWs.id 
          : (organization?.id || (user ? `user:${user.id}` : undefined));

        const finalArgs = { ...args };
        if (currentWs?.kind === "agent" && currentWs.agentId && !finalArgs.namespace) {
          finalArgs.namespace = `agent:${currentWs.agentId}`;
        }

        const res = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            args: finalArgs,
            workspace_id: wsId,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return { data: null, error: `HTTP ${res.status}: ${text}` };
        }

        const json = await res.json();
        if (!json.ok) {
          return { data: null, error: json.error ?? "Unknown error" };
        }

        return { data: json.data ?? null, error: null };
      } catch (e) {
        return { data: null, error: (e as Error).message };
      }
    },
    [session, currentWs?.id, organization?.id, user?.id],
  );

  return { action };
}

/**
 * Raw action call for non-React contexts (utilities, event handlers).
 * Pass a getToken function and optional workspace_id.
 */
export async function apiAction(
  getToken: () => Promise<string | null>,
  name: string,
  args: Record<string, unknown> = {},
  workspaceId?: string,
): Promise<ApiResult> {
  try {
    const token = await getToken();
    if (!token) return { data: null, error: "Not authenticated" };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        args,
        workspace_id: workspaceId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { data: null, error: `HTTP ${res.status}: ${text}` };
    }

    const json = await res.json();
    if (!json.ok) {
      return { data: null, error: json.error ?? "Unknown error" };
    }

    return { data: json.data ?? null, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}