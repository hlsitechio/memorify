// lib/memorify-api.ts — Clerk-authenticated API client for Memorify Chrome extension.
// Uses @clerk/chrome-extension createClerkClient to get JWT tokens,
// then calls /api/copilot/action with that token.

import { createClerkClient } from "@clerk/chrome-extension/client";

const PUBLISHABLE_KEY = "pk_live_Y2xlcmsubWVtb3JpZnkuZGV2JA";
const SYNC_HOST = "https://memorify.dev";
const MEMORIFY_API = "https://memorify.dev/api/copilot/action";

let _clerk: any = null;

async function getClerk() {
  if (_clerk) return _clerk;
  _clerk = createClerkClient({
    publishableKey: PUBLISHABLE_KEY,
    syncHost: SYNC_HOST,
    background: true,
  });
  await _clerk.load();
  return _clerk;
}

async function getToken(): Promise<string | null> {
  try {
    const clerk = await getClerk();
    if (!clerk.session) return null;
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

export async function apiAction(
  name: string,
  args: Record<string, unknown> = {},
  workspaceId?: string,
): Promise<{ data: any; error: string | null }> {
  try {
    const token = await getToken();
    if (!token) return { data: null, error: "Not authenticated — sign in at memorify.dev first" };

    const res = await fetch(MEMORIFY_API, {
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
    if (!json.ok) return { data: null, error: json.error ?? "Unknown error" };
    return { data: json.data ?? null, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function checkAuth(): Promise<{
  authenticated: boolean;
  user: { id: string; email: string; name: string } | null;
  org: { id: string; name: string } | null;
}> {
  try {
    const clerk = await getClerk();
    if (!clerk.session) return { authenticated: false, user: null, org: null };

    const user = clerk.user;
    if (!user) return { authenticated: false, user: null, org: null };

    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const name = (user.fullName || user.firstName || user.username || email) as string;
    const org = clerk.organization;
    return {
      authenticated: true,
      user: { id: user.id, email, name },
      org: org ? { id: org.id, name: org.name } : null,
    };
  } catch {
    return { authenticated: false, user: null, org: null };
  }
}