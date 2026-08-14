// Agent + Workspace commands. All server-scope (DB-backed, audited).
// Handlers live in memorify/functions/copilot-action/index.ts.

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/agents", "/dashboard"];

export const agentCommands: CommandDef[] = [
  /* ─────────── AI Agent ─────────── */
  {
    name: "agents.list",
    description: "List the user's AI agents (id, name, kind, status, workspace_name).",
    scope: "server",
    routes: ROUTES,
    parameters: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "agents.new",
    description:
      "Create a new AI agent and mint its first token. Sensitive: token is shown once.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["claude_code", "custom"] },
      },
    },
  },
  {
    name: "agents.disconnect",
    description: "Disconnect/revoke an agent row. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "agents.bootstrap",
    description: "Return an agent/workspace context bundle: agent, memories, skills, documents, and events.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "agents.tokens.list",
    description: "List agent token metadata for this workspace. Does not return token secrets.",
    scope: "server",
    routes: ROUTES,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "agents.tokens.mint",
    description: "Mint a new token for an existing connected agent. Sensitive: token is shown once.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      required: ["agent_id"],
      properties: { agent_id: { type: "string" } },
    },
  },
  {
    name: "agents.tokens.revoke",
    description: "Revoke an agent token by jti or jti prefix. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { jti: { type: "string" }, prefix: { type: "string" } },
    },
  },
  {
    name: "agents.rename",
    description: "Change an AI agent's name.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "agents.reset_name",
    description:
      "Reset an AI agent's name back to its default (based on kind, e.g. 'Claude Code').",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },

  /* ─────────── Workspace (per agent) ─────────── */
  {
    name: "workspace.set_name",
    description:
      "Add or change the workspace display name for an agent. Stored in agent.metadata.workspace_name. The workspace ID (agent:<id>) is immutable.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "workspace.rename",
    description: "Alias of workspace.set_name — change an existing workspace display name.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "workspace.delete_name",
    description:
      "Delete the workspace display name (clears metadata.workspace_name). The agent keeps its workspace ID agent:<id>.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "workspace.reset",
    description:
      "Reset the workspace back to its default identity: clears the display name so it falls back to the immutable workspace ID agent:<id>.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];
