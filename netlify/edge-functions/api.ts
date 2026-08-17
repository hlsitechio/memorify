// Netlify Edge Function — Memorify API gateway
// Uses shared backend route handlers that are Edge/Deno compatible.
import { handleBootstrap } from "../../backend/routes/bootstrap.ts";
import { handleAgentsAdmin } from "../../backend/routes/agents-admin.ts";
import { handleCopilotAction, handleCopilotChat, handleCopilotModels, handleCopilotModelStatus, handleCopilotSettings, handleCopilotUpload, handleGitHubOAuthCallback, handleMcpOAuthCallback } from "../../backend/routes/copilot.ts";
import { handleV1 } from "../../backend/routes/v1.ts";
import { handleStripeWebhook } from "../../backend/routes/connectors.ts";
import { handleUptime } from "../../backend/routes/uptime.ts";
import { handleHealth } from "../../backend/routes/health.ts";
import { handleUptimeRobotWebhook } from "../../backend/routes/webhooks.ts";
import { handleShapeQuery } from "../../backend/routes/shape-query.ts";

const API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function api_getDsn(): string {
  let dsn = Deno.env.get("NEON_DATABASE_URL") ?? "";
  dsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");
  return dsn;
}

function api_json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...API_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: API_CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/health" || path === "/health" || path === "/api/health/db") {
    return handleHealth(req);
  }

  if (path === "/api/webhooks/uptimerobot" || path === "/api/uptime/webhook") {
    return handleUptimeRobotWebhook(req);
  }

  if (path === "/api/bootstrap") {
    return handleBootstrap(req);
  }

  if (path === "/api/uptime") {
    return handleUptime(req);
  }

  if (path === "/api/agents" || path.startsWith("/api/agents/")) {
    return handleAgentsAdmin(req);
  }

  if (path === "/api/copilot/chat") {
    return handleCopilotChat(req);
  }

  if (path === "/api/copilot/action") {
    return handleCopilotAction(req);
  }

  if (path === "/api/copilot/settings") {
    return handleCopilotSettings(req);
  }

  if (path === "/api/copilot/models") {
    return handleCopilotModels(req);
  }

  if (path === "/api/copilot/model-status") {
    return handleCopilotModelStatus(req);
  }

  if (path === "/api/copilot/upload") {
    return handleCopilotUpload(req);
  }

  if (path === "/api/oauth/github/callback") {
    return handleGitHubOAuthCallback(req);
  }

  if (path === "/api/mcp/oauth/callback") {
    return handleMcpOAuthCallback(req);
  }

  if (path === "/api/stripe/webhook") {
    // Get workspace from auth header or query
    const auth = req.headers.get("authorization");
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId && !auth) {
      return api_json({ error: "workspace_id required" }, 400);
    }
    // For now, we'll get workspace from auth - in production this should extract from JWT
    const ws = workspaceId || "default";
    return handleStripeWebhook(req, ws);
  }

  if (path === "/api/migrate-embeddings") {
    const { default: handler } = await import("./migrate-embeddings.ts");
    return handler(req);
  }

  if (path === "/api/shape/query") {
    return handleShapeQuery(req);
  }

  if (path === "/api/v1" || path === "/v1" || path === "/api") {
    return handleV1(req);
  }

  return api_json({ error: "not found", path }, 404);
}
