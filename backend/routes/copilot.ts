// routes/copilot.ts — Clerk-authenticated in-app Copilot bridge.
// OpenRouter does inference only; Memorify executes tools after Clerk auth.

import { json } from "../lib/cors.ts";
import { extractBearer, verifyClerkJwt, type ClerkClaims } from "../lib/clerk.ts";
import { execute, query, queryOne } from "../lib/db.ts";
import { processDocumentForRag, searchDocuments } from "../lib/rag.ts";
import { createAgentToken, listAgentTokens, listWorkspaceAgents, mintAgentToken, revokeAgent, revokeAgentToken, VALID_SCOPES } from "../lib/agent-token.ts";

type CopilotAuth = {
  user_id: string;
  workspace_id: string;
  claims: ClerkClaims;
};

type CopilotSettings = {
  model: string;
  temperature: number;
  max_tokens: number;
  data_collection: "deny" | "allow";
  api_endpoint: string;
};

type CopilotSettingsPatch = Partial<CopilotSettings> & {
  openrouter_api_key?: string;
  clear_openrouter_api_key?: boolean;
};

type OpenRouterTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  supported_parameters?: string[];
};

type AppCatalogItem = {
  slug: string;
  name: string;
  category: string;
  description: string;
  connect: "connector_oauth" | "mcp_oauth" | "mcp_public" | "mcp_token";
  provider?: string;
  mcp_url?: string;
  transport?: "http" | "sse";
  token_label?: string;
  token_hint?: string;
};

const SYSTEM_PROMPT = `You are Memorify Copilot, the signed-in dashboard assistant for an AI-agent memory system.

Context: You have access to 1M tokens of context window. Use it wisely — when the user asks you to search the web, fetch documents, or run commands, do so thoroughly. Don't truncate or skip information due to context concerns.

Security rules:
- Use the provided tools for any action that reads or changes Memorify state.
- Never claim an action succeeded until a tool result confirms it.
- For destructive actions, explain what will happen and wait for the app confirmation flow.
- Keep responses well-structured using Markdown: headers, lists, code blocks, tables, and links.

Product principle: Memorify should feel simple, but its API, MCP, and memory controls are security-first.`;

const DEFAULT_COPILOT_SETTINGS: CopilotSettings = {
  model: "openrouter/auto",
  temperature: 0.2,
  max_tokens: 2048,
  data_collection: "allow",
  api_endpoint: "",
};

const OPENROUTER_KEY_CONFIG = "copilot.openrouter_key";
const GITHUB_OAUTH_PROVIDER = "github";
const ZAPIER_MCP_URL = "https://mcp.zapier.com/api/v1/connect";
const ZAPIER_OLD_MCP_URL = "https://mcp.zapier.com/api/mcp/mcp";

function appOrigin(): string {
  return (Deno.env.get("VITE_APP_URL") || "https://memorify.dev").replace(/\/$/, "");
}

function githubOAuthClient() {
  return {
    clientId: Deno.env.get("GITHUB_OAUTH_CLIENT_ID") || Deno.env.get("GITHUB_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GITHUB_OAUTH_CLIENT_SECRET") || Deno.env.get("GITHUB_CLIENT_SECRET") || "",
    scopes: (Deno.env.get("GITHUB_OAUTH_SCOPES") || "repo workflow read:user").trim(),
    callbackUrl: Deno.env.get("GITHUB_OAUTH_CALLBACK_URL") || `${appOrigin()}/api/oauth/github/callback`,
  };
}

function envKeyProvider(provider: string): string {
  return provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function mcpOAuthClient(provider: string, fallbackUrl = "") {
  const key = envKeyProvider(provider);
  return {
    provider,
    clientId: Deno.env.get(`MCP_OAUTH_${key}_CLIENT_ID`) || "",
    clientSecret: Deno.env.get(`MCP_OAUTH_${key}_CLIENT_SECRET`) || "",
    authorizeUrl: Deno.env.get(`MCP_OAUTH_${key}_AUTHORIZE_URL`) || "",
    tokenUrl: Deno.env.get(`MCP_OAUTH_${key}_TOKEN_URL`) || "",
    scopes: (Deno.env.get(`MCP_OAUTH_${key}_SCOPES`) || "").trim(),
    callbackUrl: Deno.env.get(`MCP_OAUTH_${key}_CALLBACK_URL`) || `${appOrigin()}/api/mcp/oauth/callback`,
    resource: Deno.env.get(`MCP_OAUTH_${key}_RESOURCE`) || fallbackUrl,
  };
}

function parseJson(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function base64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
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

async function encryptSecret(plaintext: string, workspaceId: string) {
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

async function decryptSecret(payload: unknown, workspaceId: string): Promise<string | null> {
  const value = (payload ?? {}) as Record<string, unknown>;
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

function safeToolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "__").slice(0, 64);
}

function makeToolNameMaps(tools: OpenRouterTool[]) {
  const safeToOriginal = new Map<string, string>();
  const originalToSafe = new Map<string, string>();

  for (const tool of tools) {
    const original = tool.function?.name;
    if (!original) continue;
    let safe = safeToolName(original);
    let i = 2;
    while (safeToOriginal.has(safe) && safeToOriginal.get(safe) !== original) {
      safe = `${safeToolName(original).slice(0, 58)}_${i++}`;
    }
    safeToOriginal.set(safe, original);
    originalToSafe.set(original, safe);
  }

  return { safeToOriginal, originalToSafe };
}

function normalizeTools(tools: OpenRouterTool[], originalToSafe: Map<string, string>) {
  return tools.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      name: originalToSafe.get(tool.function.name) ?? safeToolName(tool.function.name),
    },
  }));
}

function normalizeMessages(messages: Array<Record<string, unknown>>, originalToSafe: Map<string, string>) {
  return messages.map((message) => {
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((call) => {
        const c = call as Record<string, unknown>;
        const fn = (c.function ?? {}) as Record<string, unknown>;
        const name = typeof fn.name === "string" ? fn.name : "";
        return {
          ...c,
          function: {
            ...fn,
            name: originalToSafe.get(name) ?? safeToolName(name),
          },
        };
      })
      : undefined;

    return toolCalls ? { ...message, tool_calls: toolCalls } : message;
  });
}

function openRouterErrorDetail(data: unknown): string {
  const value = (data ?? {}) as Record<string, unknown>;
  const error = value.error as Record<string, unknown> | undefined;
  const message =
    (typeof error?.message === "string" && error.message) ||
    (typeof value.message === "string" && value.message) ||
    (typeof value.detail === "string" && value.detail) ||
    "";
  if (message) return message;
  try {
    return JSON.stringify(data).slice(0, 1000);
  } catch {
    return "OpenRouter request failed";
  }
}

function affordableTokensFromError(detail: string): number | null {
  const match = detail.match(/can only afford\s+(\d+)/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? Math.max(16, Math.floor(n)) : null;
}

function isFreeOpenRouterModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith(":free");
}

function effectiveMaxTokens(settings: CopilotSettings): number {
  const hardCap = isFreeOpenRouterModel(settings.model) ? 2048 : 8192;
  return Math.min(settings.max_tokens || hardCap, hardCap);
}

async function requireCopilotAuth(req: Request, requestedWorkspaceId?: string): Promise<CopilotAuth | Response> {
  const token = extractBearer(req);
  if (!token) return json({ error: "missing_bearer" }, 401);

  let claims: ClerkClaims;
  try {
    claims = await verifyClerkJwt(token);
  } catch (e) {
    return json({ error: "invalid_token", detail: String((e as Error).message) }, 401);
  }

  const url = new URL(req.url);
  const workspaceId =
    requestedWorkspaceId ||
    req.headers.get("x-workspace-id") ||
    url.searchParams.get("workspace_id") ||
    claims.org_id ||
    "";
  if (!workspaceId) {
    return json({ error: "workspace_required", detail: "Select or create a Clerk organization before using Copilot tools." }, 400);
  }

  if (claims.org_id && claims.org_id !== workspaceId) {
    return json({ error: "org_mismatch" }, 403);
  }

  if (!claims.org_id) {
    const member = await queryOne<{ workspace_id: string }>(
      `SELECT workspace_id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, claims.sub],
    );
    if (!member) return json({ error: "workspace_forbidden" }, 403);
  }

  return {
    user_id: claims.sub,
    workspace_id: workspaceId,
    claims,
  };
}

function normalizeCopilotSettings(input: unknown): CopilotSettings {
  const value = (input ?? {}) as Partial<CopilotSettings>;
  const model = textOrEmpty(value.model) || Deno.env.get("OPENROUTER_MODEL") || DEFAULT_COPILOT_SETTINGS.model;
  const temperature = Number(value.temperature ?? DEFAULT_COPILOT_SETTINGS.temperature);
  const rawMaxTokens = Number(value.max_tokens ?? DEFAULT_COPILOT_SETTINGS.max_tokens);
  const normalizedModel = model.trim();
  const hardCap = isFreeOpenRouterModel(normalizedModel) ? 2048 : 8192;
  // Upgrade old 512 cap to 2048 for free models
  const maxTokens = (isFreeOpenRouterModel(normalizedModel) && rawMaxTokens <= 512) ? 2048 : rawMaxTokens;

  return {
    model: normalizedModel,
    temperature: Math.min(Math.max(Number.isFinite(temperature) ? temperature : DEFAULT_COPILOT_SETTINGS.temperature, 0), 2),
    max_tokens: Math.min(Math.max(Number.isFinite(maxTokens) ? Math.round(maxTokens) : DEFAULT_COPILOT_SETTINGS.max_tokens, 128), hardCap),
    data_collection: "allow",
    api_endpoint: textOrEmpty(value.api_endpoint) || "",
  };
}

async function getCopilotSettings(workspaceId: string): Promise<CopilotSettings> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM config WHERE workspace_id = $1 AND key = 'copilot.settings'`,
    [workspaceId],
  );
  return normalizeCopilotSettings(row?.value);
}

async function getWorkspaceOpenRouterKey(workspaceId: string): Promise<{ key: string | null; hint: string | null }> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM config WHERE workspace_id = $1 AND key = $2`,
    [workspaceId, OPENROUTER_KEY_CONFIG],
  );
  if (!row?.value) return { key: null, hint: null };
  const key = await decryptSecret(row.value, workspaceId);
  const hint = typeof (row.value as Record<string, unknown>).hint === "string"
    ? (row.value as Record<string, string>).hint
    : null;
  return { key, hint };
}

async function getOpenRouterApiKey(workspaceId: string): Promise<{ key: string; source: "workspace" | "environment"; hint: string | null } | null> {
  const workspace = await getWorkspaceOpenRouterKey(workspaceId);
  if (workspace.key) return { key: workspace.key, source: "workspace", hint: workspace.hint };

  const envKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if (envKey) return { key: envKey, source: "environment", hint: `...${envKey.slice(-4)}` };

  return null;
}

export async function handleCopilotSettings(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "PATCH") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireCopilotAuth(req);
  if (auth instanceof Response) return auth;

  if (req.method === "GET") {
    const key = await getOpenRouterApiKey(auth.workspace_id);
    return json({
      settings: await getCopilotSettings(auth.workspace_id),
      openrouter_configured: Boolean(key),
      openrouter_key_source: key?.source ?? null,
      openrouter_key_hint: key?.hint ?? null,
    });
  }

  let body: CopilotSettingsPatch;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const settings = normalizeCopilotSettings(body);

  const incomingKey = normalizeOpenRouterKey(textOrEmpty(body.openrouter_api_key));
  if (incomingKey) {
    if (!incomingKey.startsWith("sk-or-v1-")) {
      return json({
        error: "invalid_openrouter_key_format",
        detail: "Paste the full sk-or-v1-... key or only the part after sk-or-v1-.",
      }, 400);
    }
    const validation = await validateOpenRouterKey(incomingKey);
    if (!validation.ok) {
      return json({
        error: "invalid_openrouter_api_key",
        detail: validation.message,
      }, 400);
    }
    const encrypted = await encryptSecret(incomingKey, auth.workspace_id);
    await execute(
      `INSERT INTO config (workspace_id, key, value, description)
       VALUES ($1, $2, $3::jsonb, 'Encrypted workspace OpenRouter API key for Copilot')
       ON CONFLICT (workspace_id, key) DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         updated_at = now()`,
      [auth.workspace_id, OPENROUTER_KEY_CONFIG, JSON.stringify(encrypted)],
    );
  } else if (body.clear_openrouter_api_key === true) {
    await execute(
      `DELETE FROM config WHERE workspace_id = $1 AND key = $2`,
      [auth.workspace_id, OPENROUTER_KEY_CONFIG],
    );
  }

  await execute(
    `INSERT INTO config (workspace_id, key, value, description)
     VALUES ($1, 'copilot.settings', $2::jsonb, 'In-app Copilot OpenRouter runtime settings')
     ON CONFLICT (workspace_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       description = EXCLUDED.description,
       updated_at = now()`,
    [auth.workspace_id, JSON.stringify(settings)],
  );

  await execute(
    `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
     VALUES ('copilot.settings', $1, $2, $3::jsonb)`,
    [auth.user_id, auth.workspace_id, JSON.stringify({ model: settings.model })],
  ).catch(() => {});

  const key = await getOpenRouterApiKey(auth.workspace_id);
  return json({
    ok: true,
    settings,
    openrouter_configured: Boolean(key),
    openrouter_key_source: key?.source ?? null,
    openrouter_key_hint: key?.hint ?? null,
  });
}

export async function handleCopilotChat(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: {
    messages?: Array<Record<string, unknown>>;
    tools?: OpenRouterTool[];
    workspace_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const auth = await requireCopilotAuth(req, body.workspace_id);
  if (auth instanceof Response) return auth;

  const apiKey = await getOpenRouterApiKey(auth.workspace_id);
  if (!apiKey) {
    return json({ error: "OPENROUTER_API_KEY_not_configured", detail: "No OpenRouter API key found for this workspace. Save one in Settings → Copilot." }, 500);
  }

  try {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const hasToolMessages = messages.some((message) => message.role === "tool");
  const { safeToOriginal, originalToSafe } = makeToolNameMaps(tools);
  const settings = await getCopilotSettings(auth.workspace_id);
  const envModel = Deno.env.get("OPENROUTER_MODEL") || Deno.env.get("VITE_OPENROUTER_MODEL") || "";
  const actualModel = settings.model || envModel || DEFAULT_COPILOT_SETTINGS.model;

  const requestBody = {
    model: actualModel,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...normalizeMessages(messages, originalToSafe),
    ],
    ...(tools.length && !hasToolMessages
      ? {
          tools: normalizeTools(tools, originalToSafe),
          tool_choice: "auto",
        }
      : {}),
    parallel_tool_calls: false,
    temperature: settings.temperature,
    max_tokens: effectiveMaxTokens(settings),
    stream: true,
    provider: {
      ...(settings.data_collection === "deny" ? { data_collection: "deny" } : {}),
      allow_fallbacks: true,
    },
  };

  const endpointBase = settings.api_endpoint?.trim() || "https://openrouter.ai/api/v1";
  const endpointUrl = endpointBase.endsWith("/chat/completions")
    ? endpointBase
    : `${endpointBase.replace(/\/$/, "")}/chat/completions`;
  const callOpenRouter = (payload: typeof requestBody) => fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": Deno.env.get("VITE_APP_URL") || "https://memorify.dev",
      "X-OpenRouter-Title": "Memorify Copilot",
    },
    body: JSON.stringify(payload),
  });

  let res = await callOpenRouter(requestBody);

  // Handle non-OK responses (errors don't stream)
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const detail = openRouterErrorDetail(errData);
    const affordable = affordableTokensFromError(detail);
    if (affordable && requestBody.max_tokens > affordable) {
      res = await callOpenRouter({ ...requestBody, max_tokens: affordable });
      if (!res.ok) {
        const retryData = await res.json().catch(() => ({}));
        return json({
          error: "openrouter_error",
          status: res.status,
          detail: openRouterErrorDetail(retryData),
          model: actualModel,
          max_tokens: affordable,
        }, 502);
      }
    } else {
      return json({
        error: "openrouter_error",
        status: res.status,
        detail,
        model: actualModel,
        max_tokens: requestBody.max_tokens,
      }, 502);
    }
  }

  // Stream SSE response back to client
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = "";
      let fullContent = "";
      const collectedToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const chunk = JSON.parse(jsonStr);
              const delta = chunk.choices?.[0]?.delta;
              if (!delta) continue;

              // Stream content tokens to client
              if (delta.content) {
                fullContent += delta.content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content", text: delta.content })}\n\n`));
              }

              // Collect tool calls (don't stream to client yet)
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!collectedToolCalls[idx]) {
                    collectedToolCalls[idx] = {
                      id: tc.id || crypto.randomUUID(),
                      name: "",
                      arguments: "",
                    };
                  }
                  if (tc.function?.name) collectedToolCalls[idx].name += tc.function.name;
                  if (tc.function?.arguments) collectedToolCalls[idx].arguments += tc.function.arguments;
                }
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`));
      } finally {
        // Send collected tool calls at the end
        const toolCalls = collectedToolCalls
          .filter((tc) => tc.name)
          .map((tc) => ({
            id: tc.id,
            name: safeToOriginal.get(tc.name) ?? tc.name,
            arguments: parseJson(tc.arguments || "{}"),
          }));

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: fullContent, tool_calls: toolCalls })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // Log to identity_events
        await execute(
          `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
           VALUES ('copilot.chat', $1, $2, $3::jsonb)`,
          [auth.user_id, auth.workspace_id, JSON.stringify({ model: actualModel, tool_calls: toolCalls.map((c) => c.name) })],
        ).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: "copilot_internal_error", detail: msg, model: settings?.model ?? "unknown" }, 500);
  }
}

export async function handleCopilotModelStatus(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireCopilotAuth(req);
  if (auth instanceof Response) return auth;

  const settings = await getCopilotSettings(auth.workspace_id);
  const apiKey = await getOpenRouterApiKey(auth.workspace_id);
  const model = settings.model || DEFAULT_COPILOT_SETTINGS.model;

  // Strip :free suffix for the models API lookup
  const modelId = model.replace(/:free$/, "");

  if (!apiKey) {
    return json({
      model,
      status: "no_key",
      configured: false,
      detail: "No OpenRouter API key configured",
    });
  }

  try {
    // Fetch model info from OpenRouter
    const modelsRes = await fetch(`https://openrouter.ai/api/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey.key}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!modelsRes.ok) {
      return json({
        model,
        status: "error",
        configured: true,
        detail: `OpenRouter API returned ${modelsRes.status}`,
        key_hint: apiKey.hint,
      });
    }

    const modelsData = await modelsRes.json().catch(() => ({ data: [] }));
    const modelInfo = (modelsData.data || []).find((m: any) =>
      m.id === modelId || m.id === model || m.id === `${modelId}:free`
    );

    if (!modelInfo) {
      return json({
        model,
        status: "not_found",
        configured: true,
        detail: `Model "${model}" not found in OpenRouter catalog`,
        key_hint: apiKey.hint,
      });
    }

    // Do a lightweight ping — send a 1-token completion to check if the model responds
    const pingStart = Date.now();
    const pingRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://memorify.dev",
        "X-OpenRouter-Title": "Memorify Copilot Status",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    const pingMs = Date.now() - pingStart;

    if (pingRes.ok) {
      const supportedParams = modelInfo.supported_parameters || [];
      return json({
        model,
        status: "online",
        configured: true,
        key_hint: apiKey.hint,
        context_length: modelInfo.context_length || "unknown",
        supports_tools: supportedParams.includes("tools"),
        supports_tool_choice: supportedParams.includes("tool_choice"),
        supports_response_format: supportedParams.includes("response_format"),
        supports_streaming: supportedParams.includes("stream"),
        pricing: modelInfo.pricing || null,
        latency_ms: pingMs,
        description: modelInfo.description?.slice(0, 200) || "",
      });
    } else {
      const errData = await pingRes.json().catch(() => ({}));
      return json({
        model,
        status: "degraded",
        configured: true,
        key_hint: apiKey.hint,
        context_length: modelInfo.context_length || "unknown",
        supports_tools: (modelInfo.supported_parameters || []).includes("tools"),
        supports_response_format: (modelInfo.supported_parameters || []).includes("response_format"),
        detail: errData?.error?.message || `Model responded with HTTP ${pingRes.status}`,
        latency_ms: pingMs,
      });
    }
  } catch (err) {
    return json({
      model,
      status: "error",
      configured: true,
      key_hint: apiKey.hint,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function handleCopilotModels(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireCopilotAuth(req);
  if (auth instanceof Response) return auth;

  const apiKey = await getOpenRouterApiKey(auth.workspace_id);
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY_not_configured" }, 500);

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 50);
  const settings = await getCopilotSettings(auth.workspace_id);

  const upstream = new URL("https://openrouter.ai/api/v1/models");
  upstream.searchParams.set("limit", String(limit));
  upstream.searchParams.set("output_modalities", "text");
  upstream.searchParams.set("supported_parameters", "tools,temperature,max_tokens");
  upstream.searchParams.set("sort", q ? "most-popular" : "top-weekly");
  if (q) upstream.searchParams.set("q", q);

  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${apiKey.key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({
      error: "openrouter_models_error",
      status: res.status,
      detail: openRouterErrorDetail(data),
    }, 502);
  }

  const models = (Array.isArray((data as { data?: unknown[] }).data) ? (data as { data: OpenRouterModel[] }).data : [])
    .map((model) => ({
      id: model.id ?? "",
      name: model.name ?? model.id ?? "",
      description: model.description ?? "",
      context_length: model.context_length ?? null,
      pricing: model.pricing ?? null,
      supported_parameters: model.supported_parameters ?? [],
    }))
    .filter((model) => model.id);

  return json({ models });
}

function oauthRedirect(status: "connected" | "error", detail?: string): Response {
  const url = new URL(`${appOrigin()}/dashboard/plugins`);
  url.searchParams.set("github", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 120));
  return Response.redirect(url.toString(), 302);
}

function mcpOAuthRedirect(status: "connected" | "error", detail?: string, extra?: Record<string, string | number | null | undefined>): Response {
  const url = new URL(`${appOrigin()}/dashboard/mcp`);
  url.searchParams.set("mcp", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 120));
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value !== null && value !== undefined && String(value)) url.searchParams.set(key, String(value));
  }
  return Response.redirect(url.toString(), 302);
}

async function startMcpOAuth(args: Record<string, unknown>, auth: CopilotAuth) {
  const serverUrl = textOrEmpty(args.server_url) || textOrEmpty(args.url);
  const serverName = textOrEmpty(args.server_name) || textOrEmpty(args.name) || "MCP server";
  const provider = textOrEmpty(args.provider) || slugify(serverName);
  if (!serverUrl) throw new Error("server_url required");
  const parsed = new URL(serverUrl);
  if (parsed.protocol !== "https:") throw new Error("MCP server URL must be https");
  const transport = textOrEmpty(args.transport) || "http";
  if (!["http", "sse"].includes(transport)) throw new Error("transport must be http or sse");

  const client = mcpOAuthClient(provider, serverUrl);
  const envPrefix = `MCP_OAUTH_${envKeyProvider(provider)}`;
  if (!client.clientId || !client.authorizeUrl || !client.tokenUrl) {
    return {
      ok: false,
      error: "mcp_oauth_not_configured",
      provider,
      detail: `Set ${envPrefix}_CLIENT_ID, ${envPrefix}_AUTHORIZE_URL, and ${envPrefix}_TOKEN_URL in Netlify. Add ${envPrefix}_CLIENT_SECRET when the provider requires a confidential client.`,
      callback_url: client.callbackUrl,
    };
  }

  const state = randomHex(32);
  const codeVerifier = `${randomHex(32)}${randomHex(16)}`;
  const challenge = await pkceChallenge(codeVerifier);
  const payload = {
    provider,
    workspace_id: auth.workspace_id,
    user_id: auth.user_id,
    server_name: serverName,
    server_url: serverUrl,
    transport,
    code_verifier: codeVerifier,
    resource: client.resource,
    app_slug: textOrEmpty(args.app_slug),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };

  await upsertConfigValue(
    auth.workspace_id,
    `oauth.mcp.state.${state}`,
    payload,
    "Short-lived MCP OAuth state",
  );

  const authorize = new URL(client.authorizeUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", client.clientId);
  authorize.searchParams.set("redirect_uri", client.callbackUrl);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  if (client.scopes) authorize.searchParams.set("scope", client.scopes);
  if (client.resource) authorize.searchParams.set("resource", client.resource);

  return {
    ok: true,
    provider,
    authorize_url: authorize.toString(),
    callback_url: client.callbackUrl,
    server_url: serverUrl,
    resource: client.resource || null,
    scopes: client.scopes ? client.scopes.split(/\s+/).filter(Boolean) : [],
    expires_in_seconds: 600,
  };
}

export async function handleMcpOAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";

  if (error) return mcpOAuthRedirect("error", error);
  if (!code || !state) return mcpOAuthRedirect("error", "missing_code_or_state");

  const stateKey = `oauth.mcp.state.${state}`;
  const stateRow = await queryOne<{ workspace_id: string; value: unknown }>(
    `SELECT workspace_id, value FROM config WHERE key = $1`,
    [stateKey],
  );
  if (!stateRow) return mcpOAuthRedirect("error", "oauth_state_not_found");

  const stateValue = objectOrEmpty(stateRow.value);
  const workspaceId = textOrEmpty(stateValue.workspace_id);
  const provider = textOrEmpty(stateValue.provider);
  const serverName = textOrEmpty(stateValue.server_name) || "MCP server";
  const serverUrl = textOrEmpty(stateValue.server_url);
  const transport = textOrEmpty(stateValue.transport) || "http";
  const appSlug = textOrEmpty(stateValue.app_slug) || provider;
  const codeVerifier = textOrEmpty(stateValue.code_verifier);
  const expiresAt = Date.parse(textOrEmpty(stateValue.expires_at));

  await execute(
    `DELETE FROM config WHERE workspace_id = $1 AND key = $2`,
    [stateRow.workspace_id, stateKey],
  ).catch(() => {});

  if (!workspaceId || workspaceId !== stateRow.workspace_id || !provider || !serverUrl || !codeVerifier || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return mcpOAuthRedirect("error", "oauth_state_expired");
  }

  const client = mcpOAuthClient(provider, serverUrl);
  if (!client.clientId || !client.tokenUrl) return mcpOAuthRedirect("error", "mcp_oauth_not_configured", { provider });

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: client.clientId,
    code,
    redirect_uri: client.callbackUrl,
    code_verifier: codeVerifier,
  });
  if (client.clientSecret) tokenBody.set("client_secret", client.clientSecret);
  if (client.resource) tokenBody.set("resource", client.resource);

  const tokenRes = await fetch(client.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
  });
  const tokenData = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
  const accessToken = textOrEmpty(tokenData.access_token);
  if (!tokenRes.ok || !accessToken) {
    return mcpOAuthRedirect("error", textOrEmpty(tokenData.error) || `token_http_${tokenRes.status}`, { provider });
  }

  const accessTokenEncrypted = await encryptSecret(accessToken, workspaceId);
  const refreshToken = textOrEmpty(tokenData.refresh_token);
  const authConfig: Record<string, unknown> = {
    provider,
    access_token_encrypted: accessTokenEncrypted,
    access_token_hint: accessTokenEncrypted.hint,
    token_type: textOrEmpty(tokenData.token_type) || "Bearer",
    scope: textOrEmpty(tokenData.scope),
    resource: client.resource || serverUrl,
    connected_at: new Date().toISOString(),
  };
  if (refreshToken) {
    const refreshTokenEncrypted = await encryptSecret(refreshToken, workspaceId);
    authConfig.refresh_token_encrypted = refreshTokenEncrypted;
    authConfig.refresh_token_hint = refreshTokenEncrypted.hint;
  }

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM mcp_servers WHERE workspace_id = $1 AND url = $2 ORDER BY updated_at DESC LIMIT 1`,
    [workspaceId, serverUrl],
  );

  let serverId = existing?.id ?? "";
  if (serverId) {
    await execute(
      `UPDATE mcp_servers
       SET name = $1, transport = $2, auth_type = 'oauth', auth_config = $3::jsonb, enabled = true, last_error = null, updated_at = now()
       WHERE id = $4 AND workspace_id = $5`,
      [serverName, transport, JSON.stringify(authConfig), serverId, workspaceId],
    );
  } else {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO mcp_servers (workspace_id, name, url, transport, auth_type, auth_config, enabled)
       VALUES ($1, $2, $3, $4, 'oauth', $5::jsonb, true)
       RETURNING id`,
      [workspaceId, serverName, serverUrl, transport, JSON.stringify(authConfig)],
    );
    serverId = row?.id ?? "";
  }

  let tools = 0;
  let syncError = "";
  if (serverId) {
    try {
      const sync = await syncMcpServer(workspaceId, serverId);
      tools = Number(sync.tools ?? 0);
    } catch (e) {
      syncError = (e as Error).message;
    }
  }

  if (serverId) {
    await upsertAppPlugin(workspaceId, {
      slug: appSlug,
      name: serverName,
      mode: "mcp",
      provider,
      mcp_server_id: serverId,
      mcp_url: serverUrl,
      transport,
      auth_type: "oauth",
      tools,
      sync_error: syncError || null,
    });
  }

  await execute(
    `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
     VALUES ('mcp.oauth.connected', $1, $2, $3::jsonb)`,
    [
      textOrEmpty(stateValue.user_id) || null,
      workspaceId,
      JSON.stringify({ provider, server_id: serverId || null, server_url: serverUrl, tools, sync_error: syncError || null }),
    ],
  ).catch(() => {});

  return mcpOAuthRedirect(syncError ? "error" : "connected", syncError || undefined, { provider, server_id: serverId, tools });
}

export async function handleGitHubOAuthCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error") || "";

  if (error) return oauthRedirect("error", error);
  if (!code || !state) return oauthRedirect("error", "missing_code_or_state");

  const stateKey = `oauth.github.state.${state}`;
  const stateRow = await queryOne<{ workspace_id: string; value: unknown }>(
    `SELECT workspace_id, value FROM config WHERE key = $1`,
    [stateKey],
  );
  if (!stateRow) return oauthRedirect("error", "oauth_state_not_found");

  const stateValue = objectOrEmpty(stateRow.value);
  const workspaceId = textOrEmpty(stateValue.workspace_id);
  const userId = textOrEmpty(stateValue.user_id);
  const connectorName = textOrEmpty(stateValue.name) || "GitHub";
  const installAsPlugin = stateValue.install_as_plugin !== false;
  const expiresAt = Date.parse(textOrEmpty(stateValue.expires_at));

  await execute(
    `DELETE FROM config WHERE workspace_id = $1 AND key = $2`,
    [stateRow.workspace_id, stateKey],
  ).catch(() => {});

  if (!workspaceId || workspaceId !== stateRow.workspace_id || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return oauthRedirect("error", "oauth_state_expired");
  }

  const { clientId, clientSecret, scopes, callbackUrl } = githubOAuthClient();
  if (!clientId || !clientSecret) return oauthRedirect("error", "github_oauth_not_configured");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
  const accessToken = textOrEmpty(tokenData.access_token);
  if (!tokenRes.ok || !accessToken) {
    return oauthRedirect("error", textOrEmpty(tokenData.error) || `github_token_http_${tokenRes.status}`);
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const userData = await userRes.json().catch(() => ({})) as Record<string, unknown>;
  if (!userRes.ok) return oauthRedirect("error", `github_user_http_${userRes.status}`);

  const login = textOrEmpty(userData.login);
  const tokenEncrypted = await encryptSecret(accessToken, workspaceId);
  const config = {
    provider: GITHUB_OAUTH_PROVIDER,
    oauth: true,
    auth_type: "oauth_access_token",
    token_encrypted: tokenEncrypted,
    token_hint: tokenEncrypted.hint,
    scopes: textOrEmpty(tokenData.scope).split(",").map((s) => s.trim()).filter(Boolean),
    requested_scopes: scopes.split(/\s+/).filter(Boolean),
    github_user: {
      id: userData.id ?? null,
      login: login || null,
      html_url: userData.html_url ?? null,
    },
    api_base: "https://api.github.com",
    connected_at: new Date().toISOString(),
  };

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM connectors
     WHERE workspace_id = $1 AND kind = 'github' AND config->>'provider' = 'github'
     ORDER BY updated_at DESC LIMIT 1`,
    [workspaceId],
  );

  let connectorId = existing?.id ?? "";
  if (connectorId) {
    await execute(
      `UPDATE connectors
       SET name = $1, status = 'active', config = $2::jsonb, updated_at = now()
       WHERE id = $3 AND workspace_id = $4`,
      [connectorName, JSON.stringify(config), connectorId, workspaceId],
    );
  } else {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO connectors (workspace_id, name, kind, status, config)
       VALUES ($1, $2, 'github', 'active', $3::jsonb)
       RETURNING id`,
      [workspaceId, connectorName, JSON.stringify(config)],
    );
    connectorId = row?.id ?? "";
  }

  if (installAsPlugin && connectorId) {
    const pluginConfig = {
      template: "github",
      provider: GITHUB_OAUTH_PROVIDER,
      connector_id: connectorId,
      enabled: true,
      oauth: true,
      position: 0,
    };
    const existingPlugin = await queryOne<{ id: string }>(
      `SELECT id FROM plugins
       WHERE workspace_id = $1 AND kind = 'connector' AND ref_id = $2
       LIMIT 1`,
      [workspaceId, connectorId],
    );
    if (existingPlugin) {
      await execute(
        `UPDATE plugins SET name = $1, config = coalesce(config, '{}'::jsonb) || $2::jsonb
         WHERE id = $3 AND workspace_id = $4`,
        [connectorName, JSON.stringify(pluginConfig), existingPlugin.id, workspaceId],
      );
    } else {
      await execute(
        `INSERT INTO plugins (workspace_id, name, kind, ref_id, config)
         VALUES ($1, $2, 'connector', $3::uuid, $4::jsonb)`,
        [workspaceId, connectorName, connectorId, JSON.stringify(pluginConfig)],
      );
    }
  }

  await execute(
    `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
     VALUES ('connector.github.oauth.connected', $1, $2, $3::jsonb)`,
    [userId || null, workspaceId, JSON.stringify({ connector_id: connectorId, github_login: login || null })],
  ).catch(() => {});

  return oauthRedirect("connected");
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOpenRouterKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("sk-or-")) return trimmed;
  if (trimmed.startsWith("v1-")) return `sk-or-${trimmed}`;
  return `sk-or-v1-${trimmed}`;
}

async function validateOpenRouterKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const message =
      (data as { error?: { message?: string } })?.error?.message ||
      (data as { message?: string })?.message ||
      `OpenRouter HTTP ${res.status}`;
    return { ok: false, message };
  } catch (e) {
    return { ok: false, message: (e as Error).message || "Could not reach OpenRouter" };
  }
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function limitOf(value: unknown, fallback = 50, max = 200): number {
  const n = Number(value ?? fallback);
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, 1), max);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `session-${Date.now()}`;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => typeof v === "string" ? v.trim() : "").filter(Boolean)
    : [];
}

function normalizeStatus(value: unknown, allowed: string[], fallback: string): string {
  const status = textOrEmpty(value).toLowerCase();
  return allowed.includes(status) ? status : fallback;
}

function defaultAgentName(kind: string): string {
  if (kind === "claude_code") return "Claude Code";
  if (kind === "cursor") return "Cursor";
  if (kind === "hermes") return "Hermes";
  return "Custom Agent";
}

function mimeKind(mime: string, name: string): string {
  const m = mime.toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(n)) return "image";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/\.(docx?|xlsx?|pptx?)$/.test(n)) return "office";
  return "binary";
}

function safeConfig(value: unknown): Record<string, unknown> {
  const input = objectOrEmpty(value);
  const redact = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(redact);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(v as Record<string, unknown>)) {
        out[key] = /token|secret|password|authorization|api[_-]?key|bearer/i.test(key)
          ? "[redacted]"
          : redact(item);
      }
      return out;
    }
    return v;
  };
  return redact(input) as Record<string, unknown>;
}

function randomHex(bytes = 24): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexLocal(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function tableExists(table: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${table}`],
  );
  return row?.exists === true;
}

const WORKSPACE_TABLES = [
  "agents",
  "memories",
  "documents",
  "events",
  "skills",
  "connectors",
  "plugins",
  "mcp_servers",
  "mcp_tools",
  "config",
  "audit_log",
  "api_keys",
  "vault_secrets",
  "images",
  "voices",
  "agent_calls",
  "collections",
  "collection_items",
] as const;

function allowedTable(value: unknown): string {
  const table = textOrEmpty(value);
  if (!WORKSPACE_TABLES.includes(table as typeof WORKSPACE_TABLES[number])) {
    throw new Error("table not allowlisted");
  }
  return table;
}

function assertSafeReadonlySql(sql: string): string {
  const cleaned = sql.trim().replace(/;+\s*$/, "");
  if (!/^select\s/i.test(cleaned)) throw new Error("only SELECT queries are allowed");
  if (/;|--|\/\*|\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|execute)\b/i.test(cleaned)) {
    throw new Error("query contains forbidden SQL");
  }
  const tableMatches = Array.from(cleaned.matchAll(/\bfrom\s+([a-z_][a-z0-9_]*)|\bjoin\s+([a-z_][a-z0-9_]*)/gi))
    .map((m) => m[1] || m[2])
    .filter(Boolean);
  if (!tableMatches.length) throw new Error("query must read from an allowlisted table");
  for (const table of tableMatches) allowedTable(table);
  return cleaned;
}

async function upsertConfigValue(workspaceId: string, key: string, value: Record<string, unknown>, description: string) {
  await execute(
    `INSERT INTO config (workspace_id, key, value, description)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (workspace_id, key) DO UPDATE SET
       value = EXCLUDED.value,
       description = EXCLUDED.description,
       updated_at = now()`,
    [workspaceId, key, JSON.stringify(value), description],
  );
  return value;
}

async function getConfigObject(workspaceId: string, key: string): Promise<Record<string, unknown>> {
  const row = await queryOne<{ value: unknown }>(
    `SELECT value FROM config WHERE workspace_id = $1 AND key = $2`,
    [workspaceId, key],
  );
  return objectOrEmpty(row?.value);
}

function normalizeAuth(auth: unknown): { auth_type: string; auth_config: Record<string, unknown> } {
  const a = (auth ?? {}) as Record<string, unknown>;
  const bearer = textOrEmpty(a.bearer);
  if (bearer) return { auth_type: "bearer", auth_config: { bearer_token: bearer } };
  if (a.headers && typeof a.headers === "object") {
    return { auth_type: "headers", auth_config: { headers: a.headers } };
  }
  return { auth_type: "none", auth_config: {} };
}

function redactServer<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  if ("auth_config" in copy) (copy as Record<string, unknown>).auth_config = "[redacted]";
  return copy;
}

async function authHeaders(server: { auth_type: string; auth_config: Record<string, unknown> }, workspaceId?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const config = server.auth_config ?? {};
  if (server.auth_type === "bearer" && config.bearer_token) {
    headers.Authorization = `Bearer ${String(config.bearer_token)}`;
  } else if (server.auth_type === "bearer" && config.bearer_token_encrypted) {
    const token = workspaceId ? await decryptSecret(config.bearer_token_encrypted, workspaceId) : null;
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (server.auth_type === "oauth") {
    const encrypted = config.access_token_encrypted ?? config.token_encrypted;
    const token = workspaceId && encrypted ? await decryptSecret(encrypted, workspaceId) : textOrEmpty(config.access_token);
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (server.auth_type === "api_key" && config.api_key) {
    headers["X-API-Key"] = String(config.api_key);
  } else if ((server.auth_type === "headers" || server.auth_type === "none") && config.headers && typeof config.headers === "object") {
    for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
      if (typeof value === "string") headers[key] = value;
    }
  }
  if (config.headers && typeof config.headers === "object") {
    for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
      if (typeof value === "string") headers[key] = value;
    }
  }
  return headers;
}

function normalizeZapierCredential(raw: string): { url: string; token: string; authType: "bearer" | "query_token" } {
  const value = textOrEmpty(raw);
  if (!value) return { url: ZAPIER_MCP_URL, token: "", authType: "bearer" };
  if (!/^https?:\/\//i.test(value)) return { url: ZAPIER_MCP_URL, token: value, authType: "bearer" };

  const parsed = new URL(value);
  const token = textOrEmpty(parsed.searchParams.get("token"));
  parsed.searchParams.delete("token");
  const cleanUrl = parsed.pathname === new URL(ZAPIER_OLD_MCP_URL).pathname ? ZAPIER_MCP_URL : parsed.toString();
  return { url: cleanUrl || ZAPIER_MCP_URL, token, authType: "query_token" };
}

async function mcpRequestUrl(url: string, authConfig: Record<string, unknown>, workspaceId?: string): Promise<string> {
  let requestUrl = url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "mcp.zapier.com" && parsed.pathname === new URL(ZAPIER_OLD_MCP_URL).pathname) {
      requestUrl = ZAPIER_MCP_URL;
    }
  } catch {
    requestUrl = url;
  }
  const encrypted = authConfig.query_token_encrypted;
  if (!encrypted || !workspaceId) return requestUrl;
  const token = await decryptSecret(encrypted, workspaceId);
  if (!token) return requestUrl;
  const parsed = new URL(requestUrl);
  parsed.searchParams.set("token", token);
  return parsed.toString();
}

function isZapierMcpUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "mcp.zapier.com";
  } catch {
    return false;
  }
}

async function normalizeMcpServerInput(
  url: string,
  auth: unknown,
  workspaceId: string,
): Promise<{ url: string; auth_type: string; auth_config: Record<string, unknown> }> {
  const normalizedAuth = normalizeAuth(auth);
  if (!isZapierMcpUrl(url)) {
    return { url, ...normalizedAuth };
  }

  const parsed = new URL(url);
  const queryToken = textOrEmpty(parsed.searchParams.get("token"));
  parsed.searchParams.delete("token");
  const cleanUrl = parsed.pathname === new URL(ZAPIER_OLD_MCP_URL).pathname ? ZAPIER_MCP_URL : parsed.toString();

  if (queryToken) {
    const encrypted = await encryptSecret(queryToken, workspaceId);
    return {
      url: cleanUrl,
      auth_type: "query_token",
      auth_config: {
        provider: "zapier",
        query_token_encrypted: encrypted,
        query_token_hint: encrypted.hint,
        token_transport: "query",
        connected_at: new Date().toISOString(),
      },
    };
  }

  if (normalizedAuth.auth_type === "bearer" && normalizedAuth.auth_config.bearer_token) {
    const encrypted = await encryptSecret(String(normalizedAuth.auth_config.bearer_token), workspaceId);
    return {
      url: cleanUrl,
      auth_type: "bearer",
      auth_config: {
        provider: "zapier",
        bearer_token_encrypted: encrypted,
        bearer_token_hint: encrypted.hint,
        token_transport: "authorization_header",
        connected_at: new Date().toISOString(),
      },
    };
  }

  return {
    url: cleanUrl,
    auth_type: normalizedAuth.auth_type,
    auth_config: { ...normalizedAuth.auth_config, provider: "zapier" },
  };
}

async function readMcpJsonResponse(res: Response) {
  const text = await res.text();
  if (!text.trim()) return {};
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`invalid JSON response: ${(e as Error).message}`);
    }
  }

  const messages: unknown[] = [];
  let dataLines: string[] = [];
  const flush = () => {
    if (!dataLines.length) return;
    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") return;
    try {
      messages.push(JSON.parse(data));
    } catch {
      messages.push(data);
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  flush();

  const jsonMessage = [...messages].reverse().find((message) => message && typeof message === "object");
  if (!jsonMessage) throw new Error("MCP SSE response did not include JSON data");
  return jsonMessage as Record<string, unknown>;
}

function mcpErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const error = objectOrEmpty(data.error);
  return textOrEmpty(error.message) || fallback;
}

async function initializeMcpSession(url: string, headers: Record<string, string>): Promise<Record<string, string>> {
  const initRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "memorify-copilot", version: "0.1.0" },
      },
    }),
  }).catch(() => null);
  if (!initRes) return headers;

  const sessionId = initRes.headers.get("MCP-Session-Id") || initRes.headers.get("Mcp-Session-Id") || initRes.headers.get("mcp-session-id");
  await readMcpJsonResponse(initRes).catch(() => null);
  if (!sessionId) return headers;

  const sessionHeaders = { ...headers, "MCP-Session-Id": sessionId };
  await fetch(url, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  }).catch(() => null);
  return sessionHeaders;
}

const PLUGIN_LIBRARY = [
  { slug: "slack", name: "Slack", category: "Messaging", description: "Post messages to channels via webhook.", config: { url: "https://hooks.slack.com/services/...", method: "POST" } },
  { slug: "discord", name: "Discord", category: "Messaging", description: "Send embeds and messages to a Discord channel.", config: { url: "https://discord.com/api/webhooks/...", method: "POST" } },
  { slug: "telegram", name: "Telegram", category: "Messaging", description: "Send messages through a Telegram bot.", config: { url: "https://api.telegram.org/bot<TOKEN>/sendMessage", method: "POST" } },
  { slug: "github", name: "GitHub", category: "Dev", description: "OAuth connector for repositories, issues, pull requests, and workflows.", config: { oauth: true, provider: "github", scopes: ["repo", "workflow", "read:user"] } },
  { slug: "stripe", name: "Stripe", category: "Payments", description: "Payments, invoices, customers, and subscriptions.", config: { url: "https://api.stripe.com/v1/charges", method: "POST", headers: { Authorization: "Bearer {{vault.STRIPE_RESTRICTED_KEY}}" } } },
  { slug: "notion", name: "Notion", category: "Docs", description: "Create pages and append blocks to a database.", config: { url: "https://api.notion.com/v1/pages", method: "POST", headers: { Authorization: "Bearer {{vault.NOTION_TOKEN}}", "Notion-Version": "2022-06-28" } } },
  { slug: "openai", name: "OpenAI", category: "AI", description: "Run completions or embeddings on demand.", config: { url: "https://api.openai.com/v1/chat/completions", method: "POST", headers: { Authorization: "Bearer {{vault.OPENAI_API_KEY}}" } } },
  { slug: "anthropic", name: "Anthropic", category: "AI", description: "Claude model calls via the Messages API.", config: { url: "https://api.anthropic.com/v1/messages", method: "POST", headers: { "x-api-key": "{{vault.ANTHROPIC_API_KEY}}", "anthropic-version": "2023-06-01" } } },
  { slug: "resend", name: "Resend", category: "Email", description: "Send transactional emails.", config: { url: "https://api.resend.com/emails", method: "POST", headers: { Authorization: "Bearer {{vault.RESEND_API_KEY}}" } } },
  { slug: "gcal", name: "Google Calendar", category: "Productivity", description: "Create and list calendar events.", config: { url: "https://www.googleapis.com/calendar/v3/calendars/primary/events", method: "POST", headers: { Authorization: "Bearer {{vault.GOOGLE_ACCESS_TOKEN}}" } } },
  { slug: "s3", name: "AWS S3", category: "Storage", description: "Upload and read objects via presigned URLs.", config: { url: "https://<bucket>.s3.amazonaws.com/<key>", method: "PUT" } },
  { slug: "pagerduty", name: "PagerDuty", category: "Ops", description: "Trigger and resolve incidents.", config: { url: "https://events.pagerduty.com/v2/enqueue", method: "POST" } },
  { slug: "zapier", name: "Zapier", category: "Automation", description: "Fan out events to any Zap webhook.", config: { url: "https://hooks.zapier.com/hooks/catch/...", method: "POST" } },
  { slug: "n8n", name: "n8n", category: "Automation", description: "Trigger an n8n workflow webhook.", config: { url: "https://<host>/webhook/<id>", method: "POST" } },
  { slug: "elevenlabs", name: "ElevenLabs", category: "AI", description: "High-quality text-to-speech.", config: { url: "https://api.elevenlabs.io/v1/text-to-speech/<voice>", method: "POST", headers: { "xi-api-key": "{{vault.ELEVENLABS_API_KEY}}" } } },
  { slug: "replicate", name: "Replicate", category: "AI", description: "Run image/video models on demand.", config: { url: "https://api.replicate.com/v1/predictions", method: "POST", headers: { Authorization: "Token {{vault.REPLICATE_API_TOKEN}}" } } },
];

const APP_CATALOG: AppCatalogItem[] = [
  { slug: "github", name: "GitHub", category: "Dev", description: "OAuth access for repositories, issues, pull requests, and workflows.", connect: "connector_oauth", provider: "github" },
  { slug: "deepwiki", name: "DeepWiki", category: "Docs", description: "Public MCP for asking questions about GitHub repo docs.", connect: "mcp_public", provider: "deepwiki", mcp_url: "https://mcp.deepwiki.com/mcp", transport: "http" },
  { slug: "cloudflare-docs", name: "Cloudflare Docs", category: "Docs", description: "Public MCP for Cloudflare developer documentation.", connect: "mcp_public", provider: "cloudflare-docs", mcp_url: "https://docs.mcp.cloudflare.com/sse", transport: "sse" },
  { slug: "context7", name: "Context7", category: "Docs", description: "Public MCP for current library docs and code examples.", connect: "mcp_public", provider: "context7", mcp_url: "https://mcp.context7.com/mcp", transport: "http" },
  { slug: "globalping", name: "Globalping", category: "Ops", description: "Public MCP for ping, traceroute, DNS, and HTTP checks.", connect: "mcp_public", provider: "globalping", mcp_url: "https://mcp.globalping.dev/sse", transport: "sse" },
  { slug: "notion", name: "Notion", category: "Docs", description: "OAuth MCP access to workspace pages and databases.", connect: "mcp_oauth", provider: "notion", mcp_url: "https://mcp.notion.com/mcp", transport: "http" },
  { slug: "sentry", name: "Sentry", category: "Ops", description: "OAuth MCP access to issues, errors, traces, and releases.", connect: "mcp_oauth", provider: "sentry", mcp_url: "https://mcp.sentry.dev/mcp", transport: "http" },
  { slug: "atlassian", name: "Atlassian", category: "Productivity", description: "OAuth MCP access to Jira and Confluence.", connect: "mcp_oauth", provider: "atlassian", mcp_url: "https://mcp.atlassian.com/v1/sse", transport: "sse" },
  { slug: "paypal", name: "PayPal", category: "Payments", description: "OAuth MCP access to PayPal merchant data.", connect: "mcp_oauth", provider: "paypal", mcp_url: "https://mcp.paypal.com/mcp", transport: "http" },
  { slug: "intercom", name: "Intercom", category: "Support", description: "OAuth MCP access to conversations, contacts, and articles.", connect: "mcp_oauth", provider: "intercom", mcp_url: "https://mcp.intercom.com/sse", transport: "sse" },
  { slug: "asana", name: "Asana", category: "Productivity", description: "OAuth MCP access to tasks and projects.", connect: "mcp_oauth", provider: "asana", mcp_url: "https://mcp.asana.com/sse", transport: "sse" },
  { slug: "vercel", name: "Vercel", category: "Dev", description: "OAuth MCP access to deployments, projects, and logs.", connect: "mcp_oauth", provider: "vercel", mcp_url: "https://mcp.vercel.com", transport: "http" },
  { slug: "cloudflare-workers", name: "Cloudflare Workers", category: "Dev", description: "OAuth MCP access to Workers, KV, R2, D1, and Durable Objects.", connect: "mcp_oauth", provider: "cloudflare-workers", mcp_url: "https://bindings.mcp.cloudflare.com/sse", transport: "sse" },
  { slug: "shopify", name: "Shopify", category: "Commerce", description: "OAuth MCP access to products, orders, and customers.", connect: "mcp_oauth", provider: "shopify", mcp_url: "https://mcp.shopify.com/mcp", transport: "http" },
  { slug: "hubspot", name: "HubSpot", category: "CRM", description: "OAuth MCP access to contacts, deals, companies, and tickets.", connect: "mcp_oauth", provider: "hubspot", mcp_url: "https://mcp.hubspot.com/anthropic", transport: "http" },
  { slug: "canva", name: "Canva", category: "Design", description: "OAuth MCP access to create and edit Canva designs.", connect: "mcp_oauth", provider: "canva", mcp_url: "https://mcp.canva.com/mcp", transport: "http" },
  { slug: "posthog", name: "PostHog", category: "Analytics", description: "OAuth MCP access to analytics, flags, and experiments.", connect: "mcp_oauth", provider: "posthog", mcp_url: "https://mcp.posthog.com/mcp", transport: "http" },
  { slug: "plaid", name: "Plaid", category: "Finance", description: "OAuth MCP access to financial data and bank account records.", connect: "mcp_oauth", provider: "plaid", mcp_url: "https://api.dashboard.plaid.com/mcp/sse", transport: "sse" },
  { slug: "square", name: "Square", category: "Payments", description: "OAuth MCP access to payments, catalog, customers, and orders.", connect: "mcp_oauth", provider: "square", mcp_url: "https://mcp.squareup.com/sse", transport: "sse" },
  { slug: "wix", name: "Wix", category: "Websites", description: "OAuth MCP access to Wix sites, content, and bookings.", connect: "mcp_oauth", provider: "wix", mcp_url: "https://mcp.wix.com/mcp", transport: "http" },
  { slug: "webflow", name: "Webflow", category: "Websites", description: "OAuth MCP access to sites, collections, and CMS items.", connect: "mcp_oauth", provider: "webflow", mcp_url: "https://mcp.webflow.com/sse", transport: "sse" },
  { slug: "cloudinary", name: "Cloudinary", category: "Media", description: "OAuth MCP access to upload, search, and transform media assets.", connect: "mcp_oauth", provider: "cloudinary", mcp_url: "https://asset-management.mcp.cloudinary.com/sse", transport: "sse" },
  { slug: "box", name: "Box", category: "Storage", description: "OAuth MCP access to files, content, and folders.", connect: "mcp_oauth", provider: "box", mcp_url: "https://mcp.box.com/", transport: "http" },
  { slug: "github-mcp", name: "GitHub MCP", category: "Dev", description: "Token MCP access to GitHub tools.", connect: "mcp_token", provider: "github-mcp", mcp_url: "https://api.githubcopilot.com/mcp/", transport: "http", token_label: "GitHub personal access token", token_hint: "Use a fine-grained PAT with the least scopes your agent needs." },
  { slug: "huggingface", name: "Hugging Face", category: "AI", description: "Token MCP access to Hugging Face models, datasets, and Spaces.", connect: "mcp_token", provider: "huggingface", mcp_url: "https://huggingface.co/mcp", transport: "http", token_label: "Hugging Face access token", token_hint: "A read-scoped token is enough for discovery." },
  { slug: "stripe", name: "Stripe", category: "Payments", description: "Token MCP access to payments, invoices, customers, and subscriptions.", connect: "mcp_token", provider: "stripe", mcp_url: "https://mcp.stripe.com", transport: "http", token_label: "Stripe restricted key", token_hint: "Use a restricted key, not a full secret key." },
  { slug: "zapier", name: "Zapier", category: "Automation", description: "Token MCP access to Zapier's 9,000+ apps and dynamic tool discovery.", connect: "mcp_token", provider: "zapier", mcp_url: ZAPIER_MCP_URL, transport: "http", token_label: "Zapier connection token or full token URL", token_hint: "Use a Zapier connection token with the default URL, or paste the full https://mcp.zapier.com/api/v1/connect?token=... URL. Use the MCP tab for Zapier Embed secrets." },
  { slug: "elevenlabs", name: "ElevenLabs", category: "AI", description: "Token MCP access to TTS, voice cloning, and dubbing tools.", connect: "mcp_token", provider: "elevenlabs", mcp_url: "https://mcp.elevenlabs.io/mcp", transport: "http", token_label: "ElevenLabs API key", token_hint: "Create a key in ElevenLabs account settings." },
];

async function upsertAppPlugin(workspaceId: string, config: Record<string, unknown>) {
  const slug = textOrEmpty(config.slug) || textOrEmpty(config.template);
  const name = textOrEmpty(config.name) || slug || "Connected app";
  if (!slug) throw new Error("app slug required");
  const pluginConfig: Record<string, unknown> = {
    ...config,
    template: slug,
    app_slug: slug,
    enabled: config.enabled !== false,
    connected_at: textOrEmpty(config.connected_at) || new Date().toISOString(),
  };
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM plugins WHERE workspace_id = $1 AND config->>'template' = $2 ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, slug],
  );
  if (existing) {
    await execute(
      `UPDATE plugins SET name = $1, kind = 'connector', config = coalesce(config, '{}'::jsonb) || $2::jsonb
       WHERE id = $3 AND workspace_id = $4`,
      [name, JSON.stringify(pluginConfig), existing.id, workspaceId],
    );
    return { id: existing.id, name, kind: "connector", updated: true };
  }
  const last = await queryOne<{ pos: number | null }>(
    `SELECT max(coalesce((config->>'position')::int, 0)) AS pos FROM plugins WHERE workspace_id = $1`,
    [workspaceId],
  );
  pluginConfig.position = Number(last?.pos ?? -1) + 1;
  const row = await queryOne<{ id: string }>(
    `INSERT INTO plugins (workspace_id, name, kind, config)
     VALUES ($1, $2, 'connector', $3::jsonb) RETURNING id`,
    [workspaceId, name, JSON.stringify(pluginConfig)],
  );
  return { id: row?.id, name, kind: "connector", updated: false };
}

function publicApp(item: AppCatalogItem, installed: boolean) {
  return {
    slug: item.slug,
    name: item.name,
    category: item.category,
    description: item.description,
    connect: item.connect,
    auth: item.connect === "connector_oauth" || item.connect === "mcp_oauth"
      ? "oauth"
      : item.connect === "mcp_token"
        ? "token"
        : "public",
    provider: item.provider ?? item.slug,
    token_label: item.token_label ?? "",
    token_hint: item.token_hint ?? "",
    installed,
  };
}

async function connectMcpApp(item: AppCatalogItem, auth: CopilotAuth, token = "") {
  const ws = auth.workspace_id;
  let mcpUrl = textOrEmpty(item.mcp_url);
  if (!mcpUrl) throw new Error("mcp_url required");
  const transport = item.transport ?? "http";
  const provider = item.provider ?? item.slug;

  let authType = "none";
  let authConfig: Record<string, unknown> = {};
  if (item.connect === "mcp_token") {
    const rawToken = textOrEmpty(token);
    const zapier = provider === "zapier" ? normalizeZapierCredential(rawToken) : null;
    const credential = zapier?.token ?? rawToken;
    if (!credential) {
      return {
        mode: "token_required",
        slug: item.slug,
        name: item.name,
        token_label: item.token_label || `${item.name} token`,
        token_hint: item.token_hint || "Paste a least-privilege token for this platform.",
      };
    }
    if (zapier) {
      mcpUrl = zapier.url;
      const encrypted = await encryptSecret(credential, ws);
      if (zapier.authType === "query_token") {
        authType = "query_token";
        authConfig = {
          provider,
          query_token_encrypted: encrypted,
          query_token_hint: encrypted.hint,
          token_transport: "query",
          connected_at: new Date().toISOString(),
        };
      } else {
        authType = "bearer";
        authConfig = {
          provider,
          bearer_token_encrypted: encrypted,
          bearer_token_hint: encrypted.hint,
          token_transport: "authorization_header",
          connected_at: new Date().toISOString(),
        };
      }
    } else {
      const encrypted = await encryptSecret(credential, ws);
      authType = "bearer";
      authConfig = {
        provider,
        bearer_token_encrypted: encrypted,
        bearer_token_hint: encrypted.hint,
        connected_at: new Date().toISOString(),
      };
    }
  }

  const parsed = new URL(mcpUrl);
  if (parsed.protocol !== "https:") throw new Error("MCP server URL must be https");

  const existing = provider === "zapier"
    ? await queryOne<{ id: string }>(
      `SELECT id FROM mcp_servers
       WHERE workspace_id = $1
         AND (url = $2 OR url = $3 OR auth_config->>'provider' = 'zapier')
       ORDER BY updated_at DESC LIMIT 1`,
      [ws, mcpUrl, ZAPIER_OLD_MCP_URL],
    )
    : await queryOne<{ id: string }>(
      `SELECT id FROM mcp_servers WHERE workspace_id = $1 AND url = $2 ORDER BY updated_at DESC LIMIT 1`,
      [ws, mcpUrl],
    );

  let serverId = existing?.id ?? "";
  if (serverId) {
    await execute(
      `UPDATE mcp_servers
       SET name = $1, url = $2, transport = $3, auth_type = $4, auth_config = $5::jsonb, enabled = true, updated_at = now()
       WHERE id = $6 AND workspace_id = $7`,
      [item.name, mcpUrl, transport, authType, JSON.stringify(authConfig), serverId, ws],
    );
  } else {
    const row = await queryOne<{ id: string }>(
      `INSERT INTO mcp_servers (workspace_id, name, url, transport, auth_type, auth_config, enabled)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)
       RETURNING id`,
      [ws, item.name, mcpUrl, transport, authType, JSON.stringify(authConfig)],
    );
    serverId = row?.id ?? "";
  }

  let tools = 0;
  let syncError = "";
  if (serverId) {
    try {
      const sync = await syncMcpServer(ws, serverId);
      tools = Number(sync.tools ?? 0);
    } catch (e) {
      syncError = (e as Error).message;
    }
  }

  const plugin = await upsertAppPlugin(ws, {
    slug: item.slug,
    name: item.name,
    mode: "mcp",
    provider,
    mcp_server_id: serverId,
    mcp_url: mcpUrl,
    transport,
    auth_type: authType,
    token_hint: authConfig.bearer_token_hint ?? authConfig.query_token_hint ?? null,
    tools,
    sync_error: syncError || null,
  });

  await execute(
    `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
     VALUES ('app.connected', $1, $2, $3::jsonb)`,
    [auth.user_id || null, ws, JSON.stringify({ slug: item.slug, provider, mode: "mcp", server_id: serverId, tools, sync_error: syncError || null })],
  ).catch(() => {});

  return {
    mode: "mcp",
    connected: true,
    slug: item.slug,
    name: item.name,
    server_id: serverId,
    plugin_id: plugin.id,
    tools,
    sync_error: syncError || null,
  };
}

async function handleAppsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;

  if (name === "apps.list") {
    const q = textOrEmpty(args.q).toLowerCase();
    const category = textOrEmpty(args.category).toLowerCase();
    const plugins = await query<{ slug: string }>(
      `SELECT config->>'template' AS slug FROM plugins WHERE workspace_id = $1 AND config ? 'template'`,
      [ws],
    );
    const installed = new Set(plugins.map((row) => row.slug).filter(Boolean));
    return APP_CATALOG
      .filter((item) =>
        (!q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)) &&
        (!category || item.category.toLowerCase() === category)
      )
      .map((item) => publicApp(item, installed.has(item.slug)));
  }

  if (name === "apps.connect") {
    const slug = textOrEmpty(args.slug).toLowerCase();
    if (!slug) throw new Error("slug required");
    const item = APP_CATALOG.find((candidate) => candidate.slug === slug);
    if (!item) throw new Error("app not found");

    if (item.connect === "connector_oauth") {
      if ((item.provider ?? item.slug) === "github") {
        return await startGitHubOAuth({
          name: textOrEmpty(args.name) || item.name,
          install_as_plugin: true,
        }, auth);
      }
      return {
        mode: "oauth_not_configured",
        provider: item.provider ?? item.slug,
        detail: "This connector OAuth provider is not configured yet.",
      };
    }

    if (item.connect === "mcp_oauth") {
      return await startMcpOAuth({
        provider: item.provider ?? item.slug,
        server_name: item.name,
        server_url: item.mcp_url,
        transport: item.transport ?? "http",
        app_slug: item.slug,
      }, auth);
    }

    if (item.connect === "mcp_public" || item.connect === "mcp_token") {
      return await connectMcpApp(item, auth, textOrEmpty(args.token));
    }
  }

  throw new Error(`server command not implemented: ${name}`);
}

async function syncMcpServer(workspaceId: string, serverId: string) {
  const server = await queryOne<{ id: string; url: string; auth_type: string; auth_config: Record<string, unknown> }>(
    `SELECT id, url, auth_type, auth_config FROM mcp_servers WHERE id = $1 AND workspace_id = $2 AND enabled = true`,
    [serverId, workspaceId],
  );
  if (!server) throw new Error("server not found or disabled");

  let headers = await authHeaders(server, workspaceId);
  try {
    const requestUrl = await mcpRequestUrl(server.url, server.auth_config, workspaceId);
    headers = await initializeMcpSession(requestUrl, headers);

    const res = await fetch(requestUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/list",
        params: {},
      }),
    });
    const data = await readMcpJsonResponse(res);
    if (!res.ok || data.error) {
      throw new Error(mcpErrorMessage(data, `tools/list failed: HTTP ${res.status}`));
    }

    const result = objectOrEmpty((data as Record<string, unknown>).result);
    const tools = Array.isArray(result.tools) ? result.tools : [];
    await execute(`DELETE FROM mcp_tools WHERE mcp_server_id = $1`, [serverId]);
    for (const tool of tools) {
      const t = tool as Record<string, unknown>;
      const name = textOrEmpty(t.name);
      if (!name) continue;
      await execute(
        `INSERT INTO mcp_tools (mcp_server_id, name, description, input_schema, enabled)
         VALUES ($1, $2, $3, $4::jsonb, true)`,
        [
          serverId,
          name,
          typeof t.description === "string" ? t.description : null,
          JSON.stringify(t.inputSchema ?? t.parameters ?? {}),
        ],
      );
    }

    await execute(
      `UPDATE mcp_servers SET last_handshake_at = now(), last_error = null, updated_at = now()
       WHERE id = $1 AND workspace_id = $2`,
      [serverId, workspaceId],
    );

    return { server_id: serverId, tools: tools.length };
  } catch (e) {
    const message = (e as Error).message;
    await execute(
      `UPDATE mcp_servers SET last_error = $1, updated_at = now()
       WHERE id = $2 AND workspace_id = $3`,
      [message, serverId, workspaceId],
    ).catch(() => {});
    throw e;
  }
}

async function handleAgentsWorkspaceCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "agents.list") {
    const rows = await listWorkspaceAgents(ws);
    const limit = limitOf(args.limit, 50, 200);
    return rows.slice(0, limit).map((agent) => ({
      ...agent,
      workspace_id: `agent:${agent.id}`,
    }));
  }
  if (name === "agents.new") {
    const kind = textOrEmpty(args.kind) || "claude_code";
    const agentName = textOrEmpty(args.name) || defaultAgentName(kind);
    const minted = await mintAgentToken({
      workspace_id: ws,
      user_id: auth.user_id,
      name: agentName,
      kind,
      access_level: "full",
    });
    return {
      id: minted.agent_id,
      name: agentName,
      kind,
      access_level: minted.access_level,
      token: minted.token,
      token_notice: "Shown once. Store it in a vault or agent runtime secret.",
    };
  }
  if (name === "agents.rename" || name === "agents.reset_name") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const agent = await queryOne<{ kind: string }>(
      `SELECT kind FROM agents WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!agent) throw new Error("agent not found");
    const nextName = name === "agents.reset_name" ? defaultAgentName(agent.kind) : textOrEmpty(args.name);
    if (!nextName) throw new Error("name required");
    const count = await execute(
      `UPDATE agents SET name = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
      [nextName, id, ws],
    );
    return { id, name: nextName, updated: count > 0 };
  }
  if (name === "agents.disconnect") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    await revokeAgent(id);
    return { id, disconnected: true };
  }
  if (name === "agents.bootstrap") {
    const id = textOrEmpty(args.id);
    const [agent, memories, skills, documents, events] = await Promise.all([
      id ? queryOne(`SELECT id, name, kind, status, access_level, metadata FROM agents WHERE id = $1 AND workspace_id = $2`, [id, ws]) : null,
      query(`SELECT id, namespace, content, category, tags, updated_at::text FROM memories WHERE workspace_id = $1 AND archived = false ORDER BY updated_at DESC LIMIT 30`, [ws]),
      query(`SELECT id, name, slug, description, status, model, version FROM skills WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 20`, [ws]),
      query(`SELECT id, name, kind, size, created_at::text FROM documents WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`, [ws]),
      query(`SELECT id, kind, source, payload, created_at::text FROM events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`, [ws]),
    ]);
    return { agent, workspace_id: ws, memories, skills, documents, events };
  }
  if (name === "agents.tokens.list") return await listAgentTokens(ws);
  if (name === "agents.tokens.mint") {
    const id = textOrEmpty(args.agent_id) || textOrEmpty(args.id);
    if (!id) throw new Error("agent_id required");
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM agents WHERE id = $1 AND workspace_id = $2 AND status <> 'disconnected'`,
      [id, ws],
    );
    if (!existing) throw new Error("agent not found");
    const minted = await createAgentToken({
      workspace_id: ws,
      agent_id: id,
      scopes: [...VALID_SCOPES],
      expiresInSeconds: 0,
    });
    return { agent_id: id, token: minted.token, jti: minted.jti, expires_at: minted.expiresAt };
  }
  if (name === "agents.tokens.revoke") {
    const jti = textOrEmpty(args.jti);
    const prefix = textOrEmpty(args.prefix);
    const revoked = await revokeAgentToken({ workspace_id: ws, ...(jti ? { jti } : { prefix }) });
    return { revoked };
  }
  if (name === "workspace.set_name" || name === "workspace.rename") {
    const id = textOrEmpty(args.id);
    const displayName = textOrEmpty(args.name);
    if (!id || !displayName) throw new Error("id and name required");
    const count = await execute(
      `UPDATE agents SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{workspace_name}', to_jsonb($1::text), true), updated_at = now()
       WHERE id = $2 AND workspace_id = $3`,
      [displayName, id, ws],
    );
    return { id, workspace_name: displayName, updated: count > 0 };
  }
  if (name === "workspace.delete_name" || name === "workspace.reset") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(
      `UPDATE agents SET metadata = coalesce(metadata, '{}'::jsonb) - 'workspace_name', updated_at = now()
       WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    return { id, updated: count > 0 };
  }
  if (name === "workspace.info") {
    return { workspace_id: ws, user_id: auth.user_id, org_id: auth.claims.org_id ?? null };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handlePluginsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "plugins.list") {
    const rows = await query<Record<string, unknown>>(
      `SELECT id, name, kind, ref_id, config, created_at::text
       FROM plugins WHERE workspace_id = $1
       ORDER BY coalesce((config->>'position')::int, 0) ASC, created_at DESC
       LIMIT $2`,
      [ws, limitOf(args.limit, 50, 200)],
    );
    return rows.map((row) => ({
      ...row,
      enabled: row.config && typeof row.config === "object" && "enabled" in row.config ? (row.config as Record<string, unknown>).enabled !== false : true,
      position: Number((row.config as Record<string, unknown> | undefined)?.position ?? 0),
      config: safeConfig(row.config),
    }));
  }
  if (name === "plugins.add") {
    const pluginName = textOrEmpty(args.name);
    const kind = textOrEmpty(args.kind) || "http";
    if (!pluginName) throw new Error("name required");
    const cfg: Record<string, unknown> = { ...objectOrEmpty(args.config), enabled: boolOr(args.enabled, true) };
    const last = await queryOne<{ pos: number | null }>(
      `SELECT max(coalesce((config->>'position')::int, 0)) AS pos FROM plugins WHERE workspace_id = $1`,
      [ws],
    );
    cfg.position = Number(last?.pos ?? -1) + 1;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO plugins (workspace_id, name, kind, ref_id, config)
       VALUES ($1, $2, $3, NULLIF($4, '')::uuid, $5::jsonb) RETURNING id`,
      [ws, pluginName, kind, textOrEmpty(args.ref_id), JSON.stringify(cfg)],
    );
    return { id: row?.id, name: pluginName, kind, enabled: cfg.enabled, position: cfg.position };
  }
  if (name === "plugins.update_config") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(
      `UPDATE plugins SET config = coalesce(config, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(objectOrEmpty(args.config)), id, ws],
    );
    return { id, updated: count > 0 };
  }
  if (name === "plugins.rename") {
    const id = textOrEmpty(args.id);
    const pluginName = textOrEmpty(args.name);
    if (!id || !pluginName) throw new Error("id and name required");
    const count = await execute(`UPDATE plugins SET name = $1 WHERE id = $2 AND workspace_id = $3`, [pluginName, id, ws]);
    return { id, name: pluginName, updated: count > 0 };
  }
  if (name === "plugins.toggle") {
    const id = textOrEmpty(args.id);
    if (!id || typeof args.enabled !== "boolean") throw new Error("id and enabled required");
    const count = await execute(
      `UPDATE plugins SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{enabled}', to_jsonb($1::boolean), true)
       WHERE id = $2 AND workspace_id = $3`,
      [args.enabled, id, ws],
    );
    return { id, enabled: args.enabled, updated: count > 0 };
  }
  if (name === "plugins.reorder") {
    const ids = stringArray(args.ids);
    if (!ids.length) throw new Error("ids required");
    let updated = 0;
    for (let i = 0; i < ids.length; i++) {
      updated += await execute(
        `UPDATE plugins SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{position}', to_jsonb($1::int), true)
         WHERE id = $2 AND workspace_id = $3`,
        [i, ids[i], ws],
      );
    }
    return { updated };
  }
  if (name === "plugins.move_to_top") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const rows = await query<{ id: string }>(
      `SELECT id FROM plugins WHERE workspace_id = $1 ORDER BY CASE WHEN id = $2 THEN 0 ELSE 1 END, coalesce((config->>'position')::int, 0), created_at DESC`,
      [ws, id],
    );
    return await handlePluginsCommand("plugins.reorder", { ids: rows.map((r) => r.id) }, auth);
  }
  if (name === "plugins.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM plugins WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, deleted: count > 0 };
  }
  if (name === "plugins.library.list") {
    const q = textOrEmpty(args.q).toLowerCase();
    const category = textOrEmpty(args.category).toLowerCase();
    return PLUGIN_LIBRARY.filter((item) =>
      (!q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)) &&
      (!category || item.category.toLowerCase() === category)
    );
  }
  if (name === "plugins.library.install") {
    const slug = textOrEmpty(args.slug);
    if (!slug) throw new Error("slug required");
    if (APP_CATALOG.some((item) => item.slug === slug)) {
      return await handleAppsCommand("apps.connect", args, auth);
    }
    throw new Error("app requires a real OAuth or token connector before install");
  }
  if (name === "plugins.library.uninstall") {
    const slug = textOrEmpty(args.slug);
    if (!slug) throw new Error("slug required");
    const count = await execute(
      `DELETE FROM plugins WHERE workspace_id = $1 AND config->>'template' = $2`,
      [ws, slug],
    );
    return { slug, deleted: count > 0 };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleMemoryCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "memory.add") {
    const content = textOrEmpty(args.content);
    if (!content) throw new Error("content required");
    const namespace = textOrEmpty(args.namespace) || "default";
    const category = textOrEmpty(args.category) || "general";
    const row = await queryOne<{ id: string }>(
      `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [ws, namespace, content, category, stringArray(args.tags), JSON.stringify({ ...objectOrEmpty(args.metadata), source: "copilot" })],
    );
    return { id: row?.id, namespace, content, category, tags: stringArray(args.tags) };
  }
  if (name === "memory.list" || name === "memory.search") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, namespace, content, category, tags, archived, metadata, created_at::text, updated_at::text
               FROM memories WHERE workspace_id = $1`;
    if (!args.include_archived) sql += " AND archived = false";
    for (const [field, column] of [["namespace", "namespace"], ["category", "category"]] as const) {
      const value = textOrEmpty(args[field]);
      if (value) {
        params.push(value);
        sql += ` AND ${column} = $${params.length}`;
      }
    }
    const queryText = textOrEmpty(args.q) || textOrEmpty(args.query);
    if (queryText) {
      params.push(queryText);
      sql += ` AND content ILIKE '%' || $${params.length} || '%'`;
    }
    params.push(limitOf(args.limit));
    sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "memory.get") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const row = await queryOne(
      `SELECT id, namespace, content, category, tags, archived, metadata, created_at::text, updated_at::text
       FROM memories WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!row) throw new Error("memory not found");
    return row;
  }
  if (name === "memory.update") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const old = await queryOne<{ content: string }>(`SELECT content FROM memories WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    if (!old) throw new Error("memory not found");
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (args.content !== undefined) {
      await execute(`INSERT INTO memory_versions (memory_id, content) VALUES ($1, $2)`, [id, old.content]);
      updates.push(`content = $${idx++}`);
      params.push(String(args.content ?? ""));
    }
    if (args.namespace !== undefined) { updates.push(`namespace = $${idx++}`); params.push(textOrEmpty(args.namespace) || "default"); }
    if (args.category !== undefined) { updates.push(`category = $${idx++}`); params.push(textOrEmpty(args.category) || "general"); }
    if (args.tags !== undefined) { updates.push(`tags = $${idx++}`); params.push(stringArray(args.tags)); }
    if (args.metadata !== undefined) { updates.push(`metadata = coalesce(metadata, '{}'::jsonb) || $${idx++}::jsonb`); params.push(JSON.stringify(objectOrEmpty(args.metadata))); }
    if (!updates.length) return { id, updated: false };
    updates.push("updated_at = now()");
    params.push(id, ws);
    const count = await execute(`UPDATE memories SET ${updates.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`, params);
    return { id, updated: count > 0 };
  }
  if (name === "memory.archive" || name === "memory.restore") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const archived = name === "memory.archive";
    const count = await execute(`UPDATE memories SET archived = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`, [archived, id, ws]);
    return { id, archived, updated: count > 0 };
  }
  if (name === "memory.versions.list") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    return await query(
      `SELECT v.id, v.memory_id, v.content, v.created_at::text
       FROM memory_versions v JOIN memories m ON m.id = v.memory_id
       WHERE v.memory_id = $1 AND m.workspace_id = $2
       ORDER BY v.created_at DESC LIMIT $3`,
      [id, ws, limitOf(args.limit, 50, 200)],
    );
  }
  if (name === "memory.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM memories WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, deleted: count > 0 };
  }
  if (name === "memory.session.create") {
    const title = textOrEmpty(args.name) || textOrEmpty(args.date) || (args.number ? `s${Number(args.number)}` : new Date().toISOString().slice(0, 10));
    const slug = slugify(title);
    const namespace = `session:${slug}`;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
       VALUES ($1, $2, $3, 'session', $4, $5::jsonb) RETURNING id`,
      [ws, namespace, title, stringArray(args.tags), JSON.stringify({ description: textOrEmpty(args.description), source: "copilot" })],
    );
    return { id: row?.id, slug, namespace, title };
  }
  if (name === "memory.session.add") {
    return await handleMemoryCommand("memory.add", {
      ...args,
      namespace: textOrEmpty(args.namespace) || `session:${slugify(textOrEmpty(args.slug) || textOrEmpty(args.name))}`,
    }, auth);
  }
  if (name === "memory.session.list") {
    return await query(
      `SELECT marker.id, marker.namespace, marker.content AS title, marker.metadata, marker.created_at::text,
              count(items.id) FILTER (WHERE items.category <> 'session') AS item_count
       FROM memories marker
       LEFT JOIN memories items ON items.workspace_id = marker.workspace_id AND items.namespace = marker.namespace AND items.archived = false
       WHERE marker.workspace_id = $1 AND marker.category = 'session' AND marker.archived = false
       GROUP BY marker.id, marker.namespace, marker.content, marker.metadata, marker.created_at
       ORDER BY marker.created_at DESC`,
      [ws],
    );
  }
  if (name === "memory.session.rename" || name === "memory.session.update") {
    const namespace = textOrEmpty(args.namespace) || `session:${slugify(textOrEmpty(args.slug))}`;
    const title = textOrEmpty(args.name) || textOrEmpty(args.title);
    const description = textOrEmpty(args.description);
    if (!title && !description) throw new Error("name/title or description required");
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (title) { updates.push(`content = $${idx++}`); params.push(title); }
    if (description) { updates.push(`metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{description}', to_jsonb($${idx++}::text), true)`); params.push(description); }
    updates.push("updated_at = now()");
    params.push(ws, namespace);
    const count = await execute(`UPDATE memories SET ${updates.join(", ")} WHERE workspace_id = $${idx++} AND namespace = $${idx} AND category = 'session'`, params);
    return { namespace, updated: count > 0 };
  }
  if (name === "memory.session.delete") {
    const namespace = textOrEmpty(args.namespace) || `session:${slugify(textOrEmpty(args.slug))}`;
    const count = args.cascade === true
      ? await execute(`DELETE FROM memories WHERE workspace_id = $1 AND namespace = $2`, [ws, namespace])
      : await execute(`DELETE FROM memories WHERE workspace_id = $1 AND namespace = $2 AND category = 'session'`, [ws, namespace]);
    return { namespace, deleted: count };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleDocumentsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "documents.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, name, kind, size, source_url, metadata, created_at::text, updated_at::text
               FROM documents WHERE workspace_id = $1`;
    const queryText = textOrEmpty(args.q) || textOrEmpty(args.query);
    if (queryText) {
      params.push(queryText);
      sql += ` AND (name ILIKE '%' || $${params.length} || '%' OR coalesce(content, '') ILIKE '%' || $${params.length} || '%')`;
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "documents.view") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const row = await queryOne(
      `SELECT id, name, kind, size, content, source_url, metadata, created_at::text, updated_at::text
       FROM documents WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!row) throw new Error("document not found");
    return row;
  }
  if (name === "documents.add_note") {
    const title = textOrEmpty(args.title);
    if (!title) throw new Error("title required");
    const format = ["md", "txt", "json"].includes(textOrEmpty(args.format)) ? textOrEmpty(args.format) : "md";
    const rawContent = args.content;
    const content = format === "json" && typeof rawContent !== "string"
      ? JSON.stringify(rawContent, null, 2)
      : String(rawContent ?? "");
    const docName = title.endsWith(`.${format}`) ? title : `${title}.${format}`;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO documents (workspace_id, name, kind, size, content, metadata)
       VALUES ($1, $2, 'text', $3, $4, $5::jsonb) RETURNING id`,
      [ws, docName, content.length, content, JSON.stringify({ source: "copilot", format })],
    );
    // RAG pipeline: chunk → embed → store
    const ragResult = await processDocumentForRag(row?.id ?? "", ws, "text", `text/${format}`, docName, content, null);
    return { id: row?.id, name: docName, size: content.length, rag: ragResult };
  }
  if (name === "documents.add_from_base64" || name === "documents.add_from_file") {
    const base64 = textOrEmpty(args.base64);
    const docName = textOrEmpty(args.name) || textOrEmpty(args.path).split(/[\\/]/).filter(Boolean).pop() || "upload.bin";
    if (!base64) throw new Error("base64 required");
    const mime = textOrEmpty(args.mime) || "application/octet-stream";
    const size = Math.floor(base64.length * 0.75);
    const rawBase64 = base64.replace(/^data:[^,]+,/, "");
    const row = await queryOne<{ id: string }>(
      `INSERT INTO documents (workspace_id, name, kind, size, bytes, metadata)
       VALUES ($1, $2, $3, $4, decode($5, 'base64'), $6::jsonb) RETURNING id`,
      [ws, docName, mimeKind(mime, docName), size, rawBase64, JSON.stringify({ source: "copilot", mime, path: textOrEmpty(args.path) || null })],
    );
    // RAG pipeline: extract text → chunk → embed → store
    const binaryBytes = base64ToBytes(rawBase64);
    const ragResult = await processDocumentForRag(row?.id ?? "", ws, mimeKind(mime, docName), mime, docName, null, binaryBytes);
    return { id: row?.id, name: docName, size, mime, rag: ragResult };
  }
  if (name === "documents.add_from_url") {
    const urlArg = textOrEmpty(args.url);
    if (!urlArg) throw new Error("url required");
    const parsed = new URL(urlArg);
    if (parsed.protocol !== "https:") throw new Error("document URL must be https");
    const res = await fetch(urlArg);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    const content = await res.text();
    const docName = textOrEmpty(args.name) || parsed.pathname.split("/").filter(Boolean).pop() || urlArg;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO documents (workspace_id, name, kind, size, content, source_url, metadata)
       VALUES ($1, $2, 'text', $3, $4, $5, $6::jsonb) RETURNING id`,
      [ws, docName, content.length, content, urlArg, JSON.stringify({ source: "copilot", content_type: contentType })],
    );
    // RAG pipeline: chunk → embed → store (text already extracted)
    const ragResult = await processDocumentForRag(row?.id ?? "", ws, "text", contentType, docName, content, null);
    return { id: row?.id, name: docName, size: content.length, rag: ragResult };
  }
  if (name === "documents.signed_url") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const row = await queryOne<{ id: string; name: string; source_url: string | null; content: string | null; metadata: unknown }>(
      `SELECT id, name, source_url, content, metadata FROM documents WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!row) throw new Error("document not found");
    if (row.source_url) return { id, url: row.source_url, signed: false };
    if (row.content != null) return { id, name: row.name, content: row.content, signed: false, ttl: 0 };
    return { id, name: row.name, error: "binary_download_endpoint_not_configured" };
  }
  if (name === "documents.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM documents WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, deleted: count > 0 };
  }
  if (name === "documents.search") {
    const queryText = textOrEmpty(args.q) || textOrEmpty(args.query);
    if (!queryText) throw new Error("query (q) required");
    const limit = limitOf(args.limit, 10, 50);
    const threshold = typeof args.threshold === "number" ? args.threshold : 0.5;
    return await searchDocuments(ws, queryText, limit, threshold);
  }
  if (name === "web.search") {
    const queryText = textOrEmpty(args.q);
    if (!queryText) throw new Error("query (q) required");
    const maxResults = Math.min(Math.max(Number(args.limit ?? 5), 1), 10);
    // DuckDuckGo HTML search — no API key needed
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryText)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!searchRes.ok) throw new Error(`search failed: HTTP ${searchRes.status}`);
    const html = await searchRes.text();
    // Parse DuckDuckGo HTML results
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) && results.length < maxResults) {
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      // DuckDuckGo wraps URLs in a redirect — extract actual URL
      const urlMatch = rawUrl.match(/[&?]uddg=([^&]+)/);
      const url = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
      if (title && url) results.push({ title, url, snippet: snippet.slice(0, 300) });
    }
    return { query: queryText, results };
  }
  if (name === "web.fetch") {
    const url = textOrEmpty(args.url);
    if (!url) throw new Error("url required");
    if (!url.startsWith("https://")) throw new Error("url must be https");
    const maxChars = Math.min(Math.max(Number(args.limit ?? 15000), 500), 50000);
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) throw new Error(`fetch failed: HTTP ${pageRes.status}`);
    const html = await pageRes.text();
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : url;
    // Strip HTML tags, scripts, styles
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
    return { url, title, content: text.slice(0, maxChars), length: text.length };
  }
  if (name === "web.search_and_save") {
    const queryText = textOrEmpty(args.q);
    if (!queryText) throw new Error("query (q) required");
    const saveAll = args.save_all === true;
    // 1. Search
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryText)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!searchRes.ok) throw new Error(`search failed: HTTP ${searchRes.status}`);
    const html = await searchRes.text();
    const results: Array<{ title: string; url: string }> = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) && results.length < (saveAll ? 3 : 1)) {
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const urlMatch = rawUrl.match(/[&?]uddg=([^&]+)/);
      const url = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
      if (title && url) results.push({ title, url });
    }
    if (!results.length) throw new Error("no results found");
    // 2. Fetch + save each result
    const saved: Array<{ id: string; name: string; url: string; size: number }> = [];
    for (const result of results) {
      try {
        const pageRes = await fetch(result.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!pageRes.ok) continue;
        const pageHtml = await pageRes.text();
        const text = pageHtml
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 50000);
        const docName = textOrEmpty(args.name) || result.title || result.url;
        const row = await queryOne<{ id: string }>(
          `INSERT INTO documents (workspace_id, name, kind, size, content, source_url, metadata)
           VALUES ($1, $2, 'text', $3, $4, $5, $6::jsonb) RETURNING id`,
          [ws, docName, text.length, text, result.url, JSON.stringify({ source: "web.search_and_save", query: queryText, title: result.title })],
        );
        // RAG pipeline
        if (row?.id) {
          await processDocumentForRag(row.id, ws, "text", "text/html", docName, text, null).catch(() => {});
          saved.push({ id: row.id, name: docName, url: result.url, size: text.length });
        }
      } catch {
        // Skip failed fetches
      }
    }
    if (!saved.length) throw new Error("found results but could not fetch any pages");
    return { query: queryText, saved_count: saved.length, documents: saved };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleSkillsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "skills.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, name, slug, description, status, model, version, source, created_at::text, updated_at::text
               FROM skills WHERE workspace_id = $1`;
    const queryText = textOrEmpty(args.q);
    if (queryText) {
      params.push(queryText);
      sql += ` AND (name ILIKE '%' || $${params.length} || '%' OR coalesce(description, '') ILIKE '%' || $${params.length} || '%')`;
    }
    const status = textOrEmpty(args.status);
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "skills.get") {
    const id = textOrEmpty(args.id);
    const slug = textOrEmpty(args.slug);
    if (!id && !slug) throw new Error("id or slug required");
    const row = id
      ? await queryOne(`SELECT * FROM skills WHERE id = $1 AND workspace_id = $2`, [id, ws])
      : await queryOne(`SELECT * FROM skills WHERE slug = $1 AND workspace_id = $2`, [slug, ws]);
    if (!row) throw new Error("skill not found");
    return row;
  }
  if (name === "skills.create") {
    const skillName = textOrEmpty(args.name);
    const prompt = typeof args.prompt === "string" ? args.prompt : "";
    if (!skillName || !prompt) throw new Error("name and prompt required");
    const slug = slugify(skillName);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO skills (workspace_id, name, slug, description, prompt, model, schema, status, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)
       RETURNING id`,
      [
        ws,
        skillName,
        slug,
        textOrEmpty(args.description) || null,
        prompt,
        textOrEmpty(args.model) || "google/gemini-2.5-flash",
        JSON.stringify(objectOrEmpty(args.schema)),
        normalizeStatus(args.status, ["draft", "live"], "draft"),
        JSON.stringify({ origin: "copilot" }),
      ],
    );
    return { id: row?.id, name: skillName, slug };
  }
  if (name === "skills.update") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (args.name !== undefined) {
      const skillName = textOrEmpty(args.name);
      updates.push(`name = $${idx++}`, `slug = $${idx++}`);
      params.push(skillName, slugify(skillName));
    }
    if (args.description !== undefined) { updates.push(`description = $${idx++}`); params.push(textOrEmpty(args.description) || null); }
    if (args.prompt !== undefined) { updates.push(`prompt = $${idx++}`); params.push(String(args.prompt ?? "")); }
    if (args.model !== undefined) { updates.push(`model = $${idx++}`); params.push(textOrEmpty(args.model)); }
    if (args.status !== undefined) { updates.push(`status = $${idx++}`); params.push(normalizeStatus(args.status, ["draft", "live"], "draft")); }
    if (args.schema !== undefined) { updates.push(`schema = $${idx++}::jsonb`); params.push(JSON.stringify(objectOrEmpty(args.schema))); }
    if (!updates.length) return { id, updated: false };
    updates.push("version = version + 1", "updated_at = now()");
    params.push(id, ws);
    const count = await execute(`UPDATE skills SET ${updates.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`, params);
    return { id, updated: count > 0 };
  }
  if (name === "skills.rename") return await handleSkillsCommand("skills.update", args, auth);
  if (name === "skills.publish" || name === "skills.unpublish") {
    return await handleSkillsCommand("skills.update", { id: args.id, status: name === "skills.publish" ? "live" : "draft" }, auth);
  }
  if (name === "skills.run") {
    const id = textOrEmpty(args.id);
    const slug = textOrEmpty(args.slug);
    if (!id && !slug) throw new Error("id or slug required");
    const skill = id
      ? await queryOne<{ id: string; name: string; prompt: string; model: string }>(`SELECT id, name, prompt, model FROM skills WHERE id = $1 AND workspace_id = $2`, [id, ws])
      : await queryOne<{ id: string; name: string; prompt: string; model: string }>(`SELECT id, name, prompt, model FROM skills WHERE slug = $1 AND workspace_id = $2`, [slug, ws]);
    if (!skill) throw new Error("skill not found");
    await execute(
      `INSERT INTO events (workspace_id, kind, source, payload) VALUES ($1, 'skill.run', 'copilot', $2::jsonb)`,
      [ws, JSON.stringify({ skill_id: skill.id, input_preview: String(args.input ?? "").slice(0, 300) })],
    ).catch(() => {});
    return { skill_id: skill.id, name: skill.name, model: textOrEmpty(args.model) || skill.model, prompt: skill.prompt, input: args.input ?? "" };
  }
  if (name === "skills.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM skills WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, deleted: count > 0 };
  }
  if (name === "skills.import_url") {
    const urlArg = textOrEmpty(args.url);
    if (!urlArg) throw new Error("url required");
    const parsed = new URL(urlArg);
    if (parsed.protocol !== "https:") throw new Error("skill URL must be https");
    const importName = textOrEmpty(args.name) || parsed.pathname.split("/").filter(Boolean).pop() || "Imported skill";
    const row = await queryOne<{ id: string }>(
      `INSERT INTO skills (workspace_id, name, slug, description, prompt, model, status, source)
       VALUES ($1, $2, $3, $4, $5, 'google/gemini-2.5-flash', 'draft', $6::jsonb)
       RETURNING id`,
      [ws, importName, slugify(importName), `Imported from ${urlArg}`, `Review and complete this imported skill from ${urlArg}.`, JSON.stringify({ origin: "url", url: urlArg, source: "copilot" })],
    );
    return { id: row?.id, name: importName, status: "draft", review_required: true };
  }
  if (name === "skills.add_to_plugins") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const skill = await queryOne<{ id: string; name: string; slug: string }>(
      `SELECT id, name, slug FROM skills WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!skill) throw new Error("skill not found");
    return await handlePluginsCommand("plugins.add", {
      name: skill.name,
      kind: "skill",
      ref_id: skill.id,
      config: { slug: skill.slug },
      enabled: true,
    }, auth);
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function startGitHubOAuth(args: Record<string, unknown>, auth: CopilotAuth) {
  const { clientId, clientSecret, scopes, callbackUrl } = githubOAuthClient();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "github_oauth_not_configured",
      detail: "Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in Netlify, with callback https://memorify.dev/api/oauth/github/callback.",
    };
  }

  const state = randomHex(32);
  const payload = {
    provider: GITHUB_OAUTH_PROVIDER,
    workspace_id: auth.workspace_id,
    user_id: auth.user_id,
    name: textOrEmpty(args.name) || "GitHub",
    install_as_plugin: args.install_as_plugin !== false,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    redirect_after: `${appOrigin()}/dashboard/plugins?github=connected`,
  };

  await upsertConfigValue(
    auth.workspace_id,
    `oauth.github.state.${state}`,
    payload,
    "Short-lived GitHub OAuth state",
  );

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callbackUrl);
  authorize.searchParams.set("scope", scopes);
  authorize.searchParams.set("state", state);

  return {
    ok: true,
    provider: GITHUB_OAUTH_PROVIDER,
    authorize_url: authorize.toString(),
    callback_url: callbackUrl,
    scopes: scopes.split(/\s+/).filter(Boolean),
    expires_in_seconds: 600,
  };
}

async function handleConnectorsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "connectors.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, name, kind, status, config, created_at::text, updated_at::text FROM connectors WHERE workspace_id = $1`;
    for (const field of ["kind", "status"]) {
      const value = textOrEmpty(args[field]);
      if (value) {
        params.push(value);
        sql += ` AND ${field} = $${params.length}`;
      }
    }
    const queryText = textOrEmpty(args.q);
    if (queryText) {
      params.push(queryText);
      sql += ` AND name ILIKE '%' || $${params.length} || '%'`;
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
    const rows = await query<Record<string, unknown>>(sql, params);
    return rows.map((r) => ({ ...r, config: safeConfig(r.config) }));
  }
  if (name === "connectors.get") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const row = await queryOne<Record<string, unknown>>(
      `SELECT id, name, kind, status, config, created_at::text, updated_at::text FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!row) throw new Error("connector not found");
    return { ...row, config: safeConfig(row.config) };
  }
  if (name === "connectors.add") {
    const connectorName = textOrEmpty(args.name);
    const kind = textOrEmpty(args.kind);
    if (!connectorName || !kind) throw new Error("name and kind required");
    const row = await queryOne<{ id: string }>(
      `INSERT INTO connectors (workspace_id, name, kind, status, config)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
      [ws, connectorName, kind, normalizeStatus(args.status, ["active", "inactive", "error"], "inactive"), JSON.stringify(objectOrEmpty(args.config))],
    );
    return { id: row?.id, name: connectorName, kind };
  }
  if (name === "connectors.update_config") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(
      `UPDATE connectors SET config = coalesce(config, '{}'::jsonb) || $1::jsonb, updated_at = now()
       WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(objectOrEmpty(args.config)), id, ws],
    );
    return { id, updated: count > 0 };
  }
  if (name === "connectors.rename") {
    const id = textOrEmpty(args.id);
    const connectorName = textOrEmpty(args.name);
    if (!id || !connectorName) throw new Error("id and name required");
    const count = await execute(`UPDATE connectors SET name = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`, [connectorName, id, ws]);
    return { id, name: connectorName, updated: count > 0 };
  }
  if (name === "connectors.toggle") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const status = typeof args.active === "boolean" ? (args.active ? "active" : "inactive") : normalizeStatus(args.status, ["active", "inactive", "error"], "inactive");
    const count = await execute(`UPDATE connectors SET status = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`, [status, id, ws]);
    return { id, status, updated: count > 0 };
  }
  if (name === "connectors.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM connectors WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, deleted: count > 0 };
  }
  if (name === "connectors.test") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const row = await queryOne<{ id: string; name: string; kind: string; status: string; config: unknown }>(
      `SELECT id, name, kind, status, config FROM connectors WHERE id = $1 AND workspace_id = $2`,
      [id, ws],
    );
    if (!row) throw new Error("connector not found");
    const cfg = objectOrEmpty(row.config);
    return {
      id,
      ok: row.status === "active" || Boolean(cfg.url || cfg.endpoint || cfg.oauth),
      status: row.status,
      checks: {
        has_config: Object.keys(cfg).length > 0,
        has_secret_refs: JSON.stringify(cfg).includes("{{vault."),
      },
    };
  }
  if (name === "connectors.sync") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    await execute(
      `INSERT INTO events (workspace_id, kind, source, payload) VALUES ($1, 'connector.sync.requested', 'copilot', $2::jsonb)`,
      [ws, JSON.stringify({ connector_id: id })],
    );
    return { id, queued: true };
  }
  if (name === "connectors.oauth.start") {
    const kind = textOrEmpty(args.kind).toLowerCase();
    if (kind === "github") return await startGitHubOAuth(args, auth);
    return {
      ok: false,
      error: "connector_oauth_not_configured",
      detail: "OAuth needs provider-specific client configuration before a secure auth URL can be generated.",
    };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleStripeCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  const settings = await getCopilotSettings(ws);
  const stripeKey = settings?.openrouter_key || Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeKey) throw new Error("Stripe secret key not configured in Copilot settings or environment");

  // Import Stripe dynamically from esm.sh (works in Netlify Edge Functions)
  const Stripe = (await import("https://esm.sh/stripe@17.0.0")).default;
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" });

  switch (name) {
    case "stripe.create_checkout_session": {
      const { price_id, success_url, cancel_url, mode = "subscription", customer_email } = args as {
        price_id: string;
        success_url: string;
        cancel_url: string;
        mode?: "payment" | "subscription";
        customer_email?: string;
      };

      if (!price_id || !success_url || !cancel_url) throw new Error("price_id, success_url, cancel_url required");

      const sessionParams: any = {
        payment_method_types: ["card"],
        line_items: [{ price: price_id, quantity: 1 }],
        mode,
        success_url,
        cancel_url,
      };

      if (customer_email) sessionParams.customer_email = customer_email;

      const session = await stripe.checkout.sessions.create(sessionParams);
      return { ok: true, data: { session_id: session.id, url: session.url } };
    }

    case "stripe.create_portal_session": {
      const { customer_id, return_url } = args as { customer_id: string; return_url: string };
      if (!customer_id || !return_url) throw new Error("customer_id and return_url required");

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer_id,
        return_url,
      });
      return { ok: true, data: { url: portalSession.url } };
    }

    case "stripe.create_customer": {
      const { email, name, metadata } = args as { email: string; name?: string; metadata?: Record<string, string> };
      if (!email) throw new Error("email required");

      const customer = await stripe.customers.create({ email, name, metadata });
      return { ok: true, data: { customer_id: customer.id, email: customer.email } };
    }

    case "stripe.list_prices": {
      const { product_id, active = true, limit = 20 } = args as { product_id?: string; active?: boolean; limit?: number };
      const prices = await stripe.prices.list({ product: product_id, active, limit: Math.min(Math.max(Number(limit), 1), 100) });
      return { ok: true, data: prices.data.map((p) => ({ id: p.id, product_id: p.product, unit_amount: p.unit_amount, currency: p.currency, recurring: p.recurring, active: p.active })) };
    }

    case "stripe.list_products": {
      const { active = true, limit = 20 } = args as { active?: boolean; limit?: number };
      const products = await stripe.products.list({ active, limit: Math.min(Math.max(Number(limit), 1), 100) });
      return { ok: true, data: products.data.map((p) => ({ id: p.id, name: p.name, description: p.description, active: p.active, metadata: p.metadata })) };
    }

    case "stripe.create_price": {
      const { product_id, unit_amount, currency = "usd", recurring, nickname } = args as {
        product_id: string;
        unit_amount: number;
        currency?: string;
        recurring?: { interval: "month" | "year"; interval_count?: number };
        nickname?: string;
      };
      if (!product_id || !unit_amount) throw new Error("product_id and unit_amount required");

      const price = await stripe.prices.create({ product: product_id, unit_amount, currency, recurring, nickname });
      return { ok: true, data: { id: price.id, unit_amount: price.unit_amount, currency: price.currency, recurring: price.recurring } };
    }

    case "stripe.create_product": {
      const { name, description, metadata } = args as { name: string; description?: string; metadata?: Record<string, string> };
      if (!name) throw new Error("name required");

      const product = await stripe.products.create({ name, description, metadata });
      return { ok: true, data: { id: product.id, name: product.name, description: product.description } };
    }

    case "stripe.get_subscription": {
      const { subscription_id } = args as { subscription_id: string };
      if (!subscription_id) throw new Error("subscription_id required");

      const subscription = await stripe.subscriptions.retrieve(subscription_id);
      return {
        ok: true,
        data: {
          id: subscription.id,
          customer: subscription.customer,
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          items: subscription.items.data.map((item) => ({ price_id: item.price.id, quantity: item.quantity })),
        },
      };
    }

    case "stripe.cancel_subscription": {
      const { subscription_id, at_period_end = true } = args as { subscription_id: string; at_period_end?: boolean };
      if (!subscription_id) throw new Error("subscription_id required");

      const subscription = await stripe.subscriptions.update(subscription_id, { cancel_at_period_end: at_period_end });
      return { ok: true, data: { id: subscription.id, status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end } };
    }

    default:
      throw new Error(`unknown stripe command: ${name}`);
  }
}

async function handleKnowledgeCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth): Promise<unknown> {
  const ws = auth.workspace_id;
  const limit = limitOf(args.limit, 20, 100);
  if (name === "knowledge.search") {
    const queryText = textOrEmpty(args.q) || textOrEmpty(args.query);
    if (!queryText) throw new Error("q required");
    const [memories, documents, voices, images, skills] = await Promise.all([
      query(`SELECT 'memory' AS type, id, content AS title, category AS subtitle, updated_at::text FROM memories WHERE workspace_id = $1 AND archived = false AND content ILIKE '%' || $2 || '%' ORDER BY updated_at DESC LIMIT $3`, [ws, queryText, limit]),
      query(`SELECT 'document' AS type, id, name AS title, kind AS subtitle, updated_at::text FROM documents WHERE workspace_id = $1 AND (name ILIKE '%' || $2 || '%' OR coalesce(content, '') ILIKE '%' || $2 || '%') ORDER BY updated_at DESC LIMIT $3`, [ws, queryText, limit]),
      query(`SELECT 'voice' AS type, id, name AS title, transcript AS subtitle, created_at::text AS updated_at FROM voices WHERE workspace_id = $1 AND (coalesce(name, '') ILIKE '%' || $2 || '%' OR coalesce(transcript, '') ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT $3`, [ws, queryText, limit]),
      query(`SELECT 'image' AS type, id, coalesce(name, url) AS title, metadata::text AS subtitle, created_at::text AS updated_at FROM images WHERE workspace_id = $1 AND (coalesce(name, '') ILIKE '%' || $2 || '%' OR metadata::text ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT $3`, [ws, queryText, limit]),
      query(`SELECT 'skill' AS type, id, name AS title, description AS subtitle, updated_at::text FROM skills WHERE workspace_id = $1 AND (name ILIKE '%' || $2 || '%' OR coalesce(description, '') ILIKE '%' || $2 || '%') ORDER BY updated_at DESC LIMIT $3`, [ws, queryText, limit]),
    ]);
    return [...memories, ...documents, ...voices, ...images, ...skills].slice(0, limit);
  }
  if (name === "knowledge.rehydrate" || name === "knowledge.summary") {
    const [counts, memories, documents, skills, events] = await Promise.all([
      handleDatabaseCommand("database.counts", {}, auth),
      query(`SELECT id, namespace, content, category, tags, updated_at::text FROM memories WHERE workspace_id = $1 AND archived = false ORDER BY updated_at DESC LIMIT $2`, [ws, limit]),
      query(`SELECT id, name, kind, size, updated_at::text FROM documents WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`, [ws, Math.min(limit, 20)]),
      query(`SELECT id, name, slug, status, model, updated_at::text FROM skills WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2`, [ws, Math.min(limit, 20)]),
      query(`SELECT id, kind, source, payload, created_at::text FROM events WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`, [ws, Math.min(limit, 20)]),
    ]);
    return { workspace_id: ws, counts, memories, documents, skills, events };
  }
  if (name === "knowledge.related") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const seed = await queryOne<{ text: string }>(
      `SELECT content AS text FROM memories WHERE id = $1 AND workspace_id = $2
       UNION ALL SELECT coalesce(content, name) AS text FROM documents WHERE id = $1 AND workspace_id = $2
       UNION ALL SELECT coalesce(description, name) AS text FROM skills WHERE id = $1 AND workspace_id = $2
       LIMIT 1`,
      [id, ws],
    );
    const firstWord = seed?.text?.split(/\s+/).find((w) => w.length > 3) ?? "";
    return firstWord ? await handleKnowledgeCommand("knowledge.search", { q: firstWord, limit }, auth) : [];
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleMindMapCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const key = "mindmap.graph";
  const graph = await getConfigObject(auth.workspace_id, key);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes as Record<string, unknown>[] : [];
  const edges = Array.isArray(graph.edges) ? graph.edges as Record<string, unknown>[] : [];
  if (name === "mindmap.nodes.list") return nodes.slice(0, limitOf(args.limit, 100, 500));
  if (name === "mindmap.edges.list") return edges.slice(0, limitOf(args.limit, 100, 500));
  if (name === "mindmap.export") return { nodes, edges };
  if (name === "mindmap.nodes.create") {
    const label = textOrEmpty(args.label);
    if (!label) throw new Error("label required");
    const node = { id: crypto.randomUUID(), label, type: textOrEmpty(args.type) || "custom", ref_id: textOrEmpty(args.ref_id) || null, metadata: objectOrEmpty(args.metadata) };
    await upsertConfigValue(auth.workspace_id, key, { nodes: [...nodes, node], edges }, "Copilot-managed mind map graph");
    return node;
  }
  if (name === "mindmap.nodes.update") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const next = nodes.map((n) => n.id === id ? { ...n, ...(args.label !== undefined ? { label: textOrEmpty(args.label) } : {}), ...(args.type !== undefined ? { type: textOrEmpty(args.type) } : {}), ...(args.ref_id !== undefined ? { ref_id: textOrEmpty(args.ref_id) || null } : {}), ...(args.metadata !== undefined ? { metadata: { ...objectOrEmpty(n.metadata), ...objectOrEmpty(args.metadata) } } : {}) } : n);
    await upsertConfigValue(auth.workspace_id, key, { nodes: next, edges }, "Copilot-managed mind map graph");
    return { id, updated: true };
  }
  if (name === "mindmap.nodes.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    await upsertConfigValue(auth.workspace_id, key, { nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.from !== id && e.to !== id) }, "Copilot-managed mind map graph");
    return { id, deleted: true };
  }
  if (name === "mindmap.edges.create") {
    const from = textOrEmpty(args.from);
    const to = textOrEmpty(args.to);
    if (!from || !to) throw new Error("from and to required");
    const edge = { id: crypto.randomUUID(), from, to, label: textOrEmpty(args.label) || null, metadata: objectOrEmpty(args.metadata) };
    await upsertConfigValue(auth.workspace_id, key, { nodes, edges: [...edges, edge] }, "Copilot-managed mind map graph");
    return edge;
  }
  if (name === "mindmap.edges.delete") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    await upsertConfigValue(auth.workspace_id, key, { nodes, edges: edges.filter((e) => e.id !== id) }, "Copilot-managed mind map graph");
    return { id, deleted: true };
  }
  if (name === "mindmap.build_from_memory") {
    const memories = await query<{ id: string; content: string; category: string; tags: string[] }>(
      `SELECT id, content, category, tags FROM memories WHERE workspace_id = $1 AND archived = false ORDER BY updated_at DESC LIMIT $2`,
      [auth.workspace_id, limitOf(args.limit, 40, 100)],
    );
    const builtNodes = memories.map((m) => ({ id: m.id, label: m.content.slice(0, 80), type: "memory", ref_id: m.id, metadata: { category: m.category, tags: m.tags } }));
    const builtEdges: Record<string, unknown>[] = [];
    await upsertConfigValue(auth.workspace_id, key, { nodes: builtNodes, edges: builtEdges }, "Generated from recent memories");
    return { nodes: builtNodes.length, edges: builtEdges.length };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleAssetsCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name.startsWith("images.")) {
    if (name === "images.list") {
      const params: unknown[] = [ws];
      let sql = `SELECT id, name, size, url, metadata, created_at::text FROM images WHERE workspace_id = $1`;
      const queryText = textOrEmpty(args.q);
      if (queryText) {
        params.push(queryText);
        sql += ` AND (coalesce(name, '') ILIKE '%' || $${params.length} || '%' OR metadata::text ILIKE '%' || $${params.length} || '%')`;
      }
      params.push(limitOf(args.limit, 50, 200));
      sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      return await query(sql, params);
    }
    if (["images.get", "images.describe", "images.signed_url"].includes(name)) {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const row = await queryOne(`SELECT id, name, size, url, metadata, created_at::text FROM images WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      if (!row) throw new Error("image not found");
      return name === "images.signed_url" ? { id, url: (row as Record<string, unknown>).url, signed: false } : row;
    }
    if (name === "images.add_url" || name === "images.generate" || name === "images.add_from_base64") {
      const imageName = textOrEmpty(args.name) || textOrEmpty(args.prompt) || "image";
      const metadata: Record<string, unknown> = { ...objectOrEmpty(args.metadata), prompt: textOrEmpty(args.prompt) || null, model: textOrEmpty(args.model) || null, source: "copilot" };
      let url = textOrEmpty(args.url);
      let size = 0;
      if (name === "images.add_url") {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") throw new Error("image URL must be https");
      } else if (name === "images.add_from_base64") {
        const base64 = textOrEmpty(args.base64).replace(/^data:[^,]+,/, "");
        if (!base64) throw new Error("base64 required");
        const mime = textOrEmpty(args.mime) || "image/png";
        url = `data:${mime};base64,${base64}`;
        size = Math.floor(base64.length * 0.75);
      } else {
        url = "";
        metadata.status = "generation_requested";
      }
      const row = await queryOne<{ id: string }>(
        `INSERT INTO images (workspace_id, name, size, url, metadata) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
        [ws, imageName, size, url, JSON.stringify(metadata)],
      );
      return { id: row?.id, name: imageName, url: url || null, status: metadata.status ?? "registered" };
    }
    if (name === "images.delete") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM images WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }
  }
  if (name.startsWith("voices.")) {
    if (name === "voices.list") {
      const params: unknown[] = [ws];
      let sql = `SELECT id, name, size, duration, transcript, metadata, created_at::text FROM voices WHERE workspace_id = $1`;
      const queryText = textOrEmpty(args.q);
      if (queryText) {
        params.push(queryText);
        sql += ` AND (coalesce(name, '') ILIKE '%' || $${params.length} || '%' OR coalesce(transcript, '') ILIKE '%' || $${params.length} || '%')`;
      }
      params.push(limitOf(args.limit, 50, 200));
      sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      return await query(sql, params);
    }
    if (["voices.get", "voices.signed_url"].includes(name)) {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const row = await queryOne(`SELECT id, name, size, duration, transcript, metadata, created_at::text FROM voices WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      if (!row) throw new Error("voice not found");
      return name === "voices.signed_url" ? { id, url: (row as Record<string, unknown>).metadata && ((row as Record<string, unknown>).metadata as Record<string, unknown>).url, signed: false } : row;
    }
    if (name === "voices.add_from_base64") {
      const voiceName = textOrEmpty(args.name);
      const base64 = textOrEmpty(args.base64).replace(/^data:[^,]+,/, "");
      if (!voiceName || !base64) throw new Error("name and base64 required");
      const mime = textOrEmpty(args.mime) || "audio/webm";
      const row = await queryOne<{ id: string }>(
        `INSERT INTO voices (workspace_id, name, size, duration, transcript, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
        [ws, voiceName, Math.floor(base64.length * 0.75), Number(args.duration ?? 0) || null, textOrEmpty(args.transcript) || null, JSON.stringify({ ...objectOrEmpty(args.metadata), mime, data_url: `data:${mime};base64,${base64}`, source: "copilot" })],
      );
      return { id: row?.id, name: voiceName };
    }
    if (name === "voices.update_transcript") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`UPDATE voices SET transcript = $1 WHERE id = $2 AND workspace_id = $3`, [String(args.transcript ?? ""), id, ws]);
      return { id, updated: count > 0 };
    }
    if (name === "voices.rename") {
      const id = textOrEmpty(args.id);
      const voiceName = textOrEmpty(args.name);
      if (!id || !voiceName) throw new Error("id and name required");
      const count = await execute(`UPDATE voices SET name = $1 WHERE id = $2 AND workspace_id = $3`, [voiceName, id, ws]);
      return { id, name: voiceName, updated: count > 0 };
    }
    if (name === "voices.summarize") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const metadata = { summary: textOrEmpty(args.summary), action_items: stringArray(args.action_items) };
      const count = await execute(`UPDATE voices SET metadata = coalesce(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2 AND workspace_id = $3`, [JSON.stringify(metadata), id, ws]);
      return { id, updated: count > 0, ...metadata };
    }
    if (name === "voices.delete") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM voices WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleDatabaseCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "database.tables") {
    const rows = [];
    for (const table of WORKSPACE_TABLES) rows.push({ table, exists: await tableExists(table) });
    return rows;
  }
  if (name === "database.counts") {
    const rows: Record<string, number | string>[] = [];
    for (const table of WORKSPACE_TABLES) {
      if (!(await tableExists(table))) {
        rows.push({ table, count: "missing" });
        continue;
      }
      if (table === "mcp_tools") {
        const row = await queryOne<{ count: string }>(
          `SELECT count(*)::text AS count FROM mcp_tools t JOIN mcp_servers s ON s.id = t.mcp_server_id WHERE s.workspace_id = $1`,
          [ws],
        );
        rows.push({ table, count: Number(row?.count ?? 0) });
      } else if (table === "collection_items") {
        const row = await queryOne<{ count: string }>(
          `SELECT count(*)::text AS count FROM collection_items i JOIN collections c ON c.id = i.collection_id WHERE c.workspace_id = $1`,
          [ws],
        ).catch(() => ({ count: "0" }));
        rows.push({ table, count: Number(row?.count ?? 0) });
      } else {
        const row = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM ${table} WHERE workspace_id = $1`, [ws]).catch(() => ({ count: "0" }));
        rows.push({ table, count: Number(row?.count ?? 0) });
      }
    }
    return rows;
  }
  if (name === "database.table_sample") {
    const table = allowedTable(args.table);
    if (!(await tableExists(table))) return { table, rows: [], missing: true };
    if (table === "mcp_tools") {
      return await query(
        `SELECT t.id, t.name, t.description, t.enabled, t.created_at::text, s.name AS server_name
         FROM mcp_tools t JOIN mcp_servers s ON s.id = t.mcp_server_id
         WHERE s.workspace_id = $1 ORDER BY t.created_at DESC LIMIT $2`,
        [ws, limitOf(args.limit, 25, 100)],
      );
    }
    if (table === "collection_items") {
      return await query(
        `SELECT i.* FROM collection_items i JOIN collections c ON c.id = i.collection_id
         WHERE c.workspace_id = $1 ORDER BY i.created_at DESC LIMIT $2`,
        [ws, limitOf(args.limit, 25, 100)],
      );
    }
    return await query(`SELECT * FROM ${table} WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`, [ws, limitOf(args.limit, 25, 100)]);
  }
  if (name === "database.query_readonly") {
    const sql = assertSafeReadonlySql(textOrEmpty(args.sql));
    const rows = await query(`SELECT * FROM (${sql}) q LIMIT $1`, [limitOf(args.limit, 50, 100)]);
    return rows;
  }
  if (name.startsWith("collections.") || name.startsWith("collection_items.")) {
    const hasCollections = await tableExists("collections");
    const hasItems = await tableExists("collection_items");
    if (!hasCollections || !hasItems) {
      return { ok: false, error: "collections_schema_not_installed", detail: "Run the schema migration for collections and collection_items." };
    }
    if (name === "collections.list") {
      const params: unknown[] = [ws];
      let sql = `SELECT * FROM collections WHERE workspace_id = $1`;
      const queryText = textOrEmpty(args.q);
      if (queryText) {
        params.push(queryText);
        sql += ` AND (name ILIKE '%' || $${params.length} || '%' OR coalesce(description, '') ILIKE '%' || $${params.length} || '%')`;
      }
      params.push(limitOf(args.limit, 50, 200));
      sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
      return await query(sql, params);
    }
    if (name === "collections.create") {
      const collectionName = textOrEmpty(args.name);
      if (!collectionName) throw new Error("name required");
      const row = await queryOne<{ id: string }>(
        `INSERT INTO collections (workspace_id, name, slug, description, icon, schema)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
        [ws, collectionName, `${slugify(collectionName)}-${Date.now().toString(36)}`, textOrEmpty(args.description) || null, textOrEmpty(args.icon) || "database", JSON.stringify(objectOrEmpty(args.schema))],
      );
      return { id: row?.id, name: collectionName };
    }
    if (name === "collections.update") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (args.name !== undefined) { const n = textOrEmpty(args.name); updates.push(`name = $${idx++}`, `slug = $${idx++}`); params.push(n, slugify(n)); }
      if (args.description !== undefined) { updates.push(`description = $${idx++}`); params.push(textOrEmpty(args.description) || null); }
      if (args.icon !== undefined) { updates.push(`icon = $${idx++}`); params.push(textOrEmpty(args.icon) || "database"); }
      if (args.schema !== undefined) { updates.push(`schema = $${idx++}::jsonb`); params.push(JSON.stringify(objectOrEmpty(args.schema))); }
      if (!updates.length) return { id, updated: false };
      updates.push("updated_at = now()");
      params.push(id, ws);
      const count = await execute(`UPDATE collections SET ${updates.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`, params);
      return { id, updated: count > 0 };
    }
    if (name === "collections.delete") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM collections WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }
    if (name === "collection_items.list") {
      const collectionId = textOrEmpty(args.collection_id);
      if (!collectionId) throw new Error("collection_id required");
      return await query(
        `SELECT i.* FROM collection_items i JOIN collections c ON c.id = i.collection_id
         WHERE i.collection_id = $1 AND c.workspace_id = $2
         ORDER BY i.created_at DESC LIMIT $3`,
        [collectionId, ws, limitOf(args.limit, 100, 500)],
      );
    }
    if (name === "collection_items.add") {
      const collectionId = textOrEmpty(args.collection_id);
      if (!collectionId) throw new Error("collection_id required");
      const row = await queryOne<{ id: string }>(
        `INSERT INTO collection_items (collection_id, data, tags)
         SELECT $1, $2::jsonb, $3 WHERE EXISTS (SELECT 1 FROM collections WHERE id = $1 AND workspace_id = $4)
         RETURNING id`,
        [collectionId, JSON.stringify(objectOrEmpty(args.data)), stringArray(args.tags), ws],
      );
      return { id: row?.id, collection_id: collectionId };
    }
    if (name === "collection_items.update") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(
        `UPDATE collection_items i SET
           data = CASE WHEN $1::jsonb = '{}'::jsonb THEN data ELSE data || $1::jsonb END,
           tags = CASE WHEN $2::text[] = ARRAY[]::text[] THEN tags ELSE $2::text[] END,
           ai_summary = coalesce(NULLIF($3, ''), ai_summary)
         FROM collections c WHERE c.id = i.collection_id AND i.id = $4 AND c.workspace_id = $5`,
        [JSON.stringify(objectOrEmpty(args.data)), stringArray(args.tags), textOrEmpty(args.ai_summary), id, ws],
      );
      return { id, updated: count > 0 };
    }
    if (name === "collection_items.delete") {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(
        `DELETE FROM collection_items i USING collections c WHERE c.id = i.collection_id AND i.id = $1 AND c.workspace_id = $2`,
        [id, ws],
      );
      return { id, deleted: count > 0 };
    }
    if (name === "collection_items.import") {
      const collectionId = textOrEmpty(args.collection_id);
      const items = Array.isArray(args.items) ? args.items : [];
      if (!collectionId || !items.length) throw new Error("collection_id and items required");
      let inserted = 0;
      for (const item of items.slice(0, 500)) {
        const row = await queryOne<{ id: string }>(
          `INSERT INTO collection_items (collection_id, data)
           SELECT $1, $2::jsonb WHERE EXISTS (SELECT 1 FROM collections WHERE id = $1 AND workspace_id = $3)
           RETURNING id`,
          [collectionId, JSON.stringify(objectOrEmpty(item)), ws],
        );
        if (row?.id) inserted++;
      }
      return { collection_id: collectionId, inserted };
    }
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleVaultCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "vault.status") {
    const count = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM vault_secrets WHERE workspace_id = $1`, [ws]);
    return { encrypted: true, secret_count: Number(count?.count ?? 0), reveal_via_copilot: false };
  }
  if (name === "vault.list_refs") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, name, scope, metadata, last_used_at::text, created_at::text, updated_at::text FROM vault_secrets WHERE workspace_id = $1`;
    const scope = textOrEmpty(args.scope);
    if (scope) {
      params.push(scope);
      sql += ` AND scope = $${params.length}`;
    }
    const queryText = textOrEmpty(args.q);
    if (queryText) {
      params.push(queryText);
      sql += ` AND (name ILIKE '%' || $${params.length} || '%' OR metadata::text ILIKE '%' || $${params.length} || '%')`;
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY name ASC LIMIT $${params.length}`;
    const rows = await query<Record<string, unknown>>(sql, params);
    return rows.map((row) => ({ ...row, ref: `{{vault.${row.name}}}`, value: "[never returned]" }));
  }
  if (name === "vault.copy_ref") {
    const secretName = textOrEmpty(args.name);
    if (!secretName) throw new Error("name required");
    return { ref: `{{vault.${secretName}}}` };
  }
  if (name === "vault.set_secret") {
    const secretName = textOrEmpty(args.name).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const value = typeof args.value === "string" ? args.value : "";
    if (!secretName || !value) throw new Error("name and value required");
    const encrypted = await encryptSecret(value, ws);
    const payload = JSON.stringify(encrypted);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO vault_secrets (workspace_id, name, value_encrypted, scope, metadata)
       VALUES ($1, $2, convert_to($3, 'UTF8'), $4, $5::jsonb)
       ON CONFLICT (workspace_id, name) DO UPDATE SET
         value_encrypted = EXCLUDED.value_encrypted,
         scope = EXCLUDED.scope,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING id`,
      [ws, secretName, payload, textOrEmpty(args.scope) || "dev", JSON.stringify({ description: textOrEmpty(args.description), alg: encrypted.alg, hint: encrypted.hint })],
    );
    return { id: row?.id, name: secretName, ref: `{{vault.${secretName}}}`, stored: true, value: "[redacted]" };
  }
  if (name === "vault.import_env") {
    const text = typeof args.text === "string" ? args.text : "";
    if (!text.trim()) throw new Error("text required");
    let imported = 0;
    let total = 0;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      total++;
      const [rawKey, ...rest] = trimmed.split("=");
      const value = rest.join("=").replace(/^['"]|['"]$/g, "");
      const result = await handleVaultCommand("vault.set_secret", { name: rawKey, value, scope: textOrEmpty(args.scope) || "dev" }, auth);
      if ((result as Record<string, unknown>).stored) imported++;
    }
    return { imported, total };
  }
  if (name === "vault.delete_secret") {
    const id = textOrEmpty(args.id);
    const secretName = textOrEmpty(args.name);
    if (!id && !secretName) throw new Error("id or name required");
    const count = id
      ? await execute(`DELETE FROM vault_secrets WHERE id = $1 AND workspace_id = $2`, [id, ws])
      : await execute(`DELETE FROM vault_secrets WHERE name = $1 AND workspace_id = $2`, [secretName, ws]);
    return { id: id || null, name: secretName || null, deleted: count > 0 };
  }
  if (name === "vault.reveal") throw new Error("vault reveal is human-only; use the Vault page unlock flow");
  throw new Error(`server command not implemented: ${name}`);
}

async function handleObserveCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "events.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, agent_id, kind, source, payload, created_at::text FROM events WHERE workspace_id = $1`;
    for (const field of ["kind", "source"]) {
      const value = textOrEmpty(args[field]);
      if (value) {
        params.push(value);
        sql += ` AND ${field} = $${params.length}`;
      }
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "events.log") {
    const kind = textOrEmpty(args.kind);
    if (!kind) throw new Error("kind required");
    const row = await queryOne<{ id: string }>(
      `INSERT INTO events (workspace_id, kind, source, payload) VALUES ($1, $2, $3, $4::jsonb) RETURNING id`,
      [ws, kind, textOrEmpty(args.source) || "copilot", JSON.stringify(objectOrEmpty(args.payload))],
    );
    return { id: row?.id, kind };
  }
  if (name === "logs.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, kind, user_id, workspace_id, payload, created_at::text FROM identity_events WHERE workspace_id = $1`;
    const kind = textOrEmpty(args.kind);
    if (kind) {
      params.push(kind);
      sql += ` AND kind = $${params.length}`;
    }
    params.push(limitOf(args.limit, 100, 500));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "logs.search") {
    const queryText = textOrEmpty(args.q);
    if (!queryText) throw new Error("q required");
    const [events, identity] = await Promise.all([
      query(`SELECT 'event' AS type, id, kind, source, payload, created_at::text FROM events WHERE workspace_id = $1 AND (kind ILIKE '%' || $2 || '%' OR payload::text ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT $3`, [ws, queryText, limitOf(args.limit, 50, 200)]),
      query(`SELECT 'identity_event' AS type, id, kind, user_id AS source, payload, created_at::text FROM identity_events WHERE workspace_id = $1 AND (kind ILIKE '%' || $2 || '%' OR payload::text ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT $3`, [ws, queryText, limitOf(args.limit, 50, 200)]),
    ]);
    return [...events, ...identity].slice(0, limitOf(args.limit, 50, 200));
  }
  if (name === "audit.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, agent_id, action, resource, metadata, created_at::text FROM audit_log WHERE workspace_id = $1`;
    const action = textOrEmpty(args.action);
    if (action) {
      params.push(action);
      sql += ` AND action = $${params.length}`;
    }
    params.push(limitOf(args.limit, 50, 200));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "agent_calls.list") {
    const params: unknown[] = [ws];
    let sql = `SELECT id, agent_id, kind, name, status, latency_ms, tokens_in, tokens_out, metadata, created_at::text
               FROM agent_calls WHERE workspace_id = $1`;
    for (const field of ["kind", "status"]) {
      const value = textOrEmpty(args[field]);
      if (value) {
        params.push(value);
        sql += ` AND ${field} = $${params.length}`;
      }
    }
    params.push(limitOf(args.limit, 100, 500));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    return await query(sql, params);
  }
  if (name === "observe.summary") {
    const [events, calls, audit] = await Promise.all([
      queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM events WHERE workspace_id = $1 AND created_at > now() - interval '24 hours'`, [ws]),
      queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM agent_calls WHERE workspace_id = $1 AND created_at > now() - interval '24 hours'`, [ws]),
      queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM audit_log WHERE workspace_id = $1 AND created_at > now() - interval '24 hours'`, [ws]),
    ]);
    return {
      last_24h: {
        events: Number(events?.count ?? 0),
        agent_calls: Number(calls?.count ?? 0),
        audit_entries: Number(audit?.count ?? 0),
      },
    };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleProjectCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "home.summary" || name === "home.quickstart_status") {
    const counts = await handleDatabaseCommand("database.counts", {}, auth) as Array<Record<string, unknown>>;
    const byTable = new Map(counts.map((r) => [String(r.table), r.count]));
    const openrouter = await getOpenRouterApiKey(ws);
    const mcpCount = Number(byTable.get("mcp_servers") ?? 0);
    const agents = Number(byTable.get("agents") ?? 0);
    const memories = Number(byTable.get("memories") ?? 0);
    const plugins = Number(byTable.get("plugins") ?? 0);
    const connectors = Number(byTable.get("connectors") ?? 0);
    const gaps = [
      !openrouter ? "OpenRouter key missing" : "",
      agents <= 0 ? "No agents connected" : "",
      memories <= 0 ? "No memories stored" : "",
      mcpCount <= 0 ? "No MCP servers configured" : "",
      plugins <= 0 ? "No plugins installed" : "",
      connectors <= 0 ? "No connectors configured" : "",
    ].filter(Boolean);
    return {
      workspace_id: ws,
      counts,
      quickstart: {
        complete: gaps.length === 0,
        gaps,
      },
    };
  }
  if (name === "project.get") {
    const value = await getConfigObject(ws, "project.metadata");
    return { workspace_id: ws, project: value };
  }
  if (name === "project.update") {
    const current = await getConfigObject(ws, "project.metadata");
    const value = { ...current, ...objectOrEmpty(args.metadata), ...(args.name !== undefined ? { name: textOrEmpty(args.name) } : {}) };
    return await upsertConfigValue(ws, "project.metadata", value, "Copilot-managed project metadata");
  }
  if (name === "build.status" || name === "build.deploy_status") {
    return {
      app: "memorify",
      workspace_id: ws,
      api: "netlify-edge",
      database: Boolean(Deno.env.get("NEON_DATABASE_URL")) ? "configured" : "missing",
      auth: "clerk",
      openrouter: Boolean((await getOpenRouterApiKey(ws))?.key) ? "configured" : "missing",
    };
  }
  if (name === "build.checks.list") {
    return [
      { id: "database", label: "Neon database configured", destructive: false },
      { id: "auth", label: "Clerk workspace auth active", destructive: false },
      { id: "openrouter", label: "Copilot model key configured", destructive: false },
      { id: "mcp", label: "MCP servers/tools visible", destructive: false },
    ];
  }
  if (name === "build.checks.run") {
    const checks = stringArray(args.checks);
    const run = checks.length ? checks : ["database", "auth", "openrouter", "mcp"];
    const result: Record<string, unknown> = {};
    if (run.includes("database")) result.database = Boolean(Deno.env.get("NEON_DATABASE_URL"));
    if (run.includes("auth")) result.auth = Boolean(auth.user_id && ws);
    if (run.includes("openrouter")) result.openrouter = Boolean((await getOpenRouterApiKey(ws))?.key);
    if (run.includes("mcp")) result.mcp = await queryOne<{ count: string }>(`SELECT count(*)::text AS count FROM mcp_servers WHERE workspace_id = $1`, [ws]);
    return result;
  }
  if (name === "settings.copilot.get") {
    const key = await getOpenRouterApiKey(ws);
    return {
      settings: await getCopilotSettings(ws),
      openrouter_configured: Boolean(key),
      openrouter_key_source: key?.source ?? null,
      openrouter_key_hint: key?.hint ?? null,
    };
  }
  if (name === "settings.copilot.update") {
    const settings = normalizeCopilotSettings({ ...(await getCopilotSettings(ws)), ...args });
    await execute(
      `INSERT INTO config (workspace_id, key, value, description)
       VALUES ($1, 'copilot.settings', $2::jsonb, 'In-app Copilot OpenRouter runtime settings')
       ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [ws, JSON.stringify(settings)],
    );
    return { settings };
  }
  if (name === "settings.models.search") {
    const apiKey = await getOpenRouterApiKey(ws);
    if (!apiKey) throw new Error("OPENROUTER_API_KEY_not_configured");
    const settings = await getCopilotSettings(ws);
      const upstream = new URL("https://openrouter.ai/api/v1/models");
      const queryText = textOrEmpty(args.q);
      upstream.searchParams.set("limit", String(limitOf(args.limit, 12, 50)));
      upstream.searchParams.set("output_modalities", "text");
      upstream.searchParams.set("supported_parameters", "tools,temperature,max_tokens");
      upstream.searchParams.set("sort", queryText ? "most-popular" : "top-weekly");
      if (queryText) upstream.searchParams.set("q", queryText);
      const res = await fetch(upstream, { headers: { Authorization: `Bearer ${apiKey.key}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(openRouterErrorDetail(data));
      return {
        models: (Array.isArray((data as { data?: unknown[] }).data) ? (data as { data: OpenRouterModel[] }).data : [])
          .map((model) => ({
            id: model.id ?? "",
            name: model.name ?? model.id ?? "",
            description: model.description ?? "",
            context_length: model.context_length ?? null,
            pricing: model.pricing ?? null,
            supported_parameters: model.supported_parameters ?? [],
          }))
          .filter((model) => model.id),
      };
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function handleApiKeysCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;
  if (name === "api_keys.list") {
    return await query(
      `SELECT id, name, key_prefix, last_used_at::text, created_at::text
       FROM api_keys WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [ws, limitOf(args.limit, 50, 200)],
    );
  }
  if (name === "api_keys.create") {
    const keyName = textOrEmpty(args.name);
    if (!keyName) throw new Error("name required");
    const key = `syn_live_${randomHex(24)}`;
    const row = await queryOne<{ id: string }>(
      `INSERT INTO api_keys (workspace_id, user_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ws, auth.user_id, keyName, key.slice(0, 12), await sha256HexLocal(key)],
    );
    return { id: row?.id, name: keyName, key, key_notice: "Shown once. Store it now." };
  }
  if (name === "api_keys.revoke") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    const count = await execute(`DELETE FROM api_keys WHERE id = $1 AND workspace_id = $2`, [id, ws]);
    return { id, revoked: count > 0 };
  }
  if (name === "api_keys.rotate") {
    const id = textOrEmpty(args.id);
    if (!id) throw new Error("id required");
    await handleApiKeysCommand("api_keys.revoke", { id }, auth);
    return await handleApiKeysCommand("api_keys.create", { name: textOrEmpty(args.name) || "Rotated key" }, auth);
  }
  throw new Error(`server command not implemented: ${name}`);
}

async function runCopilotCommand(name: string, args: Record<string, unknown>, auth: CopilotAuth) {
  const ws = auth.workspace_id;

  if (name.startsWith("agents.") || name.startsWith("workspace.")) return await handleAgentsWorkspaceCommand(name, args, auth);
  if (name.startsWith("apps.")) return await handleAppsCommand(name, args, auth);
  if (name.startsWith("plugins.")) return await handlePluginsCommand(name, args, auth);
  if (name.startsWith("memory.")) return await handleMemoryCommand(name, args, auth);
  if (name.startsWith("documents.")) return await handleDocumentsCommand(name, args, auth);
  if (name.startsWith("web.")) return await handleDocumentsCommand(name, args, auth);
  if (name.startsWith("skills.")) return await handleSkillsCommand(name, args, auth);
  if (name.startsWith("connectors.")) return await handleConnectorsCommand(name, args, auth);
  if (name.startsWith("stripe.")) return await handleStripeCommand(name, args, auth);
  if (name.startsWith("knowledge.")) return await handleKnowledgeCommand(name, args, auth);
  if (name.startsWith("mindmap.")) return await handleMindMapCommand(name, args, auth);
  if (name.startsWith("images.") || name.startsWith("voices.")) return await handleAssetsCommand(name, args, auth);
  if (name.startsWith("database.") || name.startsWith("collections.") || name.startsWith("collection_items.")) return await handleDatabaseCommand(name, args, auth);
  if (name.startsWith("vault.")) return await handleVaultCommand(name, args, auth);
  if (name.startsWith("events.") || name.startsWith("logs.") || name.startsWith("audit.") || name.startsWith("agent_calls.") || name.startsWith("observe.")) return await handleObserveCommand(name, args, auth);
  if (name.startsWith("project.") || name.startsWith("build.") || name.startsWith("settings.") || name === "home.summary" || name === "home.quickstart_status") return await handleProjectCommand(name, args, auth);
  if (name.startsWith("api_keys.")) return await handleApiKeysCommand(name, args, auth);
  if (name === "mcp.oauth.start") {
    return await startMcpOAuth(args, auth);
  }

  switch (name) {
    case "mcp.servers.list":
      return (await query(
        `SELECT id, name, url, transport, auth_type, enabled, last_handshake_at::text, last_error, created_at::text, updated_at::text
         FROM mcp_servers WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [ws],
      )).map(redactServer);

    case "mcp.servers.get": {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const server = await queryOne(
        `SELECT id, name, url, transport, auth_type, auth_config, enabled, last_handshake_at::text, last_error, created_at::text, updated_at::text
         FROM mcp_servers WHERE id = $1 AND workspace_id = $2`,
        [id, ws],
      );
      if (!server) throw new Error("server not found");
      const tools = await query(
        `SELECT id, name, description, input_schema, enabled, created_at::text
         FROM mcp_tools WHERE mcp_server_id = $1 ORDER BY name ASC`,
        [id],
      );
      return { server: redactServer(server), tools };
    }

    case "mcp.servers.add": {
      const nameArg = textOrEmpty(args.name);
      const urlArg = textOrEmpty(args.url);
      if (!nameArg || !urlArg) throw new Error("name and url required");
      const normalized = await normalizeMcpServerInput(urlArg, args.auth, ws);
      const parsed = new URL(normalized.url);
      if (parsed.protocol !== "https:") throw new Error("MCP server URL must be https");
      const transport = textOrEmpty(args.transport) || "http";
      if (!["http", "sse"].includes(transport)) throw new Error("transport must be http or sse");
      const row = await queryOne<{ id: string }>(
        `INSERT INTO mcp_servers (workspace_id, name, url, transport, auth_type, auth_config, enabled)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
        [ws, nameArg, normalized.url, transport, normalized.auth_type, JSON.stringify(normalized.auth_config), boolOr(args.enabled, true)],
      );
      const result = { id: row?.id, name: nameArg, url: normalized.url, transport };
      if (row?.id && args.sync !== false) {
        return { ...result, sync: await syncMcpServer(ws, row.id) };
      }
      return result;
    }

    case "mcp.servers.update": {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (args.name !== undefined) { updates.push(`name = $${idx++}`); params.push(textOrEmpty(args.name)); }
      let normalized: Awaited<ReturnType<typeof normalizeMcpServerInput>> | null = null;
      let urlContainedToken = false;
      if (args.url !== undefined) {
        const urlArg = textOrEmpty(args.url);
        urlContainedToken = isZapierMcpUrl(urlArg) && new URL(urlArg).searchParams.has("token");
        normalized = await normalizeMcpServerInput(urlArg, args.auth, ws);
        const parsed = new URL(normalized.url);
        if (parsed.protocol !== "https:") throw new Error("MCP server URL must be https");
        updates.push(`url = $${idx++}`);
        params.push(normalized.url);
      }
      if (args.transport !== undefined) {
        const transport = textOrEmpty(args.transport);
        if (!["http", "sse"].includes(transport)) throw new Error("transport must be http or sse");
        updates.push(`transport = $${idx++}`);
        params.push(transport);
      }
      if (args.auth !== undefined || urlContainedToken) {
        if (!normalized) {
          const current = await queryOne<{ url: string }>(
            `SELECT url FROM mcp_servers WHERE id = $1 AND workspace_id = $2`,
            [id, ws],
          );
          if (!current) throw new Error("server not found");
          normalized = await normalizeMcpServerInput(current.url, args.auth, ws);
        }
        updates.push(`auth_type = $${idx++}`, `auth_config = $${idx++}::jsonb`);
        params.push(normalized.auth_type, JSON.stringify(normalized.auth_config));
      }
      if (!updates.length) return { id, updated: false };
      updates.push("updated_at = now()");
      params.push(id, ws);
      const count = await execute(
        `UPDATE mcp_servers SET ${updates.join(", ")} WHERE id = $${idx++} AND workspace_id = $${idx}`,
        params,
      );
      return { id, updated: count > 0 };
    }

    case "mcp.servers.rename": {
      const id = textOrEmpty(args.id);
      const nameArg = textOrEmpty(args.name);
      if (!id || !nameArg) throw new Error("id and name required");
      const count = await execute(
        `UPDATE mcp_servers SET name = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
        [nameArg, id, ws],
      );
      return { id, updated: count > 0 };
    }

    case "mcp.servers.toggle": {
      const id = textOrEmpty(args.id);
      if (!id || typeof args.enabled !== "boolean") throw new Error("id and enabled required");
      const count = await execute(
        `UPDATE mcp_servers SET enabled = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
        [args.enabled, id, ws],
      );
      return { id, enabled: args.enabled, updated: count > 0 };
    }

    case "mcp.servers.delete": {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM mcp_servers WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }

    case "mcp.tools.list": {
      const serverId = textOrEmpty(args.server_id);
      const enabledOnly = args.enabled_only === true;
      const params: unknown[] = [ws];
      let sql = `SELECT t.id, t.name, t.description, t.input_schema, t.enabled, t.mcp_server_id, s.name AS server_name
                 FROM mcp_tools t JOIN mcp_servers s ON s.id = t.mcp_server_id
                 WHERE s.workspace_id = $1`;
      if (serverId) {
        params.push(serverId);
        sql += ` AND t.mcp_server_id = $${params.length}`;
      }
      if (enabledOnly) sql += " AND t.enabled = true AND s.enabled = true";
      sql += " ORDER BY s.name ASC, t.name ASC";
      return await query(sql, params);
    }

    case "mcp.tools.toggle": {
      const id = textOrEmpty(args.id);
      if (!id || typeof args.enabled !== "boolean") throw new Error("id and enabled required");
      const count = await execute(
        `UPDATE mcp_tools t SET enabled = $1
         FROM mcp_servers s
         WHERE t.id = $2 AND t.mcp_server_id = s.id AND s.workspace_id = $3`,
        [args.enabled, id, ws],
      );
      return { id, enabled: args.enabled, updated: count > 0 };
    }

    case "mcp.sync":
      return await syncMcpServer(ws, textOrEmpty(args.server_id));

    case "mcp.call": {
      const serverId = textOrEmpty(args.server_id);
      const tool = textOrEmpty(args.tool);
      if (!serverId || !tool) throw new Error("server_id and tool required");
      const server = await queryOne<{ url: string; auth_type: string; auth_config: Record<string, unknown> }>(
        `SELECT s.url, s.auth_type, s.auth_config
         FROM mcp_servers s
         JOIN mcp_tools t ON t.mcp_server_id = s.id
         WHERE s.id = $1 AND s.workspace_id = $2 AND s.enabled = true AND t.name = $3 AND t.enabled = true`,
        [serverId, ws, tool],
      );
      if (!server) throw new Error("server/tool not found or disabled");
      let headers = await authHeaders(server, ws);
      const requestUrl = await mcpRequestUrl(server.url, server.auth_config, ws);
      headers = await initializeMcpSession(requestUrl, headers);
      const res = await fetch(requestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name: tool, arguments: args.arguments ?? {} },
        }),
      });
      const data = await readMcpJsonResponse(res);
      if (!res.ok || data.error) throw new Error(mcpErrorMessage(data, `tool call failed: HTTP ${res.status}`));
      return data;
    }

    case "memory.add": {
      const content = textOrEmpty(args.content);
      if (!content) throw new Error("content required");
      const namespace = textOrEmpty(args.namespace) || "default";
      const category = textOrEmpty(args.category) || "general";
      const tags = Array.isArray(args.tags) ? args.tags.filter((t) => typeof t === "string") : [];
      const row = await queryOne<{ id: string }>(
        `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
        [ws, namespace, content, category, tags, JSON.stringify({ source: "copilot" })],
      );
      return { id: row?.id, namespace, content, category, tags };
    }

    case "memory.list": {
      const params: unknown[] = [ws];
      let sql = `SELECT id, namespace, content, category, tags, archived, created_at::text, updated_at::text
                 FROM memories WHERE workspace_id = $1`;
      if (!args.include_archived) sql += " AND archived = false";
      for (const [field, column] of [["namespace", "namespace"], ["category", "category"]] as const) {
        const value = textOrEmpty(args[field]);
        if (value) {
          params.push(value);
          sql += ` AND ${column} = $${params.length}`;
        }
      }
      const q = textOrEmpty(args.q);
      if (q) {
        params.push(q);
        sql += ` AND content ILIKE '%' || $${params.length} || '%'`;
      }
      params.push(limitOf(args.limit));
      sql += ` ORDER BY updated_at DESC LIMIT $${params.length}`;
      return await query(sql, params);
    }

    case "memory.delete": {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM memories WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }

    case "memory.session.create": {
      const title = textOrEmpty(args.name) || textOrEmpty(args.date) || (args.number ? `s${Number(args.number)}` : new Date().toISOString().slice(0, 10));
      const slug = slugify(title);
      const namespace = `session:${slug}`;
      const tags = Array.isArray(args.tags) ? args.tags.filter((t) => typeof t === "string") : [];
      const row = await queryOne<{ id: string }>(
        `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
         VALUES ($1, $2, $3, 'session', $4, $5::jsonb) RETURNING id`,
        [ws, namespace, title, tags, JSON.stringify({ description: textOrEmpty(args.description), source: "copilot" })],
      );
      return { id: row?.id, slug, namespace, title };
    }

    case "memory.session.add":
      return await runCopilotCommand("memory.add", {
        ...args,
        namespace: textOrEmpty(args.namespace) || `session:${slugify(textOrEmpty(args.slug) || textOrEmpty(args.name))}`,
      }, auth);

    case "memory.session.list":
      return await query(
        `SELECT marker.id, marker.namespace, marker.content AS title, marker.created_at::text,
                count(items.id) FILTER (WHERE items.category <> 'session') AS item_count
         FROM memories marker
         LEFT JOIN memories items ON items.workspace_id = marker.workspace_id AND items.namespace = marker.namespace AND items.archived = false
         WHERE marker.workspace_id = $1 AND marker.category = 'session' AND marker.archived = false
         GROUP BY marker.id, marker.namespace, marker.content, marker.created_at
         ORDER BY marker.created_at DESC`,
        [ws],
      );

    case "memory.session.delete": {
      const namespace = textOrEmpty(args.namespace) || `session:${slugify(textOrEmpty(args.slug))}`;
      const count = args.cascade === true
        ? await execute(`DELETE FROM memories WHERE workspace_id = $1 AND namespace = $2`, [ws, namespace])
        : await execute(`DELETE FROM memories WHERE workspace_id = $1 AND namespace = $2 AND category = 'session'`, [ws, namespace]);
      return { namespace, deleted: count };
    }

    case "documents.list": {
      const params: unknown[] = [ws];
      let sql = `SELECT id, name, kind, size, source_url, created_at::text, updated_at::text
                 FROM documents WHERE workspace_id = $1`;
      const q = textOrEmpty(args.q);
      if (q) {
        params.push(q);
        sql += ` AND name ILIKE '%' || $${params.length} || '%'`;
      }
      params.push(limitOf(args.limit, 50, 200));
      sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      return await query(sql, params);
    }

    case "documents.add_note": {
      const title = textOrEmpty(args.title);
      if (!title) throw new Error("title required");
      const format = ["md", "txt", "json"].includes(textOrEmpty(args.format)) ? textOrEmpty(args.format) : "md";
      const rawContent = args.content;
      const content = format === "json" && typeof rawContent !== "string"
        ? JSON.stringify(rawContent, null, 2)
        : String(rawContent ?? "");
      const nameArg = title.endsWith(`.${format}`) ? title : `${title}.${format}`;
      const row = await queryOne<{ id: string }>(
        `INSERT INTO documents (workspace_id, name, kind, size, content, metadata)
         VALUES ($1, $2, 'text', $3, $4, $5::jsonb) RETURNING id`,
        [ws, nameArg, content.length, content, JSON.stringify({ source: "copilot", format })],
      );
      return { id: row?.id, name: nameArg, size: content.length };
    }

    case "documents.add_from_url": {
      const urlArg = textOrEmpty(args.url);
      if (!urlArg) throw new Error("url required");
      const parsed = new URL(urlArg);
      if (parsed.protocol !== "https:") throw new Error("document URL must be https");
      const res = await fetch(urlArg);
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      const content = await res.text();
      const nameArg = textOrEmpty(args.name) || parsed.pathname.split("/").filter(Boolean).pop() || urlArg;
      const row = await queryOne<{ id: string }>(
        `INSERT INTO documents (workspace_id, name, kind, size, content, source_url, metadata)
         VALUES ($1, $2, 'text', $3, $4, $5, $6::jsonb) RETURNING id`,
        [ws, nameArg, content.length, content, urlArg, JSON.stringify({ source: "copilot" })],
      );
      return { id: row?.id, name: nameArg, size: content.length };
    }

    case "documents.delete": {
      const id = textOrEmpty(args.id);
      if (!id) throw new Error("id required");
      const count = await execute(`DELETE FROM documents WHERE id = $1 AND workspace_id = $2`, [id, ws]);
      return { id, deleted: count > 0 };
    }

    /* ─── Copilot chat sessions ─── */

    case "copilot.session.save": {
      const messages = Array.isArray(args.messages) ? args.messages : [];
      const toolCalls = Array.isArray(args.tool_calls) ? args.tool_calls : [];
      const title = textOrEmpty(args.title) || (messages.find((m: any) => m.role === "user")?.content ?? "Untitled").slice(0, 80);
      const sessionId = textOrEmpty(args.id);

      if (sessionId) {
        await execute(
          `UPDATE copilot_sessions SET messages = $3::jsonb, tool_calls = $4::jsonb, title = $5, updated_at = now()
           WHERE id = $1 AND workspace_id = $2`,
          [sessionId, ws, JSON.stringify(messages), JSON.stringify(toolCalls), title],
        );
        return { id: sessionId, title };
      }

      const row = await queryOne<{ id: string }>(
        `INSERT INTO copilot_sessions (workspace_id, user_id, title, messages, tool_calls)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb) RETURNING id`,
        [ws, auth.user_id, title, JSON.stringify(messages), JSON.stringify(toolCalls)],
      );
      return { id: row?.id, title };
    }

    case "copilot.session.load": {
      const sessionId = textOrEmpty(args.id);
      if (!sessionId) throw new Error("id required");
      const row = await queryOne<{ id: string; title: string; messages: unknown; tool_calls: unknown; review: string | null; reviewed: boolean; created_at: string; updated_at: string }>(
        `SELECT id, title, messages, tool_calls, review, reviewed, created_at::text, updated_at::text
         FROM copilot_sessions WHERE id = $1 AND workspace_id = $2`,
        [sessionId, ws],
      );
      if (!row) throw new Error("session not found");
      return row;
    }

    case "copilot.session.list": {
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
      return await query(
        `SELECT id, title, reviewed, created_at::text, updated_at::text
         FROM copilot_sessions WHERE workspace_id = $1
         ORDER BY updated_at DESC LIMIT $2`,
        [ws, limit],
      );
    }

    case "copilot.session.delete": {
      const sessionId = textOrEmpty(args.id);
      if (!sessionId) throw new Error("id required");
      const count = await execute(`DELETE FROM copilot_sessions WHERE id = $1 AND workspace_id = $2`, [sessionId, ws]);
      return { id: sessionId, deleted: count > 0 };
    }

    case "copilot.session.review": {
      // Self-improvement review: summarize conversation and save as memory
      const sessionId = textOrEmpty(args.id);
      if (!sessionId) throw new Error("id required");

      const session = await queryOne<{ messages: unknown; title: string }>(
        `SELECT messages, title FROM copilot_sessions WHERE id = $1 AND workspace_id = $2`,
        [sessionId, ws],
      );
      if (!session) throw new Error("session not found");

      const msgs = Array.isArray(session.messages) ? session.messages : [];
      // Build a compact summary of what happened
      const userMsgs = msgs.filter((m: any) => m.role === "user").map((m: any) => m.content).filter(Boolean);
      const toolNames = msgs.filter((m: any) => m.chips).flatMap((m: any) => m.chips.map((c: any) => c.name));
      const errors = msgs.filter((m: any) => m.role === "assistant" && m.content?.includes("error")).map((m: any) => m.content);

      const reviewText = [
        `Copilot session: ${session.title}`,
        `Date: ${new Date().toISOString()}`,
        `User messages: ${userMsgs.length}`,
        `Tools called: ${toolNames.length ? toolNames.join(", ") : "none"}`,
        `Errors: ${errors.length || "none"}`,
        "",
        "Conversation transcript:",
        ...msgs.map((m: any) => {
          if (m.role === "tool") return `[tool: ${m.tool_call_id?.slice(0, 8)}] ${String(m.content).slice(0, 200)}`;
          if (m.chips?.length) return `[assistant + tools: ${m.chips.map((c: any) => c.name).join(", ")}] ${m.content?.slice(0, 200) ?? ""}`;
          return `[${m.role}] ${String(m.content).slice(0, 300)}`;
        }),
      ].join("\n");

      // Save review as a memory
      const memRow = await queryOne<{ id: string }>(
        `INSERT INTO memories (workspace_id, namespace, content, category, tags, metadata)
         VALUES ($1, 'copilot-review', $2, 'session', $3, $4::jsonb) RETURNING id`,
        [ws, reviewText.slice(0, 8000), ["copilot", "self-improvement", "review"], JSON.stringify({ session_id: sessionId, source: "copilot-review" })],
      );

      // Mark session as reviewed
      await execute(
        `UPDATE copilot_sessions SET reviewed = true, review = $3, updated_at = now()
         WHERE id = $1 AND workspace_id = $2`,
        [sessionId, ws, reviewText.slice(0, 4000)],
      );

      return {
        session_id: sessionId,
        memory_id: memRow?.id,
        review: reviewText.slice(0, 500),
        reviewed: true,
      };
    }

    default:
      throw new Error(`server command not implemented: ${name}`);
  }
}

export async function handleCopilotAction(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { name?: string; args?: Record<string, unknown>; workspace_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const auth = await requireCopilotAuth(req, body.workspace_id);
  if (auth instanceof Response) return auth;

  const name = textOrEmpty(body.name);
  if (!name) return json({ ok: false, error: "name required" }, 400);

  try {
    const result = await runCopilotCommand(name, body.args ?? {}, auth);
    await execute(
      `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
       VALUES ('copilot.action', $1, $2, $3::jsonb)`,
      [auth.user_id, auth.workspace_id, JSON.stringify({ name })],
    ).catch(() => {});
    return json({ ok: true, data: result });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }
}

// ── File upload handler (multipart/form-data) ─────────────────────
// Accepts a file via multipart/form-data, extracts text, runs RAG pipeline,
// and stores the document in Neon. Bypasses base64 inflation.
// Max file size: 6 MB (CDN limit). Files larger than this are rejected.

const MAX_UPLOAD_SIZE = 6 * 1024 * 1024; // 6 MB
const ALLOWED_MIME_TYPES = new Set([
  "text/plain", "text/markdown", "text/csv", "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
]);

export async function handleCopilotUpload(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id") || req.headers.get("x-workspace-id") || "";
  const auth = await requireCopilotAuth(req, workspaceId || undefined);
  if (auth instanceof Response) return auth;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "expected_multipart_form_data" }, 400);
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return json({ error: "no_file", detail: "Upload a file under the 'file' field." }, 400);
    }

    const filename = file.name || "upload.bin";
    const mime = file.type || "application/octet-stream";
    const size = file.size;

    if (size > MAX_UPLOAD_SIZE) {
      return json({
        error: "file_too_large",
        detail: `File is ${(size / 1024 / 1024).toFixed(1)} MB. Maximum is 6 MB (Netlify CDN limit).`,
        size_bytes: size,
      }, 413);
    }

    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Store in documents table
    const kind = mimeKind(mime, filename);
    const bytesBase64 = bytesToBase64(bytes);
    const row = await queryOne<{ id: string }>(
      `INSERT INTO documents (workspace_id, name, kind, size, bytes, metadata)
       VALUES ($1, $2, $3, $4, decode($5, 'base64'), $6::jsonb) RETURNING id`,
      [
        auth.workspace_id,
        filename,
        kind,
        size,
        bytesBase64,
        JSON.stringify({ source: "copilot-upload", mime, original_name: filename }),
      ],
    );

    // Run RAG pipeline: extract text → chunk → embed → store
    const ragResult = await processDocumentForRag(
      row?.id ?? "",
      auth.workspace_id,
      kind,
      mime,
      filename,
      null, // content (null for binary — will be extracted by RAG)
      bytes,
    );

    // Log to identity_events
    await execute(
      `INSERT INTO identity_events (kind, user_id, workspace_id, payload)
       VALUES ('copilot.upload', $1, $2, $3::jsonb)`,
      [auth.user_id, auth.workspace_id, JSON.stringify({ filename, size, kind, rag: ragResult })],
    ).catch(() => {});

    return json({
      ok: true,
      data: {
        id: row?.id,
        name: filename,
        kind,
        size,
        mime,
        rag: ragResult,
      },
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
