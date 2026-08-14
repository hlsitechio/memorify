// lib/agent-access.ts — Simple agent capability levels (debug-friendly)
// Source of truth: agents.access_level in Neon (re-read every request).
// Levels: read | write | both | full

export const ACCESS_LEVELS = ["read", "write", "both", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);
}

/** Normalize unknown / legacy → AccessLevel (default full for old agents). */
export function normalizeAccessLevel(v: unknown): AccessLevel {
  if (isAccessLevel(v)) return v;
  return "full";
}

/**
 * Action class for gateway enforcement.
 * - read: list/get/recall/view/ping/manifest/bootstrap
 * - write: create/update/log/run (no delete / mint)
 * - admin: delete, rename, new agent, mcp mutate, token-sensitive
 */
export type ActionClass = "read" | "write" | "admin";

const READ_ACTIONS = new Set([
  "gateway.ping",
  "gateway.manifest",
  "memory.recall",
  "memory.list",
  "skills.list",
  "skills.get",
  "events.list",
  "documents.list",
  "documents.view",
  "agents.list",
  "agents.bootstrap",
  "mcp.servers",
  "mcp.tools",
]);

const WRITE_ACTIONS = new Set([
  "memory.remember",
  "memory.update",
  "events.log",
  "documents.add_from_url",
  "skills.run",
  "mcp.call",
  "mcp.sync",
]);

const ADMIN_ACTIONS = new Set([
  "memory.delete",
  "documents.delete",
  "agents.new",
  "agents.rename",
  "mcp.add_server",
]);

export function classifyAction(agent: string, action: string): ActionClass {
  const key = `${agent}.${action}`;
  if (READ_ACTIONS.has(key)) return "read";
  if (WRITE_ACTIONS.has(key)) return "write";
  if (ADMIN_ACTIONS.has(key)) return "admin";
  // Unknown actions: require full (fail closed for new routes)
  return "admin";
}

/**
 * Can this access_level perform this action class?
 * read  → read only
 * write → write only (no read, no admin) — rare; usually use both
 * both  → read + write
 * full  → everything
 */
export function levelAllows(level: AccessLevel, cls: ActionClass): boolean {
  switch (level) {
    case "read":
      return cls === "read";
    case "write":
      return cls === "write";
    case "both":
      return cls === "read" || cls === "write";
    case "full":
      return true;
    default:
      return false;
  }
}

export function assertAgentAccess(
  level: AccessLevel,
  agent: string,
  action: string,
  ids: { agent_id: string; workspace_id: string },
): void {
  const cls = classifyAction(agent, action);
  if (levelAllows(level, cls)) return;
  const err = new Error(
    `forbidden: access_level=${level} cannot ${agent}.${action} (${cls}) agent_id=${ids.agent_id} workspace_id=${ids.workspace_id}`,
  );
  (err as Error & { status: number; code: string }).status = 403;
  (err as Error & { code: string }).code = "agent_access_denied";
  throw err;
}

export const ACCESS_LEVEL_HELP: Record<AccessLevel, string> = {
  read: "List / recall / view only",
  write: "Create & update only (no reads, no deletes)",
  both: "Read + write (no deletes / admin)",
  full: "All actions including delete & agent admin",
};
