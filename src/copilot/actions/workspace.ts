import type { CommandDef, JsonSchema } from "../types";

function schema(properties: Record<string, any> = {}, required: string[] = []): JsonSchema {
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

function cmd(
  name: string,
  description: string,
  routes: string[],
  properties: Record<string, any> = {},
  required: string[] = [],
  destructive = false,
): CommandDef {
  return {
    name,
    description,
    scope: "server",
    routes,
    destructive,
    parameters: schema(properties, required),
  };
}

const id = { type: "string" };
const name = { type: "string" };
const limit = { type: "number" };
const q = { type: "string" };
const config = { type: "object" };
const metadata = { type: "object" };
const tags = { type: "array", items: { type: "string" } };
const enabled = { type: "boolean" };

export const workspaceCommands: CommandDef[] = [
  cmd("home.summary", "Return a workspace dashboard summary with counts and recent activity.", ["/dashboard"], { limit }),
  cmd("home.quickstart_status", "Return setup gaps for memory, agents, MCP, plugins, connectors, and Copilot.", ["/dashboard"]),

  cmd("build.status", "Return safe build/runtime readiness for this Memorify workspace.", ["/dashboard", "/dashboard/docs"]),
  cmd("build.checks.list", "List available non-destructive validation checks.", ["/dashboard", "/dashboard/docs"]),
  cmd("build.checks.run", "Run safe non-destructive app checks.", ["/dashboard", "/dashboard/docs"], { checks: { type: "array", items: { type: "string" } } }),
  cmd("build.deploy_status", "Return deployment/config readiness known to the backend.", ["/dashboard", "/dashboard/docs"]),

  cmd("skills.list", "List workspace skills.", ["/dashboard/skills", "/dashboard"], { q, status: { type: "string" }, limit }),
  cmd("skills.get", "Get a skill by id or slug.", ["/dashboard/skills", "/dashboard"], { id, slug: { type: "string" } }),
  cmd("skills.create", "Create a reusable prompt skill.", ["/dashboard/skills", "/dashboard"], {
    name, description: { type: "string" }, prompt: { type: "string" }, model: { type: "string" }, status: { type: "string", enum: ["draft", "live"] }, schema: config,
  }, ["name", "prompt"]),
  cmd("skills.update", "Patch a skill.", ["/dashboard/skills", "/dashboard"], {
    id, name, description: { type: "string" }, prompt: { type: "string" }, model: { type: "string" }, status: { type: "string", enum: ["draft", "live"] }, schema: config,
  }, ["id"]),
  cmd("skills.rename", "Rename a skill and update its slug.", ["/dashboard/skills", "/dashboard"], { id, name }, ["id", "name"]),
  cmd("skills.publish", "Publish a skill.", ["/dashboard/skills", "/dashboard"], { id }, ["id"]),
  cmd("skills.unpublish", "Move a skill back to draft.", ["/dashboard/skills", "/dashboard"], { id }, ["id"]),
  cmd("skills.run", "Return the skill prompt/model with provided input so Copilot can run it.", ["/dashboard/skills", "/dashboard"], { id, slug: { type: "string" }, input: {}, model: { type: "string" } }),
  cmd("skills.delete", "Delete a skill.", ["/dashboard/skills", "/dashboard"], { id }, ["id"], true),
  cmd("skills.import_url", "Register a skill import request from an HTTPS URL.", ["/dashboard/skills", "/dashboard"], { url: { type: "string" }, name, workspace_id: { type: "string" } }, ["url"]),
  cmd("skills.add_to_plugins", "Install a skill as a plugin.", ["/dashboard/skills", "/dashboard/plugins"], { id }, ["id"]),

  cmd("connectors.list", "List connectors.", ["/dashboard/connectors", "/dashboard"], { q, kind: { type: "string" }, status: { type: "string" }, limit }),
  cmd("connectors.get", "Get one connector with redacted config.", ["/dashboard/connectors", "/dashboard"], { id }, ["id"]),
  cmd("connectors.add", "Create a connector. Config may reference vault secrets as {{vault.NAME}}.", ["/dashboard/connectors", "/dashboard"], { name, kind: { type: "string" }, status: { type: "string" }, config }, ["name", "kind"]),
  cmd("connectors.update_config", "Patch a connector config.", ["/dashboard/connectors", "/dashboard"], { id, config }, ["id", "config"]),
  cmd("connectors.rename", "Rename a connector.", ["/dashboard/connectors", "/dashboard"], { id, name }, ["id", "name"]),
  cmd("connectors.toggle", "Set connector status active or inactive.", ["/dashboard/connectors", "/dashboard"], { id, active: { type: "boolean" }, status: { type: "string" } }, ["id"]),
  cmd("connectors.delete", "Delete a connector.", ["/dashboard/connectors", "/dashboard"], { id }, ["id"], true),
  cmd("connectors.test", "Run a safe connector readiness check without returning secrets.", ["/dashboard/connectors", "/dashboard"], { id }, ["id"]),
  cmd("connectors.sync", "Record a connector sync request.", ["/dashboard/connectors", "/dashboard"], { id }, ["id"]),
  cmd("connectors.oauth.start", "Begin connector OAuth setup if the connector supports it.", ["/dashboard/connectors", "/dashboard"], { name, kind: { type: "string" }, callback_url: { type: "string" } }, ["name", "kind"]),

  cmd("workspace.credits", "Return the workspace memory-credit balance (from one-time pack purchases) and recent purchase history.", ["/dashboard", "/dashboard/settings", "/dashboard/docs"]),

  cmd("knowledge.search", "Search memories, documents, voices, images, and skills.", ["/dashboard", "/dashboard/memory", "/dashboard/documents"], { q, limit }, ["q"]),
  cmd("knowledge.rehydrate", "Return a compact context bundle for the workspace.", ["/dashboard"], { limit }),
  cmd("knowledge.related", "Find items related to a memory/document/skill id.", ["/dashboard"], { id, type: { type: "string" }, limit }, ["id"]),
  cmd("knowledge.summary", "Return counts and recent items across knowledge tabs.", ["/dashboard"]),

  cmd("mindmap.nodes.list", "List graph nodes derived from memories, documents, skills, and connectors.", ["/dashboard/mind-map"], { limit }),
  cmd("mindmap.nodes.create", "Create a mind-map node as workspace config metadata.", ["/dashboard/mind-map"], { label: { type: "string" }, type: { type: "string" }, ref_id: { type: "string" }, metadata }, ["label"]),
  cmd("mindmap.nodes.update", "Patch a mind-map node.", ["/dashboard/mind-map"], { id, label: { type: "string" }, type: { type: "string" }, ref_id: { type: "string" }, metadata }, ["id"]),
  cmd("mindmap.nodes.delete", "Delete a mind-map node.", ["/dashboard/mind-map"], { id }, ["id"], true),
  cmd("mindmap.edges.list", "List mind-map edges.", ["/dashboard/mind-map"], { limit }),
  cmd("mindmap.edges.create", "Create a mind-map edge.", ["/dashboard/mind-map"], { from: { type: "string" }, to: { type: "string" }, label: { type: "string" }, metadata }, ["from", "to"]),
  cmd("mindmap.edges.delete", "Delete a mind-map edge.", ["/dashboard/mind-map"], { id }, ["id"], true),
  cmd("mindmap.build_from_memory", "Build a lightweight graph from recent memories.", ["/dashboard/mind-map"], { limit }),
  cmd("mindmap.export", "Export mind-map nodes and edges.", ["/dashboard/mind-map"]),

  cmd("images.list", "List images.", ["/dashboard/images"], { q, limit }),
  cmd("images.get", "Get one image metadata row.", ["/dashboard/images"], { id }, ["id"]),
  cmd("images.add_url", "Register an image from an HTTPS URL.", ["/dashboard/images"], { url: { type: "string" }, name, prompt: { type: "string" }, model: { type: "string" }, metadata }, ["url"]),
  cmd("images.add_from_base64", "Store an image payload as a data URL metadata row.", ["/dashboard/images"], { name, base64: { type: "string" }, mime: { type: "string" }, metadata }, ["name", "base64"]),
  cmd("images.generate", "Record an image generation request for configured image pipeline.", ["/dashboard/images"], { prompt: { type: "string" }, model: { type: "string" }, metadata }, ["prompt"]),
  cmd("images.describe", "Return image metadata and prompt.", ["/dashboard/images"], { id }, ["id"]),
  cmd("images.signed_url", "Return the stored image URL when available.", ["/dashboard/images"], { id }, ["id"]),
  cmd("images.delete", "Delete image metadata.", ["/dashboard/images"], { id }, ["id"], true),

  cmd("voices.list", "List voice clips.", ["/dashboard/voices"], { q, limit }),
  cmd("voices.get", "Get one voice clip metadata and transcript.", ["/dashboard/voices"], { id }, ["id"]),
  cmd("voices.add_from_base64", "Store a voice payload as metadata with transcript/status.", ["/dashboard/voices"], { name, base64: { type: "string" }, mime: { type: "string" }, duration: { type: "number" }, transcript: { type: "string" }, metadata }, ["name", "base64"]),
  cmd("voices.update_transcript", "Update a voice transcript.", ["/dashboard/voices"], { id, transcript: { type: "string" } }, ["id", "transcript"]),
  cmd("voices.rename", "Rename a voice clip.", ["/dashboard/voices"], { id, name }, ["id", "name"]),
  cmd("voices.summarize", "Record or update a voice summary and action items.", ["/dashboard/voices"], { id, summary: { type: "string" }, action_items: { type: "array", items: { type: "string" } } }, ["id"]),
  cmd("voices.signed_url", "Return stored voice URL/path metadata when available.", ["/dashboard/voices"], { id }, ["id"]),
  cmd("voices.delete", "Delete voice metadata.", ["/dashboard/voices"], { id }, ["id"], true),

  cmd("database.tables", "List allowlisted workspace tables.", ["/dashboard/database"], {}),
  cmd("database.counts", "Count records in allowlisted workspace tables.", ["/dashboard/database"], {}),
  cmd("database.table_sample", "Return sample rows from an allowlisted workspace table.", ["/dashboard/database"], { table: { type: "string" }, limit }, ["table"]),
  cmd("database.query_readonly", "Run a SELECT-only query against allowlisted workspace data.", ["/dashboard/database"], { sql: { type: "string" }, limit }, ["sql"]),
  cmd("collections.list", "List database collections if the collections table exists.", ["/dashboard/database"], { q, limit }),
  cmd("collections.create", "Create a schemaless collection.", ["/dashboard/database"], { name, description: { type: "string" }, icon: { type: "string" }, schema: config }, ["name"]),
  cmd("collections.update", "Patch a schemaless collection.", ["/dashboard/database"], { id, name, description: { type: "string" }, icon: { type: "string" }, schema: config }, ["id"]),
  cmd("collections.delete", "Delete a collection and its items.", ["/dashboard/database"], { id }, ["id"], true),
  cmd("collection_items.list", "List collection items.", ["/dashboard/database"], { collection_id: { type: "string" }, q, limit }, ["collection_id"]),
  cmd("collection_items.add", "Add a collection item.", ["/dashboard/database"], { collection_id: { type: "string" }, data: config, tags }, ["collection_id", "data"]),
  cmd("collection_items.update", "Patch a collection item.", ["/dashboard/database"], { id, data: config, tags, ai_summary: { type: "string" } }, ["id"]),
  cmd("collection_items.delete", "Delete a collection item.", ["/dashboard/database"], { id }, ["id"], true),
  cmd("collection_items.import", "Bulk import collection items.", ["/dashboard/database"], { collection_id: { type: "string" }, items: { type: "array", items: { type: "object" } } }, ["collection_id", "items"]),

  cmd("vault.status", "Return vault status without revealing secrets.", ["/dashboard/vault"]),
  cmd("vault.list_refs", "List vault secret references and metadata only.", ["/dashboard/vault"], { q, scope: { type: "string" }, limit }),
  cmd("vault.set_secret", "Store or update a vault secret; value is never echoed back.", ["/dashboard/vault"], { name, value: { type: "string" }, scope: { type: "string" }, description: { type: "string" } }, ["name", "value"], true),
  cmd("vault.delete_secret", "Delete a vault secret.", ["/dashboard/vault"], { id, name }, [], true),
  cmd("vault.import_env", "Import KEY=VALUE text into the vault.", ["/dashboard/vault"], { text: { type: "string" }, scope: { type: "string" } }, ["text"], true),
  cmd("vault.copy_ref", "Return a safe {{vault.NAME}} reference string.", ["/dashboard/vault"], { name }, ["name"]),

  cmd("events.list", "List recent events.", ["/dashboard/events", "/dashboard/logs"], { kind: { type: "string" }, source: { type: "string" }, limit }),
  cmd("events.log", "Append an event.", ["/dashboard/events"], { kind: { type: "string" }, source: { type: "string" }, payload: config }, ["kind"]),
  cmd("logs.list", "List recent identity/system log events.", ["/dashboard/logs"], { kind: { type: "string" }, limit }),
  cmd("logs.search", "Search events and identity logs.", ["/dashboard/logs"], { q, limit }, ["q"]),
  cmd("audit.list", "List audit log rows.", ["/dashboard/logs", "/dashboard/events"], { action: { type: "string" }, limit }),
  cmd("agent_calls.list", "List recorded agent calls.", ["/dashboard/logs", "/dashboard/events"], { kind: { type: "string" }, status: { type: "string" }, limit }),
  cmd("observe.summary", "Summarize recent events, calls, and audit entries.", ["/dashboard/events", "/dashboard/logs"]),

  cmd("project.get", "Return project/workspace config metadata.", ["/dashboard/settings", "/dashboard"], {}),
  cmd("project.update", "Patch project metadata config.", ["/dashboard/settings"], { name, metadata }, [], true),
  cmd("workspace.info", "Return Clerk/user workspace identity.", ["/dashboard/settings", "/dashboard"], {}),
  cmd("settings.copilot.get", "Return Copilot runtime settings.", ["/dashboard/settings"]),
  cmd("settings.copilot.update", "Patch Copilot settings without exposing API keys.", ["/dashboard/settings"], { model: { type: "string" }, temperature: { type: "number" }, max_tokens: { type: "number" }, zdr: { type: "boolean" }, data_collection: { type: "string" } }),
  cmd("settings.models.search", "Search OpenRouter text models using current Copilot credentials.", ["/dashboard/settings"], { q, limit }),

  cmd("api_keys.list", "List API key metadata only.", ["/dashboard/api-keys"], { limit }),
  cmd("api_keys.create", "Create an API key; plaintext is returned once.", ["/dashboard/api-keys"], { name }, ["name"], true),
  cmd("api_keys.revoke", "Revoke/delete an API key.", ["/dashboard/api-keys"], { id }, ["id"], true),
  cmd("api_keys.rotate", "Rotate an API key by revoking old id and creating a new key.", ["/dashboard/api-keys"], { id, name }, ["id", "name"], true),
];
