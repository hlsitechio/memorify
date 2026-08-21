// backend/routes/machines.ts — Memorify Remote (Phase 1)
// Agent-controlled machines: PIN pairing, pull-based command relay, session
// gating with email alerts + one-click kill switch.
//
// SECURITY MODEL:
//   - Machine pairing is user-approved (Clerk-authed confirm with 6-char code).
//   - Machine tokens (mem_mac_...) are 384-bit, stored ONLY as sha256 hashes.
//   - Every agent activity happens inside a "control session"; creating one
//     triggers an email to the machine owner with a one-click KILL button.
//   - The kill button revokes the machine token (daemon exits on next poll),
//     kills the session and cancels pending commands. One-time kill token.
//   - Commands are audit-logged in machine_commands (command, exit, output).
//   - Server-side denylist is defense-in-depth; the daemon's allowlist is the
//     primary enforcement of what may run on the machine.

import { json } from "../lib/cors.ts";
import { query, queryOne, execute } from "../lib/db.ts";
import { verifyClerkJwt, extractBearer } from "../lib/clerk.ts";
import { clientIpHash } from "../lib/pairing.ts";

const DEFAULT_ALERT_EMAIL = "hlarosesurprenant@gmail.com";
const PAIR_TTL_SECONDS = 600;
const SESSION_IDLE_SECONDS = 600; // session expires after 10 min without activity
const ONLINE_WINDOW_SECONDS = 150; // machine considered offline if not polled
const MAX_COMMAND_WAIT_SECONDS = 300;
const MAX_SIGNAL_PAYLOAD_BYTES = 32_000; // SDP/ICE/input signaling cap

// ── helpers ────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateUserCode(): string {
  // Unambiguous alphabet (no 0/O, 1/I/L)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out;
}

// Server-side denylist — defense in depth. The daemon's allowlist is the real gate.
const DENY_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+[~/]/i,
  /mkfs/i,
  /dd\s+if=/i,
  /\bformat\s+[a-z]:/i,
  /\bshutdown\b|\breboot\b/i,
  /del\s+\/[fqs]/i,
  /:\(\)\{\s*:\|:&\s*\};:/,
  /curl[^|]*\|\s*(ba)?sh/i,
  /wget[^|]*\|\s*(ba)?sh/i,
  /Set-MpPreference\s+-Disable/i,
];

function commandDenied(command: string): string | null {
  if (command.length > 2000) return "command too long (max 2000 chars)";
  for (const re of DENY_PATTERNS) {
    if (re.test(command)) return `command blocked by safety denylist (pattern: ${re.source})`;
  }
  return null;
}

// ── email ──────────────────────────────────────────────────────

async function sendControlAlert(opts: {
  to: string;
  machineName: string;
  agentName: string;
  firstCommand: string;
  killUrl: string;
}): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY missing — machine control alert NOT emailed:", { machine: opts.machineName });
    return;
  }
  const cmdPreview = opts.firstCommand.slice(0, 200).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:32px 16px;background-color:#030712;font-family:sans-serif;color:#e2e8f0;">
  <h2 style="color:#ef4444;margin-top:0;">🚨 An agent took control of your computer</h2>
  <p style="font-size:15px;">The agent <strong style="color:#f59e0b;">${opts.agentName}</strong> just started a
  <strong>remote control session</strong> on your machine
  <strong style="color:#38bdf8;">${opts.machineName}</strong> via Memorify.</p>
  <p style="color:#94a3b8;font-size:13px;">First command requested:</p>
  <blockquote style="background:#1e293b;padding:12px;border-left:4px solid #f59e0b;margin:0;font-family:monospace;font-size:13px;">
    ${cmdPreview}
  </blockquote>
  <p style="font-size:15px;margin-top:24px;"><strong>Is this not you?</strong> Kill the connection instantly:</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr>
      <td align="center" bgcolor="#ef4444" style="border-radius:8px;">
        <a href="${opts.killUrl}"
           style="display:inline-block;padding:16px 36px;font-size:16px;font-weight:bold;color:#ffffff;
                  text-decoration:none;border-radius:8px;font-family:sans-serif;">
          ⛔ KILL CONNECTION NOW
        </a>
      </td>
    </tr>
  </table>
  <p style="color:#94a3b8;font-size:12px;">
    Killing revokes the machine's access token — the daemon on ${opts.machineName} stops immediately and the
    machine must be re-paired before any agent can touch it again. Every command run in this session is
    logged in your Memorify dashboard under Machines.
  </p>
  <p style="color:#64748b;font-size:12px;margin-top:24px;">Memorify Remote · control session alert</p>
</body>
</html>`;
  const text = `ALERT: agent "${opts.agentName}" took control of machine "${opts.machineName}".\n` +
    `First command: ${opts.firstCommand.slice(0, 300)}\n\n` +
    `Kill the connection instantly: ${opts.killUrl}\n` +
    `Killing revokes the machine token; re-pairing is required for future access.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Memorify Remote <onboarding@resend.dev>",
        to: [opts.to],
        subject: `🚨 Agent control started on ${opts.machineName} — kill it now if this isn't you`,
        html,
        text,
      }),
    });
    if (!res.ok) console.error("machine control alert email failed:", await res.text());
  } catch (e) {
    console.error("machine control alert email error:", e);
  }
}

// ── core operations ────────────────────────────────────────────

type Machine = {
  id: string;
  workspace_id: string;
  name: string;
  platform: string | null;
  token_hash: string | null;
  notify_email: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
};

async function findMachineByToken(token: string): Promise<Machine | null> {
  const hash = await sha256Hex(token);
  return await queryOne<Machine>(
    `SELECT id, workspace_id, name, platform, token_hash, notify_email,
            last_seen_at::text, revoked_at::text
     FROM machines WHERE token_hash = $1 LIMIT 1`,
    [hash],
  );
}

/** Expire sessions idle beyond SESSION_IDLE_SECONDS. */
async function expireIdleSessions(): Promise<void> {
  await execute(
    `UPDATE machine_sessions SET status = 'expired', ended_at = now()
     WHERE status = 'active' AND last_activity_at < now() - interval '${SESSION_IDLE_SECONDS} seconds'`,
  ).catch(() => {});
}

/** Kill a machine: revoke token, kill sessions, cancel pending commands. */
async function killMachine(machineId: string, reason: string): Promise<void> {
  await execute(
    `UPDATE machines SET revoked_at = now(), token_hash = NULL, updated_at = now() WHERE id = $1`,
    [machineId],
  );
  await execute(
    `UPDATE machine_sessions SET status = 'killed', ended_at = now() WHERE machine_id = $1 AND status = 'active'`,
    [machineId],
  );
  await execute(
    `UPDATE machine_commands SET status = 'cancelled', completed_at = now(), error = $2
     WHERE machine_id = $1 AND status IN ('pending','delivered')`,
    [machineId, `machine killed (${reason})`],
  );
}

/** Get the active session for a machine, or create one (+ email alert). */
async function getOrCreateSession(
  machine: Machine,
  agentId: string | null,
  agentName: string,
  firstCommand: string,
): Promise<{ id: string; created: boolean }> {
  await expireIdleSessions();
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM machine_sessions WHERE machine_id = $1 AND status = 'active' LIMIT 1`,
    [machine.id],
  );
  if (existing) return { id: existing.id, created: false };

  const killToken = randomHex(32);
  const killTokenHash = await sha256Hex(killToken);
  const inserted = await queryOne<{ id: string }>(
    `INSERT INTO machine_sessions (machine_id, workspace_id, agent_id, agent_name, kill_token_hash, notified_email)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [machine.id, machine.workspace_id, agentId, agentName, killTokenHash, machine.notify_email],
  );
  if (!inserted) throw new Error("failed_to_create_session");

  // Email the owner with the kill button. Never block the tool call on failure.
  const killUrl = `https://memorify.dev/api/machine/kill?k=${killToken}`;
  sendControlAlert({
    to: machine.notify_email || DEFAULT_ALERT_EMAIL,
    machineName: machine.name,
    agentName,
    firstCommand,
    killUrl,
  }).catch((e) => console.error("control alert send error:", e));

  return { id: inserted.id, created: true };
}

/** Enqueue a command and wait for the daemon to execute it. Called from MCP. */
export async function execOnMachine(opts: {
  workspace_id: string;
  agent_id: string | null;
  machine: string;
  command: string;
  timeout_seconds?: number;
}): Promise<Record<string, unknown>> {
  const { workspace_id, agent_id, machine: machineRef, command } = opts;
  if (!command || typeof command !== "string" || !command.trim()) {
    throw new Error("command is required");
  }

  const denied = commandDenied(command);
  if (denied) throw new Error(denied);

  // Resolve machine by id or name (case-insensitive) within the workspace.
  const machine = await queryOne<Machine>(
    `SELECT id, workspace_id, name, platform, token_hash, notify_email,
            last_seen_at::text, revoked_at::text
     FROM machines
     WHERE workspace_id = $1 AND revoked_at IS NULL
       AND (id::text = $2 OR lower(name) = lower($2))
     ORDER BY last_seen_at DESC NULLS LAST
     LIMIT 1`,
    [workspace_id, machineRef.trim()],
  );
  if (!machine) {
    throw new Error(
      `machine "${machineRef}" not found in this workspace (or revoked). Use computer_list_machines to see paired machines.`,
    );
  }

  // Online check — daemon heartbeats every few seconds via /api/machine/poll.
  const online = await queryOne<{ online: boolean }>(
    `SELECT (last_seen_at > now() - interval '${ONLINE_WINDOW_SECONDS} seconds') AS online FROM machines WHERE id = $1`,
    [machine.id],
  );
  if (!online?.online) {
    throw new Error(
      `machine "${machine.name}" is offline (daemon not running or no recent heartbeat). Ask the user to start memorify-agentd on that machine.`,
    );
  }

  // Resolve agent display name for the alert email.
  let agentName = "agent";
  if (agent_id) {
    const row = await queryOne<{ name: string }>(
      `SELECT name FROM agents WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [agent_id, workspace_id],
    ).catch(() => null);
    if (row?.name) agentName = row.name;
  }

  const session = await getOrCreateSession(machine, agent_id, agentName, command);

  const timeoutSeconds = Math.min(Math.max(Math.floor(opts.timeout_seconds ?? 90), 5), MAX_COMMAND_WAIT_SECONDS);
  const cmd = await queryOne<{ id: string }>(
    `INSERT INTO machine_commands (session_id, machine_id, command)
     VALUES ($1, $2, $3) RETURNING id`,
    [session.id, machine.id, command],
  );
  if (!cmd) throw new Error("failed_to_enqueue_command");

  // Wait for the daemon to pick it up and post the result.
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const row = await queryOne<{
      status: string;
      exit_code: number | null;
      stdout: string | null;
      stderr: string | null;
      error: string | null;
    }>(
      `SELECT status, exit_code, stdout, stderr, error FROM machine_commands WHERE id = $1`,
      [cmd.id],
    );
    if (row && ["completed", "failed", "cancelled", "timeout", "blocked"].includes(row.status)) {
      await execute(
        `UPDATE machine_sessions SET last_activity_at = now(), commands_run = commands_run + 1
         WHERE id = $1`,
        [session.id],
      ).catch(() => {});
      return {
        machine: machine.name,
        command,
        status: row.status,
        exit_code: row.exit_code,
        stdout: (row.stdout ?? "").slice(0, 20_000),
        stderr: (row.stderr ?? "").slice(0, 20_000),
        error: row.error,
        session_started_now: session.created,
        session_id: session.id,
      };
    }
    if (Date.now() >= deadline) {
      await execute(`UPDATE machine_commands SET status = 'timeout', completed_at = now() WHERE id = $1`, [cmd.id]);
      return {
        machine: machine.name,
        command,
        status: "timeout",
        error: `daemon did not report a result within ${timeoutSeconds}s`,
        session_id: session.id,
      };
    }
  }
}

/** List machines (+ active session) for a workspace. Called from MCP + dashboard. */
export async function listMachinesForWorkspace(workspaceId: string): Promise<unknown[]> {
  await expireIdleSessions();
  return await query(
    `SELECT m.id, m.name, m.platform,
            (m.last_seen_at > now() - interval '${ONLINE_WINDOW_SECONDS} seconds') AS online,
            m.last_seen_at::text, m.created_at::text,
            s.id AS active_session_id, s.agent_name AS active_agent, s.started_at::text AS session_started_at,
            (SELECT count(*) FROM machine_commands c WHERE c.machine_id = m.id) AS commands_total
     FROM machines m
     LEFT JOIN machine_sessions s ON s.machine_id = m.id AND s.status = 'active'
     WHERE m.workspace_id = $1 AND m.revoked_at IS NULL
     ORDER BY m.last_seen_at DESC NULLS LAST`,
    [workspaceId],
  );
}

// ── HTTP API (edge function dispatch) ──────────────────────────

async function requireClerk(req: Request): Promise<{ sub: string; org_id?: string; email?: string } | null> {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    return await verifyClerkJwt(token);
  } catch {
    return null;
  }
}

function killHtml(title: string, detail: string): Response {
  const ok = title.includes("Killed");
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#030712;font-family:sans-serif;color:#e2e8f0;text-align:center;">
  <h1 style="color:${ok ? "#22c55e" : "#ef4444"};">${title}</h1>
  <p style="color:#94a3b8;font-size:15px;">${detail}</p>
</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function handleMachineApi(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method;

  try {
    // ── POST /api/machine/pair/start (daemon, unauthenticated, rate-limited) ──
    if (method === "POST" && path === "/api/machine/pair/start") {
      const ipHash = await clientIpHash(req);
      const recent = await queryOne<{ n: number }>(
        `SELECT count(*) AS n FROM machine_pairings
         WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'`,
        [ipHash],
      ).catch(() => null);
      if ((recent?.n ?? 0) >= 5) {
        return json({ error: "rate_limited", retry_after: 3600 }, 429, { "Retry-After": "3600" });
      }

      const body = await req.json().catch(() => ({}));
      const machineName = typeof body.machine_name === "string" && body.machine_name.trim()
        ? body.machine_name.trim().slice(0, 80)
        : "Unnamed machine";
      const platform = typeof body.platform === "string" ? body.platform.slice(0, 60) : null;

      let userCode = "";
      for (let i = 0; i < 5; i++) {
        const candidate = generateUserCode();
        const clash = await queryOne<{ id: string }>(
          `SELECT id FROM machine_pairings WHERE user_code = $1 AND status = 'pending' AND expires_at > now() LIMIT 1`,
          [candidate],
        );
        if (!clash) { userCode = candidate; break; }
      }
      if (!userCode) return json({ error: "code_generation_failed" }, 500);

      const machineCode = randomHex(32);
      await execute(
        `INSERT INTO machine_pairings (user_code, machine_code_hash, machine_name, platform, ip_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + interval '${PAIR_TTL_SECONDS} seconds')`,
        [userCode, await sha256Hex(machineCode), machineName, platform, ipHash],
      );

      return json({
        user_code: userCode,
        machine_code: machineCode,
        verification_uri: "https://memorify.dev/dashboard/machines",
        expires_in: PAIR_TTL_SECONDS,
        interval: 3,
      });
    }

    // ── POST /api/machine/pair/poll (daemon, machine_code auth) ──
    if (method === "POST" && path === "/api/machine/pair/poll") {
      const body = await req.json().catch(() => ({}));
      const machineCode = typeof body.machine_code === "string" ? body.machine_code : "";
      if (!machineCode) return json({ error: "machine_code required" }, 400);

      const pairing = await queryOne<{ id: string; status: string; machine_id: string | null }>(
        `SELECT id, status, machine_id::text FROM machine_pairings
         WHERE machine_code_hash = $1 AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
        [await sha256Hex(machineCode)],
      );
      if (!pairing) return json({ error: "pairing_not_found_or_expired" }, 404);

      if (pairing.status === "pending") return json({ status: "pending", interval: 3 });
      if (pairing.status === "issued") return json({ status: "already_issued" }); // token shown once only
      if (pairing.status !== "approved" || !pairing.machine_id) return json({ status: "denied" });

      // Approved + not yet issued → mint the one-time machine token.
      const machineToken = `mem_mac_${randomHex(24)}`;
      await execute(
        `UPDATE machines SET token_hash = $1, updated_at = now() WHERE id = $2`,
        [await sha256Hex(machineToken), pairing.machine_id],
      );
      await execute(`UPDATE machine_pairings SET status = 'issued' WHERE id = $1`, [pairing.id]);
      return json({ status: "approved", machine_token: machineToken });
    }

    // ── POST /api/machine/pair/confirm (dashboard, Clerk auth) ──
    if (method === "POST" && path === "/api/machine/pair/confirm") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);
      if (!claims.org_id) return json({ error: "no_active_workspace" }, 400);

      const body = await req.json().catch(() => ({}));
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: "invalid_code" }, 400);

      const pairing = await queryOne<{ id: string; machine_name: string; platform: string | null }>(
        `SELECT id, machine_name, platform FROM machine_pairings
         WHERE user_code = $1 AND status = 'pending' AND expires_at > now() LIMIT 1`,
        [code],
      );
      if (!pairing) return json({ error: "code_not_found_or_expired" }, 404);

      const machine = await queryOne<{ id: string }>(
        `INSERT INTO machines (workspace_id, name, platform, notify_email)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [claims.org_id, pairing.machine_name, pairing.platform, claims.email ?? null],
      );
      await execute(`UPDATE machine_pairings SET status = 'approved', machine_id = $1 WHERE id = $2`, [
        machine!.id,
        pairing.id,
      ]);
      return json({ success: true, machine: { id: machine!.id, name: pairing.machine_name } });
    }

    // ── POST /api/machine/poll (daemon heartbeat + command pickup) ──
    if (method === "POST" && path === "/api/machine/poll") {
      const token = extractBearer(req) ?? "";
      const machine = token.startsWith("mem_mac_") ? await findMachineByToken(token) : null;
      if (!machine || machine.revoked_at || !machine.token_hash) {
        return json({ error: "machine_revoked", action: "exit" }, 401);
      }
      await execute(`UPDATE machines SET last_seen_at = now() WHERE id = $1`, [machine.id]);

      const commands = await query<{ id: string; command: string }>(
        `SELECT id::text, command FROM machine_commands
         WHERE machine_id = $1 AND status = 'pending' AND created_at > now() - interval '10 minutes'
         ORDER BY created_at ASC LIMIT 5`,
        [machine.id],
      );
      if (commands.length > 0) {
        await execute(
          `UPDATE machine_commands SET status = 'delivered' WHERE id = ANY($1::uuid[])`,
          [commands.map((c) => c.id)],
        );
      }

      // Active control session (for WebRTC signaling) — the daemon learns its
      // session id here so it can exchange SDP/ICE with the dashboard viewer.
      const activeSession = await queryOne<{ id: string }>(
        `SELECT id::text FROM machine_sessions
         WHERE machine_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
        [machine.id],
      );

      return json({
        interval: commands.length > 0 ? 1 : 3,
        commands: commands.map((c) => ({ id: c.id, command: c.command })),
        session_id: activeSession?.id ?? null,
      });
    }

    // ── POST /api/machine/result (daemon reports execution result) ──
    if (method === "POST" && path === "/api/machine/result") {
      const token = extractBearer(req) ?? "";
      const machine = token.startsWith("mem_mac_") ? await findMachineByToken(token) : null;
      if (!machine || machine.revoked_at) return json({ error: "machine_revoked", action: "exit" }, 401);

      const body = await req.json().catch(() => ({}));
      const commandId = typeof body.command_id === "string" ? body.command_id : "";
      if (!commandId) return json({ error: "command_id required" }, 400);

      const updated = await execute(
        `UPDATE machine_commands
         SET status = $1, exit_code = $2, stdout = $3, stderr = $4, error = $5, completed_at = now()
         WHERE id = $6 AND machine_id = $7 AND status = 'delivered'`,
        [
          body.error ? "failed" : "completed",
          typeof body.exit_code === "number" ? body.exit_code : null,
          typeof body.stdout === "string" ? body.stdout.slice(0, 20_000) : "",
          typeof body.stderr === "string" ? body.stderr.slice(0, 20_000) : "",
          typeof body.error === "string" ? body.error.slice(0, 2000) : null,
          commandId,
          machine.id,
        ],
      );
      return json({ success: updated > 0 });
    }

    // ── GET /api/machine/kill?k= (EMAIL KILL BUTTON — one-time token) ──
    if (method === "GET" && path === "/api/machine/kill") {
      const k = url.searchParams.get("k") ?? "";
      if (!k || !/^[a-f0-9]{64}$/.test(k)) {
        return killHtml("Invalid kill link", "This link is malformed or already used.");
      }

      const session = await queryOne<{ id: string; machine_id: string; machine_name: string; agent_name: string | null }>(
        `SELECT s.id, s.machine_id::text, m.name AS machine_name, s.agent_name
         FROM machine_sessions s JOIN machines m ON m.id = s.machine_id
         WHERE s.kill_token_hash = $1 AND s.status = 'active' LIMIT 1`,
        [await sha256Hex(k)],
      );
      if (!session) {
        return killHtml("Link expired", "No active session matches this kill link (already used or session ended).");
      }

      await killMachine(session.machine_id, "email kill button");
      return killHtml(
        "Connection killed ✓",
        `The agent's connection to <b>${session.machine_name}</b> was severed and the machine token revoked. ` +
          `The daemon has exited; the machine must be re-paired before any agent can control it again.`,
      );
    }

    // ── POST /api/machine/kill (dashboard, Clerk auth) ──
    if (method === "POST" && path === "/api/machine/kill") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);

      const body = await req.json().catch(() => ({}));
      const machineId = typeof body.machine_id === "string" ? body.machine_id : "";
      const machine = await queryOne<{ id: string }>(
        `SELECT id FROM machines WHERE id = $1 AND workspace_id = $2`,
        [machineId, claims.org_id ?? ""],
      );
      if (!machine) return json({ error: "machine_not_found" }, 404);

      await killMachine(machine.id, "dashboard kill");
      return json({ success: true });
    }

    // ── POST /api/machine/control/start (dashboard, Clerk) — open a control session ──
    if (method === "POST" && path === "/api/machine/control/start") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);
      if (!claims.org_id) return json({ error: "no_active_workspace" }, 400);

      const body = await req.json().catch(() => ({}));
      const machineId = typeof body.machine_id === "string" ? body.machine_id : "";
      const machine = await queryOne<Machine>(
        `SELECT id, workspace_id, name, platform, token_hash, notify_email,
                last_seen_at::text, revoked_at::text
         FROM machines WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL`,
        [machineId, claims.org_id],
      );
      if (!machine) return json({ error: "machine_not_found" }, 404);

      const session = await getOrCreateSession(machine, null, claims.email ?? "you", "remote desktop");
      return json({ session_id: session.id, machine: { id: machine.id, name: machine.name } });
    }

    // ── POST /api/machine/control/send (dashboard, Clerk) — viewer → machine ──
    if (method === "POST" && path === "/api/machine/control/send") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);

      const body = await req.json().catch(() => ({}));
      const sessionId = typeof body.session_id === "string" ? body.session_id : "";
      const kind = typeof body.kind === "string" ? body.kind : "";
      const payload = body.payload ?? {};
      if (!sessionId || !kind) return json({ error: "session_id and kind required" }, 400);
      if (!["offer", "ice", "input", "bye"].includes(kind)) return json({ error: "invalid_kind" }, 400);

      // Bound signaling payload size — SDP/ICE/input blobs must be small.
      const payloadStr = JSON.stringify(payload);
      if (payloadStr.length > MAX_SIGNAL_PAYLOAD_BYTES) {
        return json({ error: "payload_too_large" }, 413);
      }

      const owns = await queryOne<{ id: string }>(
        `SELECT s.id FROM machine_sessions s JOIN machines m ON m.id = s.machine_id
         WHERE s.id = $1 AND m.workspace_id = $2 AND s.status = 'active'`,
        [sessionId, claims.org_id ?? ""],
      );
      if (!owns) return json({ error: "session_not_found" }, 404);

      await execute(
        `INSERT INTO machine_signaling (session_id, machine_id, direction, kind, payload)
         SELECT s.id, s.machine_id, 'viewer_to_machine', $2, $3::jsonb
         FROM machine_sessions s WHERE s.id = $1`,
        [sessionId, kind, payloadStr],
      );
      return json({ ok: true });
    }

    // ── GET /api/machine/control/poll (dashboard, Clerk) — machine → viewer ──
    if (method === "GET" && path === "/api/machine/control/poll") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);

      const sessionId = url.searchParams.get("session_id") ?? "";
      if (!sessionId) return json({ error: "session_id required" }, 400);

      const owns = await queryOne<{ id: string }>(
        `SELECT s.id FROM machine_sessions s JOIN machines m ON m.id = s.machine_id
         WHERE s.id = $1 AND m.workspace_id = $2`,
        [sessionId, claims.org_id ?? ""],
      );
      if (!owns) return json({ error: "session_not_found" }, 404);

      const msgs = await query<{ id: string; kind: string; payload: unknown }>(
        `SELECT id::text, kind, payload FROM machine_signaling
         WHERE session_id = $1 AND direction = 'machine_to_viewer' AND consumed = false
         ORDER BY created_at ASC LIMIT 20`,
        [sessionId],
      );
      if (msgs.length > 0) {
        await execute(
          `UPDATE machine_signaling SET consumed = true WHERE id = ANY($1::uuid[])`,
          [msgs.map((m) => m.id)],
        );
      }
      return json({ messages: msgs.map((m) => ({ kind: m.kind, payload: m.payload })) });
    }

    // ── POST /api/machine/signal/poll (daemon) — viewer → machine ──
    if (method === "POST" && path === "/api/machine/signal/poll") {
      const token = extractBearer(req) ?? "";
      const machine = token.startsWith("mem_mac_") ? await findMachineByToken(token) : null;
      if (!machine || machine.revoked_at) return json({ error: "machine_revoked", action: "exit" }, 401);

      const body = await req.json().catch(() => ({}));
      const sessionId = typeof body.session_id === "string" ? body.session_id : "";
      if (!sessionId) return json({ error: "session_id required" }, 400);

      const msgs = await query<{ id: string; kind: string; payload: unknown }>(
        `SELECT id::text, kind, payload FROM machine_signaling
         WHERE session_id = $1 AND machine_id = $2 AND direction = 'viewer_to_machine' AND consumed = false
         ORDER BY created_at ASC LIMIT 20`,
        [sessionId, machine.id],
      );
      if (msgs.length > 0) {
        await execute(
          `UPDATE machine_signaling SET consumed = true WHERE id = ANY($1::uuid[])`,
          [msgs.map((m) => m.id)],
        );
      }
      return json({ messages: msgs.map((m) => ({ kind: m.kind, payload: m.payload })) });
    }

    // ── POST /api/machine/signal/send (daemon) — machine → viewer ──
    if (method === "POST" && path === "/api/machine/signal/send") {
      const token = extractBearer(req) ?? "";
      const machine = token.startsWith("mem_mac_") ? await findMachineByToken(token) : null;
      if (!machine || machine.revoked_at) return json({ error: "machine_revoked", action: "exit" }, 401);

      const body = await req.json().catch(() => ({}));
      const sessionId = typeof body.session_id === "string" ? body.session_id : "";
      const kind = typeof body.kind === "string" ? body.kind : "";
      const payload = body.payload ?? {};
      if (!sessionId || !kind) return json({ error: "session_id and kind required" }, 400);
      if (!["answer", "ice", "bye"].includes(kind)) return json({ error: "invalid_kind" }, 400);

      const payloadStr = JSON.stringify(payload);
      if (payloadStr.length > MAX_SIGNAL_PAYLOAD_BYTES) {
        return json({ error: "payload_too_large" }, 413);
      }

      await execute(
        `INSERT INTO machine_signaling (session_id, machine_id, direction, kind, payload)
         VALUES ($1, $2, 'machine_to_viewer', $3, $4::jsonb)`,
        [sessionId, machine.id, kind, payloadStr],
      );
      return json({ ok: true });
    }

    // ── GET /api/machine/list (dashboard, Clerk auth) ──
    if (method === "GET" && path === "/api/machine/list") {
      const claims = await requireClerk(req);
      if (!claims) return json({ error: "unauthorized" }, 401);
      if (!claims.org_id) return json({ error: "no_active_workspace" }, 400);
      const machines = await listMachinesForWorkspace(claims.org_id);
      return json({ machines });
    }

    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error("machine api error:", e);
    return json({ error: "internal_error" }, 500);
  }
}
