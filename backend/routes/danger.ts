import { json } from "../lib/cors.ts";
import { execute } from "../lib/db.ts";
import { verifyClerkJwt } from "../lib/clerk.ts";

export async function handleDangerAction(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Authenticate user & workspace
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  let auth;
  try {
    auth = await verifyClerkJwt(token);
  } catch (err) {
    return json({ error: "Invalid token" }, 401);
  }

  const workspace_id = auth.org_id;
  if (!workspace_id) {
    return json({ error: "Organization/Workspace context required" }, 400);
  }

  // Ensure user has admin rights (org:admin)
  if (auth.org_role !== "org:admin") {
    return json({ error: "Forbidden: You must be a workspace admin to perform destructive actions." }, 403);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { action } = body;

  try {
    if (action === "wipe_memory") {
      // Clear memories, memory_versions (cascade), documents, document_chunks (cascade)
      const countMemories = await execute("DELETE FROM memories WHERE workspace_id = $1", [workspace_id]);
      const countDocs = await execute("DELETE FROM documents WHERE workspace_id = $1", [workspace_id]);
      
      // Also clear knowledge base stats / collections if needed, but memories/documents are the bulk.
      
      return json({ success: true, wiped_memories: countMemories, wiped_docs: countDocs });
    }

    if (action === "clear_chat") {
      // Clear copilot chat history
      const count = await execute("DELETE FROM copilot_sessions WHERE workspace_id = $1", [workspace_id]);
      return json({ success: true, cleared_sessions: count });
    }

    if (action === "revoke_tokens") {
      // Revoke agent tokens and mcp oauth refresh tokens
      const countAgentTokens = await execute("DELETE FROM agent_tokens WHERE workspace_id = $1", [workspace_id]);
      const countOAuthTokens = await execute("DELETE FROM mcp_oauth_refresh_tokens WHERE workspace_id = $1", [workspace_id]);
      // Note: we don't delete mcp_oauth_auth_codes or clients, just the active tokens
      return json({ success: true, revoked_agent_tokens: countAgentTokens, revoked_oauth_tokens: countOAuthTokens });
    }

    if (action === "request_deletion") {
      const reason = body.reason || "No reason provided";
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const DEFAULT_ALERT_EMAIL = "hlarosesurprenant@gmail.com";

      if (RESEND_API_KEY) {
        try {
          const resendPayload = {
            from: "Memorify Alerts <onboarding@resend.dev>",
            to: [DEFAULT_ALERT_EMAIL],
            reply_to: auth.email || "memorify-ops@agentmail.to",
            subject: `🚨 Organization Deletion Request: ${workspace_id}`,
            html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:32px 16px;background-color:#030712;font-family:sans-serif;color:#e2e8f0;">
  <h2 style="color:#ef4444;">Organization Deletion Request</h2>
  <p><strong>User ID:</strong> ${auth.user_id}</p>
  <p><strong>Workspace ID:</strong> ${workspace_id}</p>
  <p><strong>Reason provided:</strong></p>
  <blockquote style="background:#1e293b;padding:12px;border-left:4px solid #ef4444;margin:0;">
    ${reason}
  </blockquote>
</body>
</html>`,
            text: `Organization Deletion Request\nUser ID: ${auth.user_id}\nWorkspace ID: ${workspace_id}\nReason: ${reason}`
          };

          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(resendPayload),
          });
          
          if (!resendRes.ok) {
            console.error("Failed to send deletion request email", await resendRes.text());
          }
        } catch (emailErr) {
          console.error("Failed to send Resend email:", emailErr);
        }
      } else {
        console.warn("RESEND_API_KEY missing, deletion request logged but not emailed:", { workspace_id, reason });
      }
      
      return json({ success: true });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("Danger action failed:", err);
    return json({ error: err.message }, 500);
  }
}
