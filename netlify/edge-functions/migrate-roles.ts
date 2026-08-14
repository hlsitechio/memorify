// Create the 'authenticated' and 'anonymous' roles needed by Neon Data API
import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const results: string[] = [];

  const statements = [
    // Create authenticated role (if not exists)
    `DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
    END $$`,

    // Create anonymous role (if not exists)
    `DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anonymous') THEN
        CREATE ROLE anonymous;
      END IF;
    END $$`,

    // Create authenticator role (if not exists) — this is the bridge role
    `DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator;
      END IF;
    END $$`,

    // Grant authenticated to authenticator (so authenticator can switch to authenticated)
    `GRANT authenticated TO authenticator`,

    // Grant anonymous to authenticator
    `GRANT anonymous TO authenticator`,

    // Grant schema access to authenticated
    `GRANT USAGE ON SCHEMA public TO authenticated`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated`,

    // Grant schema access to anonymous (read-only)
    `GRANT USAGE ON SCHEMA public TO anonymous`,
  ];

  for (const sql of statements) {
    try {
      await query(sql, []);
      results.push(`✓ ${sql.slice(0, 70).replace(/\n/g, ' ')}...`);
    } catch (e) {
      results.push(`✗ ${(e as Error).message.slice(0, 100)}`);
    }
  }

  // Check role exists
  const roles = await query<{ rolname: string }>(
    `SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated', 'anonymous', 'authenticator') ORDER BY rolname`,
    [],
  );

  return new Response(JSON.stringify({
    ok: true,
    results,
    roles: roles.map(r => r.rolname),
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
