// Plugins commands. Client-scope: flash (UI pulse). Server-scope: CRUD.
// Server handlers live in memorify/functions/copilot-action/index.ts;
// this file only declares the manifest.

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/plugins", "/dashboard"];

export const pluginCommands: CommandDef[] = [
  {
    name: "apps.list",
    description: "List one-click apps that can be connected as OAuth connectors, token MCP servers, or public MCP servers.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string" },
        category: { type: "string" },
      },
    },
  },
  {
    name: "apps.connect",
    description: "Connect an app by slug. OAuth apps return authorize_url; token MCP apps return token_required until a token is provided; public MCP apps sync immediately.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        token: { type: "string", description: "Only provide for token-based MCP apps. Never echo it back to the user." },
        name: { type: "string" },
      },
      required: ["slug"],
    },
  },
  {
    name: "plugins.list",
    description: "List the user's plugins ordered by position.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "plugins.add",
    description:
      "Create a plugin row. Use kind=http for an arbitrary HTTP webhook plugin (config.url is required).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["http", "skill", "mcp_tool", "connector"] },
        ref_id: { type: "string", description: "Optional FK for non-http kinds." },
        config: { type: "object", description: "Free-form config; for http use { url, method, headers }." },
        enabled: { type: "boolean" },
      },
      required: ["name", "kind"],
    },
  },
  {
    name: "plugins.update_config",
    description: "Patch a plugin's config jsonb.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, config: { type: "object" } },
      required: ["id", "config"],
    },
  },
  {
    name: "plugins.rename",
    description: "Rename a plugin.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
    },
  },
  {
    name: "plugins.toggle",
    description: "Enable or disable a plugin.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, enabled: { type: "boolean" } },
      required: ["id", "enabled"],
    },
  },
  {
    name: "plugins.reorder",
    description:
      "Reorder plugins by id list — position is the index in the array (0 = top).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "plugins.move_to_top",
    description: "Move a plugin to position 0 (top of the list).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "plugins.delete",
    description: "Delete a plugin permanently. Destructive — confirm with the user first.",
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
    name: "plugins.library.list",
    description: "List installable plugin templates such as Slack, GitHub, Stripe, Notion, AI providers, and automation webhooks.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string" },
        category: { type: "string" },
      },
    },
  },
  {
    name: "plugins.library.install",
    description: "Install a plugin template by slug. Config uses Vault reference placeholders, never raw secret values.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        slug: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["slug"],
    },
  },
  {
    name: "plugins.library.uninstall",
    description: "Uninstall a plugin template by slug. Destructive — confirm with the user first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "plugins.flash",
    description: "Briefly highlight a plugin row in the UI so the user can spot it.",
    scope: "client",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: ({ id }, ctx) => {
      ctx.flash(`plugin:${id}`);
      return { ok: true };
    },
  },
];
