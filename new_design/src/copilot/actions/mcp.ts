// MCP commands — EXCLUSIVE to the in-app Copilot.
//
// SECURITY POLICY:
// These commands are intentionally NOT exposed via memorify-mcp / agent-api /
// agent-gateway. External agents (Claude Code, Cursor, n8n, …) authenticate
// with an agent TOKEN — if such a token leaked, MCP configuration could be
// rewritten by an attacker. Configuration belongs to the human user inside
// the dashboard, going through copilot-action (user JWT + RLS + audit).
//
// External agents are limited to: list servers, list tools, call a tool on
// an already-enabled server (see agent-api's COPILOT_ONLY_ACTIONS deny-list).
//
// Client-scope handler:  mcp.flash (UI pulse, like plugins.flash)
// Server-scope handlers: in memorify/functions/copilot-action/index.ts

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/mcp", "/dashboard"];

export const mcpCommands: CommandDef[] = [
  /* ───────── servers ───────── */
  {
    name: "mcp.servers.list",
    description: "List the user's MCP servers (id, name, url, enabled, last_handshake_at, last_error).",
    scope: "server",
    routes: ROUTES,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "mcp.servers.get",
    description: "Get one MCP server with its cached tools.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "mcp.servers.add",
    description:
      "Add a new MCP server. URL must be https://. Use auth.bearer for token auth or auth.headers for custom headers. For OAuth servers, call mcp.oauth.start instead.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        url: { type: "string", description: "https:// URL of the MCP server" },
        transport: { type: "string", enum: ["http", "sse"], description: "Default 'http'." },
        auth: {
          type: "object",
          description: "{ bearer?: string, headers?: object }",
        },
        enabled: { type: "boolean", description: "Default true." },
        sync: { type: "boolean", description: "Run handshake immediately after add. Default true." },
      },
      required: ["name", "url"],
    },
  },
  {
    name: "mcp.servers.update",
    description: "Patch an MCP server's name/url/transport/auth.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        url: { type: "string" },
        transport: { type: "string", enum: ["http", "sse"] },
        auth: { type: "object" },
      },
      required: ["id"],
    },
  },
  {
    name: "mcp.servers.rename",
    description: "Rename an MCP server.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "mcp.servers.toggle",
    description: "Enable or disable an MCP server.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["id", "enabled"],
    },
  },
  {
    name: "mcp.servers.delete",
    description: "Permanently delete an MCP server and all its cached tools. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },

  /* ───────── tools ───────── */
  {
    name: "mcp.tools.list",
    description: "List cached MCP tools. Optional server_id filter.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        server_id: { type: "string" },
        enabled_only: { type: "boolean" },
      },
    },
  },
  {
    name: "mcp.tools.toggle",
    description: "Enable or disable a single MCP tool by id.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["id", "enabled"],
    },
  },

  /* ───────── runtime ───────── */
  {
    name: "mcp.sync",
    description: "Re-handshake a connected MCP server and refresh its tool catalog.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { server_id: { type: "string" } },
      required: ["server_id"],
    },
  },
  {
    name: "mcp.call",
    description:
      "Invoke a tool on a connected MCP server. Server and tool must both be enabled. Destructive for write tools — confirm with the user first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        server_id: { type: "string" },
        tool: { type: "string", description: "Tool name as returned by mcp.tools.list." },
        arguments: { type: "object" },
      },
      required: ["server_id", "tool"],
    },
  },
  {
    name: "mcp.oauth.start",
    description:
      "Begin OAuth flow for a new MCP server. Returns an auth URL the user opens in a new tab.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        url: { type: "string", description: "https:// MCP server URL" },
        provider: { type: "string", description: "Preset/provider id, e.g. notion or linearmcp." },
        server_name: { type: "string", description: "Display name for the MCP server." },
        server_url: { type: "string", description: "https:// MCP server URL from the preset." },
        transport: { type: "string", enum: ["http", "sse"] },
      },
      required: [],
    },
  },

  /* ───────── UI helpers (client-scope) ───────── */
  {
    name: "mcp.flash",
    description: "Briefly highlight an MCP server row in the dashboard UI so the user can spot it.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      if (!args?.id) return { ok: false, error: "id required" };
      ctx.flash(`mcp:${args.id}`);
      return { ok: true };
    },
  },
];
