import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const results: string[] = [];

  // Check current role status
  const roleInfo = await query<{ rolname: string, rolcanlogin: boolean, rolinherit: boolean }>(
    `SELECT rolname, rolcanlogin, rolinherit FROM pg_roles WHERE rolname IN ('authenticated', 'anonymous', 'authenticator') ORDER BY rolname`,
    [],
  );

  for (const r of roleInfo) {
    results.push(`  ${r.rolname}: login=${r.rolcanlogin}, inherit=${r.rolinherit}`);
  }

  // Try to fix: the authenticator role needs to be able to switch to authenticated
  try {
    // Set the authenticator role to have a password (random, since Neon Data API
    // uses its own connection mechanism that bypasses this)
    await query(`ALTER ROLE authenticator WITH LOGIN PASSWORD '${crypto.randomUUID()}'`, []);
    results.push("✓ Set authenticator password");
  } catch (e) {
    results.push(`✗ Set authenticator password: ${(e as Error).message}`);
  }

  try {
    await query(`ALTER ROLE authenticated WITH NOLOGIN`, []);
    results.push("✓ Set authenticated NOLOGIN (security: can't login directly)");
  } catch (e) {
    results.push(`✗ authenticated NOLOGIN: ${(e as Error).message}`);
  }

  try {
    await query(`ALTER ROLE anonymous WITH NOLOGIN`, []);
    results.push("✓ Set anonymous NOLOGIN (security: can't login directly)");
  } catch (e) {
    results.push(`✗ anonymous NOLOGIN: ${(e as Error).message}`);
  }

  // Verify
  const finalRoles = await query<{ rolname: string, rolcanlogin: boolean }>(
    `SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('authenticated', 'anonymous', 'authenticator') ORDER BY rolname`,
    [],
  );

  return new Response(JSON.stringify({
    ok: true,
    results,
    final_roles: finalRoles.map(r => `${r.rolname}: login=${r.rolcanlogin}`),
  }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
