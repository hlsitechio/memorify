// netlify/edge-functions/migrate-machines.ts — Memorify Remote schema
// Temporary edge function to apply the machines tables to Neon.
// Remove after first successful run: /api/migrate-machines?confirm=yes
import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("confirm") !== "yes") {
      return new Response(JSON.stringify({ error: "Add ?confirm=yes to confirm schema push" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];

    const statements = [
      `CREATE TABLE IF NOT EXISTS machines (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id text NOT NULL,
        name         text NOT NULL,
        platform     text,
        token_hash   text UNIQUE,
        notify_email text,
        allow_agent_access boolean NOT NULL DEFAULT false,
        last_seen_at timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        revoked_at   timestamptz
      )`,
      `ALTER TABLE machines ADD COLUMN IF NOT EXISTS allow_agent_access boolean NOT NULL DEFAULT false`,
      `CREATE INDEX IF NOT EXISTS machines_workspace_idx ON machines(workspace_id)`,
      `CREATE TABLE IF NOT EXISTS machine_pairings (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_code         text NOT NULL,
        machine_code_hash text NOT NULL,
        machine_name      text NOT NULL,
        platform          text,
        ip_hash           text,
        workspace_id      text,
        notify_email      text,
        status            text NOT NULL DEFAULT 'pending',
        machine_id        uuid,
        expires_at        timestamptz NOT NULL,
        created_at        timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS machine_pairings_code_idx ON machine_pairings(user_code)`,
      `CREATE INDEX IF NOT EXISTS machine_pairings_hash_idx ON machine_pairings(machine_code_hash)`,
      `CREATE TABLE IF NOT EXISTS machine_sessions (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        machine_id       uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
        workspace_id     text NOT NULL,
        agent_id         text,
        agent_name       text,
        status           text NOT NULL DEFAULT 'active',
        kill_token_hash  text NOT NULL,
        notified_email   text,
        commands_run     integer NOT NULL DEFAULT 0,
        started_at       timestamptz NOT NULL DEFAULT now(),
        last_activity_at timestamptz NOT NULL DEFAULT now(),
        ended_at         timestamptz
      )`,
      `CREATE INDEX IF NOT EXISTS machine_sessions_machine_idx ON machine_sessions(machine_id)`,
      `CREATE INDEX IF NOT EXISTS machine_sessions_kill_idx ON machine_sessions(kill_token_hash)`,
      `CREATE TABLE IF NOT EXISTS machine_commands (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   uuid NOT NULL REFERENCES machine_sessions(id) ON DELETE CASCADE,
        machine_id   uuid NOT NULL,
        command      text NOT NULL,
        status       text NOT NULL DEFAULT 'pending',
        exit_code    integer,
        stdout       text,
        stderr       text,
        error        text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz
      )`,
      `CREATE INDEX IF NOT EXISTS machine_commands_session_idx ON machine_commands(session_id)`,
      `CREATE INDEX IF NOT EXISTS machine_commands_pending_idx ON machine_commands(machine_id, status, created_at)`,
      `CREATE TABLE IF NOT EXISTS machine_signaling (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   uuid NOT NULL,
        machine_id   uuid NOT NULL,
        direction    text NOT NULL,          -- 'viewer_to_machine' | 'machine_to_viewer'
        kind         text NOT NULL,          -- 'offer' | 'answer' | 'ice' | 'input' | 'bye'
        payload      jsonb NOT NULL,
        consumed     boolean NOT NULL DEFAULT false,
        created_at   timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS machine_signaling_poll_idx
         ON machine_signaling(session_id, direction, consumed, created_at)`,
      `DELETE FROM machine_pairings WHERE created_at < now() - interval '1 hour'`,
    ];

    for (const sql of statements) {
      try {
        await query(sql, []);
        results.push(`✓ ${sql.slice(0, 60)}...`);
      } catch (e) {
        results.push(`✗ ${(e as Error).message}`);
      }
    }

    const existingMachines = await query(`SELECT id, workspace_id, name, last_seen_at::text, revoked_at::text FROM machines`, []).catch((e) => [{ error: (e as Error).message }]);
    const existingPairings = await query(`SELECT id, user_code, machine_name, status, expires_at::text, created_at::text FROM machine_pairings ORDER BY created_at DESC LIMIT 5`, []).catch((e) => [{ error: (e as Error).message }]);
    const existingSessions = await query(`SELECT id, machine_id, status, started_at::text, last_activity_at::text FROM machine_sessions ORDER BY started_at DESC LIMIT 5`, []).catch((e) => [{ error: (e as Error).message }]);
    const existingSignaling = await query(`SELECT id, session_id, direction, kind, consumed, created_at::text FROM machine_signaling ORDER BY created_at DESC LIMIT 10`, []).catch((e) => [{ error: (e as Error).message }]);

    return new Response(JSON.stringify({
      ok: true,
      existing_machines: existingMachines,
      existing_pairings: existingPairings,
      existing_sessions: existingSessions,
      existing_signaling: existingSignaling,
    }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, stack: (e as Error).stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
