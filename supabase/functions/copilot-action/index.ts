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

    /* ───────── agents ───────── */
    case "agents.list": {
      const { data, error } = await db.from("agents").select("id,name,kind,status,metadata,last_seen_at,created_at")
        .eq("user_id", userId).order("created_at", { ascending: false })
        .limit(Math.min(args.limit ?? 100, 200));
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "agents.new": {
      const kind = (args.kind as string) || "claude_code";
      const name = (args.name as string) || (kind === "claude_code" ? "Claude Code" : "Custom agent");
      const { data, error } = await db.from("agents")
        .insert({ user_id: userId, kind, name, status: "pending" })
        .select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "agents.rename": {
      if (!args.id || !args.name) return { ok: false, error: "id and name required" };
      const { data, error } = await db.from("agents").update({ name: args.name })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "agents.reset_name": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data: a, error: e1 } = await db.from("agents").select("kind")
        .eq("id", args.id).eq("user_id", userId).single();
      if (e1) return { ok: false, error: e1.message };
      const def = a?.kind === "claude_code" ? "Claude Code" : "Custom agent";
      const { data, error } = await db.from("agents").update({ name: def })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }

    /* ───────── workspace (per-agent) ───────── */
    case "workspace.set_name":
    case "workspace.rename": {
      if (!args.id || !args.name) return { ok: false, error: "id and name required" };
      const { data: a, error: e1 } = await db.from("agents").select("metadata")
        .eq("id", args.id).eq("user_id", userId).single();
      if (e1) return { ok: false, error: e1.message };
      const meta = { ...((a?.metadata as any) || {}), workspace_name: args.name };
      const { data, error } = await db.from("agents").update({ metadata: meta })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "workspace.delete_name":
    case "workspace.reset": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data: a, error: e1 } = await db.from("agents").select("metadata")
        .eq("id", args.id).eq("user_id", userId).single();
      if (e1) return { ok: false, error: e1.message };
      const meta = { ...((a?.metadata as any) || {}) };
      delete (meta as any).workspace_name;
      const { data, error } = await db.from("agents").update({ metadata: meta })
        .eq("id", args.id).eq("user_id", userId).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { ...data, workspace_id: `agent:${args.id}` } };
    }

    /* ───────── documents ───────── */
    case "documents.list": {
      let qb = db.from("documents").select("id,name,mime,size,storage_path,status,created_at,agent_id")
        .eq("user_id", userId).order("created_at", { ascending: false })
        .limit(Math.min(args.limit ?? 100, 200));
      if (args.q) qb = qb.ilike("name", `%${args.q}%`);
      // Per-agent attribution: agents only see their own docs (or the
      // explicitly shared "personal" pool if scope='personal'). User UI
      // can pass scope='all' to bypass and see everything they own.
      if (args.scope !== "all") {
        if (args.agent_id) qb = qb.eq("agent_id", args.agent_id);
        else if (args.scope === "personal") qb = qb.is("agent_id", null);
      }
      const { data, error } = await qb;
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "documents.add_note": {
      if (!args.title) return { ok: false, error: "title required" };
      const fmt = ["md", "txt", "json"].includes(args.format) ? args.format : "md";
      const mime = fmt === "md" ? "text/markdown" : fmt === "json" ? "application/json" : "text/plain";
      let textContent: string;
      if (fmt === "json") {
        if (typeof args.content === "string") {
          try { textContent = JSON.stringify(JSON.parse(args.content), null, 2); }
          catch { return { ok: false, error: "content is not valid JSON" }; }
        } else if (args.content && typeof args.content === "object") {
          textContent = JSON.stringify(args.content, null, 2);
        } else {
          return { ok: false, error: "content required (string or object)" };
        }
      } else {
        if (typeof args.content !== "string") return { ok: false, error: "content (string) required" };
        textContent = args.content;
      }
      const safe = String(args.title).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "note";
      const filename = `${safe}.${fmt}`;
      const bytes = new TextEncoder().encode(textContent);
      const path = `${userId}/${crypto.randomUUID()}-${filename}`;
      const { error: upErr } = await db.storage.from("documents").upload(path, bytes, { contentType: mime });
      if (upErr) return { ok: false, error: upErr.message };
      const { data, error } = await db.from("documents").insert({
        user_id: userId, agent_id: args.agent_id ?? null,
        name: filename, mime, size: bytes.byteLength, storage_path: path, status: "ready",
        metadata: { kind: "note", format: fmt },
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "documents.add_from_file":
    case "documents.add_from_base64": {
      if (!args.base64) return { ok: false, error: "base64 required" };
      if (!args.name && args.path) args.name = String(args.path).split(/[\\/]/).pop();
      if (!args.name) return { ok: false, error: "name (or path) required" };
      const b64 = String(args.base64).replace(/^data:[^;]+;base64,/, "");
      let bytes: Uint8Array;
      try {
        const bin = atob(b64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } catch { return { ok: false, error: "invalid base64" }; }
      const mime = args.mime || mimeFromName(args.name) || "application/octet-stream";
      const path = `${userId}/${crypto.randomUUID()}-${args.name}`;
      const { error: upErr } = await db.storage.from("documents").upload(path, bytes, { contentType: mime });
      if (upErr) return { ok: false, error: upErr.message };
      const { data, error } = await db.from("documents").insert({
        user_id: userId, agent_id: args.agent_id ?? null,
        name: args.name, mime, size: bytes.byteLength, storage_path: path, status: "ready",
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "documents.add_from_url": {
      if (!args.url) return { ok: false, error: "url required" };
      let res: Response;
      try { res = await fetch(args.url); } catch (e: any) { return { ok: false, error: `fetch failed: ${e.message}` }; }
      if (!res.ok) return { ok: false, error: `fetch ${res.status}` };
      const buf = new Uint8Array(await res.arrayBuffer());
      const urlName = args.url.split("?")[0].split("/").pop() || "download";
      const name = args.name || urlName;
      const mime = res.headers.get("content-type")?.split(";")[0] || mimeFromName(name) || "application/octet-stream";
      const path = `${userId}/${crypto.randomUUID()}-${name}`;
      const { error: upErr } = await db.storage.from("documents").upload(path, buf, { contentType: mime });
      if (upErr) return { ok: false, error: upErr.message };
      const { data, error } = await db.from("documents").insert({
        user_id: userId, agent_id: args.agent_id ?? null,
        name, mime, size: buf.byteLength, storage_path: path, status: "ready",
        metadata: { source_url: args.url },
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "documents.delete": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data: row, error: e1 } = await db.from("documents").select("storage_path")
        .eq("id", args.id).eq("user_id", userId).single();
      if (e1) return { ok: false, error: e1.message };
      if (row?.storage_path) await db.storage.from("documents").remove([row.storage_path]);
      const { error } = await db.from("documents").delete().eq("id", args.id).eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { id: args.id } };
    }
    case "documents.signed_url": {
      if (!args.id) return { ok: false, error: "id required" };
      const { data: row, error: e1 } = await db.from("documents").select("storage_path,name")
        .eq("id", args.id).eq("user_id", userId).single();
      if (e1) return { ok: false, error: e1.message };
      const ttl = Math.min(Math.max(Number(args.ttl) || 300, 30), 3600);
      const { data, error } = await db.storage.from("documents").createSignedUrl(row.storage_path, ttl);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { url: data.signedUrl, name: row.name, ttl } };
    }

    /* ───────── memory ───────── */
    case "memory.add": {
      if (!args.content) return { ok: false, error: "content required" };
      const { data, error } = await db.from("memories").insert({
        user_id: userId,
        namespace: args.namespace || "default",
        category: args.category || "general",
        content: String(args.content),
        tags: Array.isArray(args.tags) ? args.tags : null,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "memory.list": {
      let qb = db.from("memories").select("id,mem_id,namespace,category,content,tags,archived,created_at,updated_at")
        .eq("user_id", userId).order("updated_at", { ascending: false })
        .limit(Math.min(args.limit ?? 100, 500));
      if (!args.include_archived) qb = qb.eq("archived", false);
      if (args.namespace) qb = qb.eq("namespace", args.namespace);
      if (args.category) qb = qb.eq("category", args.category);
      if (args.q) qb = qb.ilike("content", `%${args.q}%`);
      const { data, error } = await qb;
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "memory.delete": {
      if (!args.id) return { ok: false, error: "id required" };
      const { error } = await db.from("memories").delete().eq("id", args.id).eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { id: args.id } };
    }
    case "memory.session.create": {
      const today = new Date().toISOString().slice(0, 10);
      let slug: string;
      if (args.name) {
        slug = String(args.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || today;
      } else if (args.date) {
        slug = String(args.date).replace(/[^0-9-]/g, "");
      } else if (typeof args.number === "number") {
        slug = `s${args.number}`;
      } else {
        slug = today;
      }
      const namespace = `session:${slug}`;
      // Idempotent: if marker exists, return it.
      const { data: existing } = await db.from("memories").select("*")
        .eq("user_id", userId).eq("namespace", namespace).eq("category", "session").maybeSingle();
      if (existing) return { ok: true, data: { ...existing, slug, namespace, existed: true } };
      const title = args.name || args.date || (typeof args.number === "number" ? `Session ${args.number}` : `Session ${today}`);
      const content = args.description ? `${title}\n\n${args.description}` : title;
      const { data, error } = await db.from("memories").insert({
        user_id: userId, namespace, category: "session",
        content, tags: Array.isArray(args.tags) ? args.tags : null,
        metadata: { kind: "session", slug, title },
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { ...data, slug, namespace } };
    }
    case "memory.session.list": {
      const { data: markers, error } = await db.from("memories")
        .select("id,namespace,content,metadata,tags,created_at,updated_at")
        .eq("user_id", userId).eq("category", "session").eq("archived", false)
        .order("created_at", { ascending: false }).limit(200);
      if (error) return { ok: false, error: error.message };
      const out: any[] = [];
      for (const m of markers ?? []) {
        const { count } = await db.from("memories").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("namespace", m.namespace).neq("category", "session");
        const slug = m.namespace.startsWith("session:") ? m.namespace.slice("session:".length) : m.namespace;
        out.push({ id: m.id, slug, namespace: m.namespace, title: (m.metadata as any)?.title ?? m.content, item_count: count ?? 0, created_at: m.created_at, updated_at: m.updated_at });
      }
      return { ok: true, data: out };
    }
    case "memory.session.add": {
      if (!args.content) return { ok: false, error: "content required" };
      let namespace: string | null = null;
      if (args.namespace) namespace = String(args.namespace);
      else if (args.slug) namespace = `session:${args.slug}`;
      else if (args.name) {
        // Find a session marker whose title matches.
        const { data: m } = await db.from("memories").select("namespace,metadata,content")
          .eq("user_id", userId).eq("category", "session");
        const hit = (m ?? []).find((r: any) => (r.metadata?.title ?? r.content) === args.name);
        if (hit) namespace = hit.namespace;
      }
      if (!namespace) return { ok: false, error: "session not found (provide slug, namespace, or name)" };
      const { data, error } = await db.from("memories").insert({
        user_id: userId, namespace,
        category: args.category || "general",
        content: String(args.content),
        tags: Array.isArray(args.tags) ? args.tags : null,
      }).select().single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data };
    }
    case "memory.session.delete": {
      const namespace: string | null = args.namespace || (args.slug ? `session:${args.slug}` : null);
      if (!namespace) return { ok: false, error: "slug or namespace required" };
      if (args.cascade) {
        const { error } = await db.from("memories").delete()
          .eq("user_id", userId).eq("namespace", namespace);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { namespace, cascade: true } };
      }
      const { error } = await db.from("memories").delete()
        .eq("user_id", userId).eq("namespace", namespace).eq("category", "session");
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: { namespace } };
    }
  }
  return { ok: false, error: `unknown server command: ${name}` };
}

function mimeFromName(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  };
  return map[ext] ?? null;
}
