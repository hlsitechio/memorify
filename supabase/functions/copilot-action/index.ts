// copilot-action: server-scope command dispatcher.
// Authenticated via the user's JWT — every db call respects RLS.
// Logs every command to the events table as an audit trail.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Result = { ok: boolean; data?: unknown; error?: string };

function json(body: Result, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimErr } = await supabase.auth.getClaims(token);
  if (claimErr || !claims?.claims) return json({ ok: false, error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: { name: string; args?: any };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const { name, args = {} } = body;
  if (!name) return json({ ok: false, error: "missing name" }, 400);

  const started = Date.now();
  let out: Result;
  try {
    out = await dispatch(name, args, supabase, userId);
  } catch (e: any) {
    out = { ok: false, error: e?.message ?? "command failed" };
  }

  // Audit log — best-effort, never block on failure.
  try {
    await supabase.from("events").insert({
      user_id: userId,
      kind: `cmd.${name}`,
      source: "copilot",
      payload: { args, ok: out.ok, ms: Date.now() - started, error: out.error ?? null },
    });
  } catch {/* ignore */}

  return json(out, out.ok ? 200 : 400);
});

async function dispatch(name: string, args: any, db: any, userId: string): Promise<Result> {
  switch (name) {
    /* ───────── plugins ───────── */
    case "plugins.list": {
      const { data, error } = await db.from("plugins").select("*").eq("user_id", userId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(Math.min(args.limit ?? 100, 200));
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "plugins.add": {
      if (!args.name || !args.kind) return { ok: false, error: "name and kind required" };
      // Append to bottom: position = current max + 1.
      const { data: last } = await db.from("plugins").select("position").eq("user_id", userId)
        .order("position", { ascending: false }).limit(1);
      const nextPos = ((last?.[0]?.position ?? -1) as number) + 1;
      const { data, error } = await db.from("plugins").insert({
        user_id: userId,
        name: args.name,
        kind: args.kind,
        ref_id: args.ref_id ?? null,
        config: args.config ?? {},
        enabled: args.enabled ?? true,
        position: nextPos,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "plugins.update_config": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data, error } = await db.from("plugins").update({ config: args.config ?? {} })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "plugins.rename": {
      if (!args.id || !args.name) return { ok: false, error: "id and name required" };
      const { data, error } = await db.from("plugins").update({ name: args.name })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "plugins.toggle": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data, error } = await db.from("plugins").update({ enabled: !!args.enabled })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "plugins.reorder": {
      const ids: string[] = Array.isArray(args.ids) ? args.ids : [];
      if (!ids.length) return { ok: false, error: "ids required" };
      // Update sequentially — small lists.
      for (let i = 0; i < ids.length; i++) {
        const { error } = await db.from("plugins").update({ position: i })
          .eq("id", ids[i]).eq("user_id", userId);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true, data: { count: ids.length } };
    }
    case "plugins.move_to_top": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data: rows, error: e1 } = await db.from("plugins").select("id")
        .eq("user_id", userId).order("position", { ascending: true });
      if (e1) return { ok: false, error: e1.message };
      const ids = [args.id, ...(rows ?? []).map((r: any) => r.id).filter((i: string) => i !== args.id)];
      for (let i = 0; i < ids.length; i++) {
        const { error } = await db.from("plugins").update({ position: i })
          .eq("id", ids[i]).eq("user_id", userId);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true, data: { id: args.id } };
    }
    case "plugins.delete": {
      if (!args.id) return { ok: false, error: "id required" };
      const { error } = await db.from("plugins").delete().eq("id", args.id).eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { id: args.id } };
    }
  }
  return { ok: false, error: `unknown server command: ${name}` };
}
