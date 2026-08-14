// netlify/edge-functions/agent-jwt.ts — Mints short-lived Clerk JWTs for AI agents
// The agent authenticates with its mem_live_ token → we verify it's authorized →
// we request a Clerk session token with the neon-data-api JWT template → return it (60s expiry)
// The agent uses this JWT to call the Neon Data API directly (RLS enforced)

import { corsHeaders } from "../../backend/lib/cors.ts";
import { verifyAgentToken } from "../../backend/lib/agent-token.ts";
import { queryOne } from "../../backend/lib/db.ts";

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

  // Agent authenticates with its mem_live_ bearer token
  const auth = req.headers.get("authorization") ?? "";
  const agentToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (!agentToken) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify the agent token
  const agentPayload = await verifyAgentToken(agentToken);
  if (!agentPayload) {
    return new Response(JSON.stringify({ error: "invalid or revoked token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up the agent + the user who created it
  const agent = await queryOne<{
    id: string;
    workspace_id: string;
    user_id: string;
    name: string;
    role: string;
    status: string;
  }>(
    `SELECT a.id, a.workspace_id, a.user_id, a.name, a.role, a.status
     FROM agents a
     WHERE a.id = $1 AND a.workspace_id = $2 AND a.status != 'disconnected'`,
    [agentPayload.agent_id, agentPayload.workspace_id],
  );

  if (!agent) {
    return new Response(JSON.stringify({ error: "agent_not_found_or_disconnected" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up the Clerk user who created this agent — we need their Clerk session
  // to mint a JWT with the neon-data-api template
  // The Clerk session token API requires a session ID, but for machine-to-machine
  // we use the Clerk Backend API to create a token for the user

  // Use Clerk Backend API to create a session token for the user
  // with the neon-data-api JWT template (includes org_id = workspace_id)
  try {
    // First, get the user's active sessions
    const sessionsRes = await fetch(`${CLERK_FRONTEND_API}/v1/users/${agent.user_id}/sessions?limit=1&status=active`, {
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!sessionsRes.ok) {
      const errText = await sessionsRes.text();
      return new Response(JSON.stringify({
        error: "clerk_session_error",
        detail: `Could not get user sessions: ${sessionsRes.status}`,
        hint: "The user who created this agent must have an active Clerk session",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionsData = await sessionsRes.json();
    const sessions = sessionsData.response || sessionsData.data || sessionsData || [];
    const activeSession = Array.isArray(sessions) ? sessions.find((s: any) => s.status === "active") : null;

    if (!activeSession) {
      return new Response(JSON.stringify({
        error: "no_active_session",
        detail: "The user who created this agent has no active Clerk session",
        hint: "User must be logged in to memorify.dev for agents to access the Data API",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a JWT for this session using the neon-data-api template
    const tokenRes = await fetch(`${CLERK_FRONTEND_API}/v1/sessions/${activeSession.id}/tokens/${JWT_TEMPLATE_NAME}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return new Response(JSON.stringify({
        error: "token_mint_failed",
        detail: `Clerk token endpoint returned ${tokenRes.status}`,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenRes.json();
    const jwt = tokenData.jwt || tokenData.token || tokenData;

    // Return the short-lived JWT to the agent
    // The agent uses this to call the Neon Data API directly
    return new Response(JSON.stringify({
      ok: true,
      access_token: jwt,
      token_type: "Bearer",
      expires_in: 60, // 60 seconds
      data_api_url: `https://ep-patient-fog-ay2gr5np.apirest.us-east-2.aws.neon.tech/neondb/rest/v1`,
      workspace_id: agent.workspace_id,
      agent_id: agent.id,
      agent_role: agent.role,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: "token_mint_error",
      detail: (e as Error).message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};