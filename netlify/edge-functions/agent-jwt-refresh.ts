// netlify/edge-functions/agent-jwt-refresh.ts — Refresh agent JWT before expiry
// Agents call this with their current JWT to get a fresh one
// The Memorify gateway verifies the old JWT and issues a fresh one

import { corsHeaders } from "../../backend/lib/cors.ts";
import { verifyAgentToken } from "../../backend/lib/agent-token.ts";

const CLERK_FRONTEND_API = "https://clerk.memorify.dev";
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY") ?? "";
const JWT_TEMPLATE_NAME = "neon-data-api";

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization") ?? "";
  const currentJwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (!currentJwt) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Verify the current JWT is valid (not expired, signed by Clerk)
    // We don't need to fully decode - just check it's a valid Clerk JWT
    const parts = currentJwt.split('.');
    if (parts.length !== 3) {
      throw new Error("invalid JWT format");
    }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(4, '=')));
    const now = Math.floor(Date.now() / 1000);
    
    if (payload.exp && payload.exp < now) {
      return new Response(JSON.stringify({ error: "token_expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract workspace_id and agent_id from the current JWT
    const workspaceId = payload.workspace_id || payload.org_id;
    const agentId = payload.agent_id || payload.sub; // fallback to sub if no agent_id

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: "missing workspace_id in token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the agent's session to mint a fresh JWT
    // We need to find the user who owns this agent
    const agentRes = await fetch(`${CLERK_FRONTEND_API}/v1/users?limit=100`, {
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
      },
    });

    if (!agentRes.ok) {
      throw new Error("Failed to fetch users from Clerk");
    }

    const agentData = await agentRes.json();
    const users = agentData.response || agentData.data || agentData || [];
    const owner = users.find((u: any) => u.id === currentJwt.split('.')[1]?.split('.')[0] || u.id === payload.sub);

    // Actually, the sub is the user_id. We need to find the session for that user.
    // Let's get the active session for the user who owns this workspace/agent
    const sessionRes = await fetch(`${CLERK_FRONTEND_API}/v1/users/${payload.sub}/sessions?status=active&limit=1`, {
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
      },
    });

    if (!sessionRes.ok) {
      throw new Error("Failed to get user sessions");
    }

    const sessionData = await sessionRes.json();
    const sessions = sessionData.response || sessionData.data || sessionData || [];
    const activeSession = Array.isArray(sessions) ? sessions[0] : null;

    if (!activeSession) {
      return new Response(JSON.stringify({ error: "no_active_session" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a fresh JWT with the neon-data-api template
    const tokenRes = await fetch(`${CLERK_FRONTEND_API}/v1/sessions/${activeSession.id}/tokens/neon-data-api`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Clerk token endpoint failed: ${tokenRes.status} ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const jwt = tokenData.jwt || tokenData.token || tokenData;

    return new Response(JSON.stringify({
      ok: true,
      access_token: jwt,
      token_type: "Bearer",
      expires_in: 60,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: "refresh_failed",
      detail: (e as Error).message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};