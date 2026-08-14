import { query } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({ error: "Add ?confirm=yes" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const results: string[] = [];

  const statements = [
    `ALTER ROLE authenticator LOGIN`,
    `ALTER ROLE authenticated LOGIN NOINHERIT`,
    `ALTER ROLE anonymous LOGIN NOINHERIT`,
    `GRANT authenticated TO authenticator`,
    `GRANT anonymous TO authenticator`,
  ];

  for (const sql of statements) {
    try {
      await query(sql, []);
      results.push(`✓ ${sql}`);
    } catch (e) {
      results.push(`✗ ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
};
