// src/clients.ts — universal MCP client support.
// Each client knows: how to detect it, how to write Memorify server config,
// and whether it needs the stdio bridge (Claude Desktop) vs native HTTP.

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/** Home resolved lazily so tests (and portable envs) can redirect. */
const home = () => os.homedir();

export interface ClientTarget {
  id: string;
  label: string;
  stdioOnly?: boolean;
  /** Best-effort detection of the client in the current project/home. */
  detect: () => Promise<boolean>;
  /** Write/merge config. Returns the file path written. */
  write: (token: string, mcpUrl: string) => Promise<string>;
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p: string): Promise<any> {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return {};
  }
}

async function writeJson(p: string, data: any): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8" });
}

/** Server entry for native streamable-http clients. */
function httpEntry(mcpUrl: string, token: string) {
  return { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } };
}

/** Server entry for stdio-only clients — runs this same package as a bridge.
 *  SECURITY: use the self-hosted tarball, NOT `memorify` from npm — that name
 *  is owned by an unrelated third-party package. Never point npx at it with a
 *  token in env. (Tracked in Linear HLS-62; switch to our scoped npm name if
 *  we ever publish one.) */
function bridgeEntry(token: string) {
  return {
    command: "npx",
    args: ["-y", "https://memorify.dev/cli/memorify.tgz", "mcp"],
    env: { MEMORIFY_TOKEN: token },
  };
}

/** Merge an MCP server entry into { mcpServers: {...} } style config. */
async function mergeMcpServers(file: string, entry: any): Promise<string> {
  const cfg = await readJson(file);
  cfg.mcpServers = { ...(cfg.mcpServers ?? {}), memorify: entry };
  await writeJson(file, cfg);
  return file;
}

// ── client registry ─────────────────────────────────────────────────────────

export const CLIENTS: ClientTarget[] = [
  {
    // Claude Code (project scope). Cline and Roo Code also read this file.
    id: "claude-code",
    label: "Claude Code (.mcp.json — also read by Cline & Roo Code)",
    async detect() {
      return (await exists(path.join(process.cwd(), ".mcp.json"))) || (await exists(path.join(process.cwd(), ".claude")));
    },
    async write(token, mcpUrl) {
      return mergeMcpServers(path.join(process.cwd(), ".mcp.json"), httpEntry(mcpUrl, token));
    },
  },
  {
    id: "cline",
    label: "Cline / Roo Code (project .mcp.json)",
    async detect() {
      return (await exists(path.join(process.cwd(), ".mcp.json"))) || process.env.VSCODE_PID !== undefined;
    },
    async write(token, mcpUrl) {
      return mergeMcpServers(path.join(process.cwd(), ".mcp.json"), httpEntry(mcpUrl, token));
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    async detect() {
      return exists(path.join(process.cwd(), ".cursor"));
    },
    async write(token, mcpUrl) {
      const file = path.join(process.cwd(), ".cursor", "mcp.json");
      const cfg = await readJson(file);
      cfg.mcpServers = {
        ...(cfg.mcpServers ?? {}),
        memorify: { type: "streamableHttp", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
      };
      await writeJson(file, cfg);
      return file;
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    async detect() {
      return exists(path.join(home(), ".codeium", "windsurf"));
    },
    async write(token, mcpUrl) {
      return mergeMcpServers(
        path.join(home(), ".codeium", "windsurf", "mcp_config.json"),
        { type: "streamableHttp", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
      );
    },
  },
  {
    id: "vscode",
    label: "VS Code Copilot agent mode (.vscode/mcp.json)",
    async detect() {
      return exists(path.join(process.cwd(), ".vscode"));
    },
    async write(token, mcpUrl) {
      const file = path.join(process.cwd(), ".vscode", "mcp.json");
      const cfg = await readJson(file);
      cfg.servers = { ...(cfg.servers ?? {}), memorify: httpEntry(mcpUrl, token) };
      await writeJson(file, cfg);
      return file;
    },
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop (via stdio bridge)",
    stdioOnly: true,
    async detect() {
      return exists(claudeDesktopCfgDir());
    },
    async write(token) {
      return mergeMcpServers(
        path.join(claudeDesktopCfgDir(), "claude_desktop_config.json"),
        bridgeEntry(token),
      );
    },
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI",
    async detect() {
      return exists(path.join(home(), ".gemini"));
    },
    async write(token, mcpUrl) {
      const file = path.join(home(), ".gemini", "settings.json");
      const cfg = await readJson(file);
      cfg.mcpServers = {
        ...(cfg.mcpServers ?? {}),
        memorify: { httpUrl: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
      };
      await writeJson(file, cfg);
      return file;
    },
  },
  {
    id: "continue",
    label: "Continue",
    async detect() {
      return exists(path.join(home(), ".continue"));
    },
    async write(token, mcpUrl) {
      const file = path.join(home(), ".continue", "config.json");
      const cfg = await readJson(file);
      const servers = Array.isArray(cfg.mcpServers) ? cfg.mcpServers : [];
      const next = servers.filter((s: any) => s?.name !== "memorify");
      next.push({ name: "memorify", type: "remote", remote: mcpUrl, headers: { Authorization: `Bearer ${token}` } });
      cfg.mcpServers = next;
      await writeJson(file, cfg);
      return file;
    },
  },
  {
    id: "codex",
    label: "Codex CLI (~/.codex/config.toml)",
    async detect() {
      return exists(path.join(home(), ".codex"));
    },
    async write(token, mcpUrl) {
      const file = path.join(home(), ".codex", "config.toml");
      let text = "";
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        /* new file */
      }
      // Remove any existing memorify section, then append a fresh one.
      text = text.replace(/^\[mcp_servers\.memorify\][\s\S]*?(?=^\[)/gm, "").trimEnd();
      text += `\n\n[mcp_servers.memorify]\nurl = "${mcpUrl}"\nbearer_token_env_var = "MEMORIFY_TOKEN"\n`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, text.replace(/^\n+/, "") + "\n", "utf8");
      return file;
    },
  },
  {
    id: "opencode",
    label: "opencode (opencode.json)",
    async detect() {
      return exists(path.join(process.cwd(), "opencode.json"));
    },
    async write(token, mcpUrl) {
      const file = path.join(process.cwd(), "opencode.json");
      const cfg = await readJson(file);
      cfg.mcp = { ...(cfg.mcp ?? {}), memorify: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } };
      await writeJson(file, cfg);
      return file;
    },
  },
  {
    id: "kilo-code",
    label: "Kilo Code (.kilocode/mcp_settings.json)",
    async detect() {
      return exists(path.join(process.cwd(), ".kilocode"));
    },
    async write(token, mcpUrl) {
      return mergeMcpServers(
        path.join(process.cwd(), ".kilocode", "mcp_settings.json"),
        { type: "streamableHttp", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
      );
    },
  },
  {
    id: "openclaw",
    label: "OpenClaw (~/.openclaw/openclaw.json, via stdio bridge)",
    async detect() {
      return exists(path.join(home(), ".openclaw"));
    },
    async write(token) {
      return mergeMcpServers(path.join(home(), ".openclaw", "openclaw.json"), bridgeEntry(token));
    },
  },

];

function claudeDesktopCfgDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(home(), "AppData", "Roaming"), "Claude");
  }
  if (process.platform === "darwin") {
    return path.join(home(), "Library", "Application Support", "Claude");
  }
  return path.join(home(), ".config", "Claude");
}

export function getClient(id: string): ClientTarget {
  const c = CLIENTS.find((c) => c.id === id);
  if (!c) {
    throw new Error(`unknown client "${id}" — supported: ${CLIENTS.map((c) => c.id).join(", ")}`);
  }
  return c;
}

/** Save token to ~/.memorify/credentials.json (chmod 600 where supported). */
export async function saveCredentials(token: string): Promise<string> {
  const file = path.join(home(), ".memorify", "credentials.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ token, saved_at: new Date().toISOString() }, null, 2), "utf8");
  try {
    await fs.chmod(file, 0o600);
  } catch {
    /* Windows / unsupported FS */
  }
  return file;
}

export async function loadToken(): Promise<string | null> {
  const file = path.join(home(), ".memorify", "credentials.json");
  try {
    const cfg = JSON.parse(await fs.readFile(file, "utf8"));
    return cfg.token ?? null;
  } catch {
    return null;
  }
}

/** If a config file lands inside the current project and this is a git repo,
 *  ensure git ignores it locally so the embedded live token can't be committed
 *  accidentally. Uses .git/info/exclude — repo-local, never touches the user's
 *  tracked .gitignore. (Tracked in Linear HLS-62.) */
export async function guardProjectSecret(file: string): Promise<boolean> {
  if (!path.resolve(file).startsWith(process.cwd() + path.sep)) return false;
  try {
    await fs.access(path.join(process.cwd(), ".git"));
  } catch {
    return false; // not a git repo — nothing to guard
  }
  const exclude = path.join(process.cwd(), ".git", "info", "exclude");
  const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");
  let text = "";
  try {
    text = await fs.readFile(exclude, "utf8");
  } catch {
    /* no exclude file yet */
  }
  if (!text.split("\n").some((l) => l.trim() === rel)) {
    await fs.mkdir(path.dirname(exclude), { recursive: true });
    await fs.appendFile(exclude, `\n# memorify: contains live agent token\n${rel}\n`, "utf8");
  }
  return true;
}

