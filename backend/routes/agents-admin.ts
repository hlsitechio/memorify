// routes/agents-admin.ts — Clerk session manages agent access_level (Settings → Roles)
// GET  /api/agents?workspace_id=org_...
// PATCH /api/agents  { agent_id, access_level, workspace_id }
// SECURITY: Clerk JWT required; agent must belong to claimed workspace; membership checked lightly via org_id claim when present.

import { json } from "../lib/cors.ts";
import { verifyClerkJwt, extractBearer } from "../lib/clerk.ts";
import {
  listWorkspaceAgents,
  setAgentAccessLevel,
} from "../lib/agent-token.ts";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_HELP,
  isAccessLevel,
  type AccessLevel,
} from "../lib/agent-access.ts";
import { execute, query, queryOne } from "../lib/db.ts";

export async function handleAgentsAdmin(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ error: "missing_bearer" }, 401);

  let claims: Awaited<ReturnType<typeof verifyClerkJwt>>;
  try {
    claims = await verifyClerkJwt(token);
  } catch (e) {
    return json({ error: "invalid_token", detail: String((e as Error).message) }, 401);
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const workspaceId =
      url.searchParams.get("workspace_id") || claims.org_id || "";
    if (!workspaceId) {
      return json({ error: "workspace_id_required" }, 400);
    }
    // If JWT has org_id, it must match (prevent cross-org listing)
    if (claims.org_id && claims.org_id !== workspaceId) {
      return json({ error: "org_mismatch" }, 403);
    }

    const agents = await listWorkspaceAgents(workspaceId);

    // OAuth clients bound to this workspace (client_id is not a secret —
    // safe to surface in the dashboard so users can copy it into clients
    // like Gemini that need manual Client ID + Secret entry).
    const oauthClients = await query<{ client_id: string; name: string }>(
      `SELECT client_id, name FROM mcp_oauth_clients
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId],
    );

    return json({
      workspace_id: workspaceId,
      user_id: claims.sub,
      access_levels: ACCESS_LEVELS,
      help: ACCESS_LEVEL_HELP,
      agents,
      oauth_clients: oauthClients,
    });
  }

  if (req.method === "PATCH") {
    let body: {
      agent_id?: string;
      workspace_id?: string;
      access_level?: string;
    } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const agentId = body.agent_id ?? "";
    const workspaceId = body.workspace_id || claims.org_id || "";
    const level = body.access_level ?? "";

    if (!agentId || !workspaceId) {
      return json({ error: "agent_id_and_workspace_id_required" }, 400);
    }
    if (!isAccessLevel(level)) {
      return json({
        error: "invalid_access_level",
        allowed: ACCESS_LEVELS,
      }, 400);
    }
    if (claims.org_id && claims.org_id !== workspaceId) {
      return json({ error: "org_mismatch" }, 403);
    }

    // Confirm agent belongs to workspace
    const row = await queryOne<{ id: string; name: string; access_level: string }>(
      `SELECT id, name, access_level FROM agents
       WHERE id = $1 AND workspace_id = $2`,
      [agentId, workspaceId],
    );
    if (!row) return json({ error: "agent_not_found" }, 404);

    const ok = await setAgentAccessLevel(
      agentId,
      workspaceId,
      level as AccessLevel,
    );
    if (!ok) return json({ error: "update_failed" }, 500);

    // Audit for debugging
    await execute(
      `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
       VALUES ('agent.access_level', $1, $2, $3::jsonb)`,
      [
        claims.sub,
        workspaceId,
        JSON.stringify({
          agent_id: agentId,
          name: row.name,
          from: row.access_level,
          to: level,
        }),
      ],
    );

    return json({
      ok: true,
      agent_id: agentId,
      workspace_id: workspaceId,
      access_level: level,
      note: "Live — next /api/v1 call uses this level (no token re-mint needed)",
    });
  }

  return json({ error: "method_not_allowed" }, 405);
}
