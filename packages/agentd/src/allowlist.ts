// src/allowlist.ts — Memorify Remote command allowlist (the REAL security gate).
//
// SECURITY MODEL:
//   The server-side denylist in backend/routes/machines.ts is defense-in-depth
//   only (regexes are trivially bypassable). THIS file is the primary
//   enforcement of what may run on the user's machine.
//
//   Deny-by-default: a command runs ONLY if it matches an explicit allowlist
//   entry. Anything else is refused and reported back as "blocked" — the agent
//   sees a clear reason, the machine owner is never silently executed against.
//
//   Every command is also capped in length and execution time.

export type AllowlistVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

export const MAX_COMMAND_LENGTH = 2000;
export const MAX_EXEC_SECONDS = 60; // hard cap on any single command

// A single allowlist rule. `match` is a regex tested against the FULL command
// string (anchored). `description` is surfaced to the agent when it's the
// reason a command was refused.
interface Rule {
  match: RegExp;
  description: string;
}

// ── Read-only inspection (safe, no side effects) ─────────────────────────
const READ_ONLY: Rule[] = [
  { match: /^(dir|ls)(\s|$)/i, description: "list directory contents" },
  { match: /^(pwd|cd)(\s|$)/i, description: "print/change working directory" },
  { match: /^type\s+/i, description: "print file contents (Windows)" },
  { match: /^cat\s+/i, description: "print file contents" },
  { match: /^echo\s+/i, description: "print text" },
  { match: /^(where|which|whereis)\s+/i, description: "locate a program" },
  { match: /^(whoami|hostname|uname|ver|systeminfo)(\s|$)/i, description: "system identity" },
  { match: /^(ipconfig|ifconfig|ip\s+addr|ip\s+route)(\s|$)/i, description: "network config" },
  { match: /^(netstat|ss)(\s|$)/i, description: "network connections" },
  { match: /^(tasklist|ps|top)(\s|$)/i, description: "process list" },
  { match: /^(git\s+status|git\s+log|git\s+diff|git\s+branch|git\s+remote)(\s|$)/i, description: "git inspection" },
  { match: /^(npm|pnpm|yarn)\s+(list|ls|outdated|why)(\s|$)/i, description: "package inspection" },
  { match: /^(node|python|python3)\s+--version$/i, description: "runtime version" },
  { match: /^get-content\s+/i, description: "print file contents (PowerShell)" },
  { match: /^get-childitem(\s|$)/i, description: "list directory (PowerShell)" },
  { match: /^get-process(\s|$)/i, description: "process list (PowerShell)" },
];

// ── Safe writes (explicitly vetted, scoped) ──────────────────────────────
const SAFE_WRITES: Rule[] = [
  { match: /^mkdir\s+/i, description: "create a directory" },
  { match: /^(copy|cp)\s+/i, description: "copy files" },
  { match: /^(move|mv)\s+/i, description: "move files" },
  { match: /^(ren|rename)\s+/i, description: "rename files" },
  { match: /^echo\s+[^>]*>\s*\S+/i, description: "write a file via echo redirect" },
  { match: /^git\s+(add|commit|checkout|switch|pull|fetch|push|stash|restore|clean)(\s|$)/i, description: "git write operations" },
  { match: /^(npm|pnpm|yarn)\s+(install|add|remove|update|upgrade|ci)(\s|$)/i, description: "package install/update" },
  { match: /^npm\s+run\s+\S+/i, description: "run a package.json script" },
];

// ── Explicitly dangerous — blocked even if they'd match a read rule ───────
// (checked FIRST; these are the things a rogue agent would try)
const HARD_BLOCK: Rule[] = [
  { match: /rm\s+-rf/i, description: "recursive delete" },
  { match: /\bdel\s+\/[fqs]/i, description: "forced delete" },
  { match: /mkfs|format\s+[a-z]:/i, description: "format a filesystem" },
  { match: /shutdown|reboot|restart-computer/i, description: "power control" },
  { match: /curl[^|]*\|\s*(ba)?sh/i, description: "curl|sh" },
  { match: /wget[^|]*\|\s*(ba)?sh/i, description: "wget|sh" },
  { match: /:\s*\(\)\s*\{\s*:\|:&\s*\};:/, description: "fork bomb" },
  { match: /set-mppreference\s+-disable/i, description: "disable antivirus" },
  { match: /invoke-expression|iex\s+/i, description: "PowerShell eval" },
  { match: /powershell\s+-enc/i, description: "encoded PowerShell" },
  { match: /base64\s+-d.*\|/i, description: "base64 decode pipe" },
  { match: /reg\s+(add|delete)/i, description: "registry modification" },
  { match: /net\s+user\s+/i, description: "user account management" },
  { match: /sc\s+(create|delete|config)/i, description: "service management" },
  { match: /schtasks\s+\/create/i, description: "scheduled task creation" },
  { match: /chmod\s+777/i, description: "world-writable permissions" },
  { match: /sudo\s+/i, description: "privilege escalation" },
  { match: /su\s+-/i, description: "switch user" },
];

const ALLOWLIST: Rule[] = [...READ_ONLY, ...SAFE_WRITES];

/**
 * Decide whether a command may run on this machine.
 * Order: length cap → hard-block → allowlist match. Deny by default.
 */
export function checkCommand(command: string): AllowlistVerdict {
  const cmd = (command ?? "").trim();
  if (!cmd) return { allowed: false, reason: "empty command" };
  if (cmd.length > MAX_COMMAND_LENGTH) {
    return { allowed: false, reason: `command too long (max ${MAX_COMMAND_LENGTH} chars)` };
  }

  for (const rule of HARD_BLOCK) {
    if (rule.match.test(cmd)) {
      return { allowed: false, reason: `blocked: ${rule.description}` };
    }
  }

  for (const rule of ALLOWLIST) {
    if (rule.match.test(cmd)) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason:
      "command not in the machine allowlist. Only read-only inspection and a " +
      "small set of vetted write commands are permitted by default.",
  };
}
