// Netlify Edge Function — AgentMail webhook receiver
// POST /webhook/agentmail?workspace_id=org_...
// Self-contained - no backend imports (edge-compatible)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agentmail-signature, x-workspace-id",
  "Access-Control-Max-Age": "86400",
};

interface AgentMailEvent {
  type: string;
  message: {
    message_id: string;
    thread_id: string;
    from: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
    in_reply_to?: string;
    references?: string[];
    labels?: string[];
    timestamp: string;
  };
}

function extractAction(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /\bACTION\s*[:=]\s*deploy\b/i,
    /\bACTION\s*[:=]\s*redeploy\b/i,
    /\bACTION\s*[:=]\s*fix\s+mcp\b/i,
    /\bACTION\s*[:=]\s*run\s+security\s+audit\b/i,
    /\bACTION\s*[:=]\s*run\s+report\b/i,
    /\bACTION\s*[:=]\s*status\b/i,
    /\bACTION\s*[:=]\s*restart\s+gateway\b/i,
    /\bACTION\s*[:=]\s*check\s+dns\b/i,
    /\bACTION\s*[:=]\s*check\s+neon\b/i,
    /\bACTION\s*[:=]\s*check\s+clerk\b/i,
    /\bDEPLOY\b/i,
    /\bREDEPLOY\b/i,
    /\bFIX\s+MCP\b/i,
    /\bSECURITY\s+AUDIT\b/i,
    /\bRUN\s+REPORT\b/i,
    /\bSTATUS\b/i,
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      return match ? match[0].toUpperCase() : null;
    }
  }
  return null;
}

async function sendAgentMailReply(
  apiKey: string,
  inboxId: string,
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ ok: boolean; messageId?: string }> {
  const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: [to], subject, html, text, labels: ["copilot-reply"] }),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, messageId: data.message_id };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

function formatReplyHtml(action: string, result: any): string {
  const color = result?.ok ? "#22c55e" : "#ef4444";
  return `
<!DOCTYPE html>
<html><body style="font-family:Inter,Segoe UI,sans-serif;background:#0b0f14;color:#e6edf5;padding:24px;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="color:#2dd4bf;">Memorify Copilot — Action Result</h2>
    <div style="background:#121821;border:1px solid #243041;border-radius:10px;padding:16px;">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
        <strong style="color:#e6edf5;">Action:</strong> <code style="color:#2dd4bf;">${action}</code>
        <span style="color:${color};font-weight:700;text-transform:uppercase;font-size:0.7rem;">${result?.ok ? "OK" : "ERROR"}</span>
      </div>
      <pre style="margin:0;color:#e6edf5;white-space:pre-wrap;word-break:break-word;font-size:0.85rem;">${JSON.stringify(result, null, 2)}</pre>
    </div>
    <hr style="border-color:#243041;margin:20px 0;" />
    <p style="color:#475569;font-size:0.8rem;">Memorify Copilot · ${new Date().toISOString()}</p>
  </div>
</body></html>`;
}

function formatReplyText(action: string, result: any): string {
  return `Memorify Copilot — Action Result\n\nAction: ${action}\nStatus: ${result?.ok ? "OK" : "ERROR"}\n\n${JSON.stringify(result, null, 2)}`;
}

async function executeCopilotAction(action: string, workspaceId: string): Promise<any> {
  switch (action.toUpperCase()) {
    case "STATUS":
    case "ACTION: STATUS": {
      const probes = await Promise.allSettled([
        fetch("https://memorify.dev", { method: "HEAD" }),
        fetch("https://memorify.dev/api/health", { method: "GET" }),
        fetch("https://memorify.dev/mcp", { method: "GET" }),
        fetch("https://clerk.memorify.dev", { method: "HEAD" }),
      ]);
      return {
        ok: true,
        site: probes[0].status === "fulfilled" && probes[0].value.ok ? probes[0].value.status : "failed",
        api: probes[1].status === "fulfilled" && probes[1].value.ok ? probes[1].value.status : "failed",
        mcp: probes[2].status === "fulfilled" && probes[2].value.ok ? probes[2].value.status : "failed",
        clerk: probes[3].status === "fulfilled" && probes[3].value.ok ? probes[3].value.status : "failed",
      };
    }
    case "CHECK DNS":
    case "ACTION: CHECK DNS": {
      return { ok: true, detail: "DNS check - use CLI for full records" };
    }
    default:
      return {
        ok: false,
        detail: `Action ${action} requires sub-agent. Queue it via Copilot dashboard.`,
        suggestion: "Use the Copilot UI to run complex actions like deploy, fix_mcp, security_audit.",
      };
  }
}

// Neon HTTP API client (edge-compatible, no external deps)
async function neonQuery(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  const dsn = Deno.env.get("NEON_DATABASE_URL");
  if (!dsn) throw new Error("NEON_DATABASE_URL not set");

  // Strip channel_binding=require
  const cleanDsn = dsn.replace(/&channel_binding=require/g, "").replace(/\?&/, "?").replace(/&$/, "");

  // Extract connection details from DSN for Neon HTTP API
  // Format: postgresql://user:pass@host/db?params
  const url = new URL(cleanDsn.replace("postgresql://", "https://").replace("postgres://", "https://"));
  const projectId = url.hostname.split(".")[0];
  const password = url.password;

  // Use Neon HTTP API directly
  const apiUrl = `https://${projectId}.neon.tech/sql`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${password}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      query: sql,
      params: params,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Neon query failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return { rows: data.results?.[0]?.rows ?? [] };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agentmail-signature, x-workspace-id",
  "Access-Control-Max-Age": "86400",
};

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id") || req.headers.get("x-workspace-id");
  if (!workspaceId) return json({ error: "workspace_id required" }, 400);

  // Find active AgentMail connector
  const connectorResult = await neonQuery(
    `SELECT * FROM connectors WHERE workspace_id = $1 AND kind = 'agentmail' AND status = 'active' LIMIT 1`,
    [workspaceId],
  );

  if (!connectorResult.rows.length) {
    return json({ error: "No active AgentMail connector" }, 404);
  }

  const connector = connectorResult.rows[0];
  const config = connector.config as Record<string, unknown>;
  const apiKey = config.api_key as string;
  const inboxId = config.inbox_id as string;
  const webhookSecret = config.webhook_secret as string;

  // Verify HMAC
  if (webhookSecret) {
    const signature = req.headers.get("x-agentmail-signature") || "";
    const body = await req.clone().text();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (signature !== expected) {
      return json({ error: "Invalid signature" }, 401);
    }
  }

  let payload: AgentMailEvent;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Only handle message.received
  if (payload.type !== "message.received" && payload.type !== "message.received.unauthenticated") {
    return json({ ok: true });
  }

  const message = payload.message;
  const action = extractAction(message.text || "");
  if (!action) {
    return json({ ok: true, detail: "No action recognized" });
  }

  // Execute action
  const result = await executeCopilotAction(action, workspaceId);

  // Reply in-thread
  const fromEmail = message.from.match(/<([^>]+)>/)?.[1] || message.from;
  const subject = message.subject.startsWith("Re:") ? message.subject : `Re: ${message.subject}`;

  await sendAgentMailReply(
    apiKey,
    inboxId,
    fromEmail,
    subject,
    formatReplyHtml(action, result),
    formatReplyText(action, result)
  );

  return json({ ok: true, action, result });
};