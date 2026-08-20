// netlify/edge-functions/pair-cancel.ts — POST /api/pair/cancel
// Fire-and-forget cleanup by the CLI (e.g. user Ctrl-C'd the pairing).
// The device_code is the caller's only secret — no auth needed to cancel YOUR pairing.
// SECURITY: cancels only pending pairings; never touches agents or tokens.

import { json } from "../../backend/lib/cors.ts";
import { execute } from "../../backend/lib/db.ts";
import { sha256Hex, recordAttempt } from "../../backend/lib/pairing.ts";

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const deviceCode = typeof body.device_code === "string" ? body.device_code.trim() : "";
    if (!deviceCode || deviceCode.length > 200) {
      return json({ error: "invalid_request" }, 400);
    }

    const deviceCodeHash = await sha256Hex(deviceCode);
    const n = await execute(
      `UPDATE pairings SET status = 'cancelled', completed_at = now()
       WHERE device_code_hash = $1 AND status = 'pending'`,
      [deviceCodeHash],
    );
    if (n > 0) await recordAttempt({ outcome: "cancelled" });

    // Idempotent + non-revealing
    return json({ ok: true, cancelled: n > 0 });
  } catch (e) {
    console.error("pair-cancel error:", e);
    return json({ error: "internal_error" }, 500);
  }
};
