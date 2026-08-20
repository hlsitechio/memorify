// lib/mcp-oauth.ts — MCP OAuth 2.1 helpers shared by routes/copilot.ts
// (connect flow) and routes/mcp.ts (gateway tool calls).
//
// Implements the standard MCP authorization stack so users can connect
// OAuth MCP servers with zero configuration:
//   1. RFC 9728  — /.well-known/oauth-protected-resource discovery
//   2. RFC 8414  — /.well-known/oauth-authorization-server metadata
//   3. RFC 7591  — dynamic client registration (public PKCE client)
//   4. PKCE (S256) authorization code flow + refresh_token handling
//
// Works with Clerk-backed MCP servers (AgentMail, …) and spec-compliant
// providers with a registration endpoint (Canva, …). Env-configured
// MCP_OAUTH_<PROVIDER>_* variables remain supported as an override.

import { execute } from "./db.ts";

export const MCP_FETCH_TIMEOUT_MS = 30_000;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** fetch with a hard timeout and a descriptive error on abort. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = MCP_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = MCP_FETCH_TIMEOUT_MS): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetchWithTimeout(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
  }, timeoutMs);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: obj(data) };
}

export type McpOAuthEndpoints = {
  /** Protected resource identifier (RFC 9728) — sent as the `resource` param. */
  resource: string;
  authorizationServer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** Empty when the provider requires pre-registered clients. */
  registrationEndpoint: string;
  scopesSupported: string[];
  refreshGrantSupported: boolean;
  offlineAccessSupported: boolean;
  codeChallengeMethods: string[];
};

function protectedResourceCandidates(serverUrl: string): string[] {
  const parsed = new URL(serverUrl);
  const path = parsed.pathname.replace(/\/+$/, "");
  const base = `${parsed.protocol}//${parsed.host}`;
  const out: string[] = [];
  // RFC 9728: metadata for https://host/mcp lives at
  // https://host/.well-known/oauth-protected-resource/mcp
  if (path && path !== "/") out.push(`${base}/.well-known/oauth-protected-resource${path}`);
  out.push(`${base}/.well-known/oauth-protected-resource`);
  return out;
}

function authorizationServerCandidates(authorizationServer: string): string[] {
  const parsed = new URL(authorizationServer);
  const path = parsed.pathname.replace(/\/+$/, "");
  const out: string[] = [];
  // RFC 8414: insert /.well-known/oauth-authorization-server between host and path.
  if (path && path !== "/") out.push(`${parsed.origin}/.well-known/oauth-authorization-server${path}`);
  out.push(`${parsed.origin}/.well-known/oauth-authorization-server`);
  out.push(`${authorizationServer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`);
  return out;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const { status, data } = await fetchJson(url, { method: "GET" });
  return status >= 200 && status < 300 && Object.keys(data).length ? data : null;
}

/**
 * Discover OAuth endpoints for an MCP server via RFC 9728 + RFC 8414.
 * Throws a descriptive error when the server does not advertise OAuth.
 */
export async function discoverMcpOAuthEndpoints(serverUrl: string): Promise<McpOAuthEndpoints> {
  let metadata: Record<string, unknown> | null = null;
  const errors: string[] = [];
  for (const candidate of protectedResourceCandidates(serverUrl)) {
    try {
      metadata = await getJson(candidate);
    } catch (e) {
      errors.push(`${candidate}: ${(e as Error).message}`);
    }
    if (metadata) break;
  }
  const servers = Array.isArray(metadata?.authorization_servers)
    ? (metadata!.authorization_servers as unknown[]).map(str).filter(Boolean)
    : [];
  if (!servers.length) {
    throw new Error(
      `OAuth is not advertised for this MCP server (no .well-known/oauth-protected-resource document)${errors.length ? `: ${errors.join("; ")}` : ""}`,
    );
  }

  // RFC 8414: resolve the authorization server metadata for the first server.
  const authorizationServer = servers[0];
  let asMetadata: Record<string, unknown> | null = null;
  const asErrors: string[] = [];
  for (const candidate of authorizationServerCandidates(authorizationServer)) {
    try {
      asMetadata = await getJson(candidate);
    } catch (e) {
      asErrors.push(`${candidate}: ${(e as Error).message}`);
    }
    if (asMetadata) break;
  }
  const authorizationEndpoint = str(asMetadata?.authorization_endpoint);
  const tokenEndpoint = str(asMetadata?.token_endpoint);
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(
      `authorization server metadata unavailable for ${authorizationServer}${asErrors.length ? `: ${asErrors.join("; ")}` : ""}`,
    );
  }

  const grantTypes = Array.isArray(asMetadata?.grant_types_supported)
    ? (asMetadata!.grant_types_supported as unknown[]).map(str).filter(Boolean)
    : ["authorization_code", "refresh_token"];
  // Scopes may be advertised in either document — Canva lists them in the
  // RFC 9728 protected-resource metadata, most providers in the AS metadata.
  const scopesSupported = [
    ...(Array.isArray(asMetadata?.scopes_supported)
      ? (asMetadata!.scopes_supported as unknown[]).map(str).filter(Boolean)
      : []),
    ...(Array.isArray(metadata?.scopes_supported)
      ? (metadata!.scopes_supported as unknown[]).map(str).filter(Boolean)
      : []),
  ];
  const uniqueScopes = [...new Set(scopesSupported)];
  return {
    resource: str(metadata?.resource) || serverUrl,
    authorizationServer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: str(asMetadata?.registration_endpoint),
    scopesSupported: uniqueScopes,
    refreshGrantSupported: grantTypes.includes("refresh_token"),
    offlineAccessSupported: scopesSupported.includes("offline_access"),
    codeChallengeMethods: Array.isArray(asMetadata?.code_challenge_methods_supported)
      ? (asMetadata!.code_challenge_methods_supported as unknown[]).map(str).filter(Boolean)
      : ["S256"],
  };
}

/**
 * Scope string for the authorize/registration calls: the provider-advertised
 * scopes plus `offline_access` whenever a refresh token is obtainable
 * (mandatory for Clerk-issued ~60s access tokens).
 */
export function mcpOAuthScopeString(endpoints: McpOAuthEndpoints, extraScopes: string[] = []): string {
  const scopes = new Set<string>(endpoints.scopesSupported.filter((scope) => scope && scope !== "offline_access"));
  if (endpoints.offlineAccessSupported || endpoints.refreshGrantSupported) scopes.add("offline_access");
  for (const scope of extraScopes) {
    if (scope) scopes.add(scope);
  }
  return [...scopes].join(" ");
}

export type McpOAuthRegisteredClient = {
  clientId: string;
  clientSecret: string;
};

/** RFC 7591 dynamic client registration — registers a public PKCE client. */
export async function registerMcpOAuthClient(
  endpoints: McpOAuthEndpoints,
  redirectUri: string,
  clientName = "Memorify",
): Promise<McpOAuthRegisteredClient> {
  if (!endpoints.registrationEndpoint) {
    throw new Error("mcp_oauth_dynamic_registration_unsupported");
  }
  const { status, data } = await fetchJson(endpoints.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const clientId = str(data.client_id);
  if (status < 200 || status >= 300 || !clientId) {
    const detail = str(data.error) || str(data.error_description);
    throw new Error(`dynamic client registration failed: HTTP ${status}${detail ? ` (${detail})` : ""}`);
  }
  return { clientId, clientSecret: str(data.client_secret) };
}

// ── Encryption (AES-GCM-256 with the workspace id as additional data) ──

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret =
    Deno.env.get("MEMORIFY_AGENT_TOKEN_SECRET") ||
    Deno.env.get("NEON_JWT_PRIVATE_KEY") ||
    "";
  if (!secret) throw new Error("server_secret_not_configured");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string, workspaceId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(workspaceId),
    },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    alg: "AES-GCM-256",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    hint: `...${plaintext.slice(-4)}`,
    updated_at: new Date().toISOString(),
  };
}

export async function decryptSecret(payload: unknown, workspaceId: string): Promise<string | null> {
  const value = obj(payload);
  if (value.alg !== "AES-GCM-256" || typeof value.iv !== "string" || typeof value.ciphertext !== "string") {
    return null;
  }
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(value.iv),
      additionalData: new TextEncoder().encode(workspaceId),
    },
    key,
    base64ToBytes(value.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

// ── Access token with auto-refresh ──
// Clerk-backed MCP servers (AgentMail, …) issue access tokens that expire in
// ~60 seconds, so every request path must go through mcpOAuthAccessToken():
// it returns the cached token while valid and transparently refreshes (and
// persists the rotated tokens) when expired.

const TOKEN_EXPIRY_SKEW_MS = 10_000;

export type McpOAuthServerRow = {
  id: string;
  url: string;
  auth_type: string;
  auth_config: Record<string, unknown>;
};

async function refreshMcpOAuthToken(
  server: McpOAuthServerRow,
  workspaceId: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const config = obj(server.auth_config);
  const tokenUrl = str(config.token_url) || str(config.token_endpoint);
  const clientId = str(config.client_id);
  if (!tokenUrl || !clientId) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const clientSecretEncrypted = config.client_secret_encrypted;
  const clientSecret = clientSecretEncrypted
    ? (await decryptSecret(clientSecretEncrypted, workspaceId).catch(() => null)) ?? str(config.client_secret)
    : str(config.client_secret);
  if (clientSecret) body.set("client_secret", clientSecret);

  const { status, data } = await fetchJson(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const accessToken = str(data.access_token);
  if (status < 200 || status >= 300 || !accessToken) return null;
  return {
    access_token: accessToken,
    refresh_token: str(data.refresh_token) || undefined,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

/**
 * Returns a valid OAuth access token for the server, refreshing and
 * persisting rotated tokens when the cached one has expired.
 * Returns null when no token is available at all.
 */
export async function mcpOAuthAccessToken(server: McpOAuthServerRow, workspaceId: string): Promise<string | null> {
  const config = obj(server.auth_config);

  const encryptedAccess = config.access_token_encrypted ?? config.token_encrypted;
  const access = encryptedAccess ? await decryptSecret(encryptedAccess, workspaceId) : str(config.access_token);
  if (!access) return null;

  const expiresAtRaw = Number(config.access_token_expires_at);
  const expiresAt = Number.isFinite(expiresAtRaw) ? expiresAtRaw : 0;
  if (!expiresAt || expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()) return access;

  // Expired — attempt a refresh when we hold a refresh token.
  const encryptedRefresh = config.refresh_token_encrypted;
  const refresh = encryptedRefresh ? await decryptSecret(encryptedRefresh, workspaceId) : str(config.refresh_token);
  if (!refresh) return access; // nothing to refresh with; let the request fail upstream

  const rotated = await refreshMcpOAuthToken(server, workspaceId, refresh).catch(() => null);
  if (!rotated) return access;

  const nextConfig: Record<string, unknown> = {
    ...config,
    access_token_encrypted: await encryptSecret(rotated.access_token, workspaceId),
    access_token_expires_at: Date.now() +
      (rotated.expires_in && rotated.expires_in > 0 ? rotated.expires_in * 1000 : 3_600_000),
  };
  if (rotated.refresh_token) {
    const encrypted = await encryptSecret(rotated.refresh_token, workspaceId);
    nextConfig.refresh_token_encrypted = encrypted;
    nextConfig.refresh_token_hint = encrypted.hint;
  }
  await execute(
    `UPDATE mcp_servers SET auth_config = $1::jsonb, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
    [JSON.stringify(nextConfig), server.id, workspaceId],
  ).catch(() => {});

  return rotated.access_token;
}
