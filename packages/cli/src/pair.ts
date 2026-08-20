// src/pair.ts — device-flow pairing client for Memorify.
// Mirrors the server contract exactly: respect `interval`, honor 429 slow_down
// Retry-After, stop cleanly on killed/denied/expired.

export const DEFAULT_HOST = "https://memorify.dev";

export interface PairStartResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface PairResult {
  access_token: string;
  mcp_url: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startPairing(
  host: string,
  agentName: string,
  agentKind: string,
  fingerprint?: string,
): Promise<PairStartResponse> {
  const res = await fetch(`${host}/api/pair/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_name: agentName,
      agent_kind: agentKind,
      ...(fingerprint ? { fingerprint } : {}),
    }),
  });
  if (!res.ok) throw new Error(`pair/start failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<PairStartResponse>;
}

export class PairingDenied extends Error {
  constructor(public reason: string) {
    super(`pairing ended: ${reason}`);
  }
}

/** Poll until approved. Throws PairingDenied on killed/denied/expired. */
export async function pollUntilApproved(
  host: string,
  deviceCode: string,
  start: PairStartResponse,
  onStatus?: (msg: string) => void,
): Promise<PairResult> {
  let interval = (start.interval || 2) * 1000;
  const deadline = Date.now() + start.expires_in * 1000;

  while (Date.now() < deadline) {
    await sleep(interval);
    let res: Response;
    try {
      res = await fetch(`${host}/api/pair/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceCode }),
      });
    } catch (e: any) {
      onStatus?.(`network error, retrying: ${e.message}`);
      interval = Math.min(interval * 2, 30_000);
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
      onStatus?.(`slow_down — waiting ${retryAfter}s (rapid polling gets the pairing killed)`);
      interval = retryAfter * 1000;
      continue;
    }

    const body = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(body);
    } catch {
      /* non-JSON error body */
    }

    if (res.ok) {
      if (json.status === "approved" && json.access_token) {
        return { access_token: json.access_token, mcp_url: json.mcp_url || `${host}/mcp` };
      }
      if (json.status === "authorization_pending") {
        onStatus?.("waiting for human approval…");
        interval = (start.interval || 2) * 1000;
        continue;
      }
    }

    // Terminal states — stop polling and clean up.
    if (json.status === "killed") throw new PairingDenied("killed by server (poll abuse or human cancel)");
    if (json.error === "access_denied" || json.status === "access_denied")
      throw new PairingDenied("denied by the human approver");
    if (json.error === "expired" || json.status === "expired") throw new PairingDenied("pairing code expired");

    // Unknown error — back off, don't hammer.
    onStatus?.(`poll error ${res.status}: ${body.slice(0, 120)}`);
    interval = Math.min(interval * 2, 30_000);
  }
  throw new PairingDenied("timed out");
}

/** Fire-and-forget cancel (idempotent server-side). */
export async function cancelPairing(host: string, deviceCode: string): Promise<void> {
  try {
    await fetch(`${host}/api/pair/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: deviceCode }),
    });
  } catch {
    /* polite fire-and-forget */
  }
}
