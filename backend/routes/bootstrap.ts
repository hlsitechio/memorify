// routes/bootstrap.ts — Mirror Clerk user + org into Neon for debug/joins
// POST /api/bootstrap  (Clerk session JWT)
// GET  /api/bootstrap  (Clerk session JWT)

import { json } from "../lib/cors.ts";
import { verifyClerkJwt, extractBearer } from "../lib/clerk.ts";
import { execute, query } from "../lib/db.ts";

type BootstrapBody = {
  user?: {
    id?: string;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    image_url?: string | null;
  };
  workspace?: {
    id?: string;
    name?: string | null;
    slug?: string | null;
    image_url?: string | null;
  } | null;
};

export async function handleBootstrap(req: Request): Promise<Response> {
  const token = extractBearer(req);
  if (!token) return json({ error: "missing_bearer" }, 401);

  let claims: Awaited<ReturnType<typeof verifyClerkJwt>>;
  try {
    claims = await verifyClerkJwt(token);
  } catch (e) {
    return json({ error: "invalid_token", detail: String((e as Error).message) }, 401);
  }

  if (req.method === "GET") {
    const userRows = await query(
      `SELECT id, email, full_name FROM app_users WHERE id = $1`,
      [claims.sub],
    );
    const memberships = await query(
      `SELECT m.workspace_id, m.role, w.name, w.slug
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = $1
       ORDER BY w.created_at ASC`,
      [claims.sub],
    );
    const recent = await query(
      `SELECT kind, workspace_id, created_at::text AS created_at
       FROM identity_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [claims.sub],
    );
    return json({
      clerk: {
        user_id: claims.sub,
        org_id: claims.org_id ?? null,
        org_role: claims.org_role ?? null,
        email: claims.email ?? null,
      },
      neon: {
        user: userRows[0] ?? null,
        memberships,
        recent_events: recent,
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: BootstrapBody = {};
  try {
    body = (await req.json()) as BootstrapBody;
  } catch {
    body = {};
  }

  const userId = body.user?.id || claims.sub;
  if (userId !== claims.sub) {
    return json({ error: "user_mismatch" }, 403);
  }

  const email = body.user?.email ?? claims.email ?? null;
  const first = body.user?.first_name ?? null;
  const last = body.user?.last_name ?? null;
  const full =
    body.user?.full_name ??
    ([first, last].filter(Boolean).join(" ") || null);
  const userImage = body.user?.image_url ?? null;

  const wsId = body.workspace?.id || claims.org_id || null;
  const wsName = (body.workspace?.name || "Workspace").trim() || "Workspace";
  const wsSlug = body.workspace?.slug ?? null;
  const wsImage = body.workspace?.image_url ?? null;
  const role = claims.org_role || "org:admin";

  await execute(
    `INSERT INTO app_users (id, email, first_name, last_name, full_name, image_url, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (id) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, app_users.email),
       first_name = COALESCE(EXCLUDED.first_name, app_users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, app_users.last_name),
       full_name = COALESCE(EXCLUDED.full_name, app_users.full_name),
       image_url = COALESCE(EXCLUDED.image_url, app_users.image_url),
       last_seen_at = now(),
       updated_at = now()`,
    [userId, email, first, last, full, userImage],
  );

  await execute(
    `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
     VALUES ('user.upsert', $1, $2, $3::jsonb)`,
    [userId, wsId, JSON.stringify({ email, full_name: full })],
  );

  let workspace: Record<string, unknown> | null = null;
  if (wsId) {
    await execute(
      `INSERT INTO workspaces (id, name, slug, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = COALESCE(EXCLUDED.slug, workspaces.slug),
         image_url = COALESCE(EXCLUDED.image_url, workspaces.image_url),
         updated_at = now()`,
      [wsId, wsName, wsSlug, wsImage, userId],
    );

    await execute(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_at = now()`,
      [wsId, userId, role],
    );

    await execute(
      `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
       VALUES ('workspace.upsert', $1, $2, $3::jsonb)`,
      [userId, wsId, JSON.stringify({ name: wsName, slug: wsSlug, role })],
    );

    const wsRows = await query(
      `SELECT id, name, slug, created_by, created_at::text AS created_at
       FROM workspaces WHERE id = $1`,
      [wsId],
    );
    workspace = (wsRows[0] as Record<string, unknown>) ?? null;
  }

  return json({
    ok: true,
    user_id: userId,
    workspace,
    note: wsId
      ? "user + workspace mirrored to Neon"
      : "user mirrored; no active Clerk org yet — create/select org then call again",
  });
}
