// backend/tests/mcp-tools.test.ts
// Tests for MCP agent token tools

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { handleMcp } from "../routes/mcp.ts";
import { createAgentToken, verifyAgentToken, revokeAgentToken, listAgentTokens } from "../lib/agent-token.ts";
import { query, queryOne, execute } from "../lib/db.ts";

// Mock dependencies
vi.mock("../lib/db.ts", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn((fn) => fn(vi.fn())),
}));

vi.mock("../lib/agent-token.ts", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    createAgentToken: vi.fn(),
    verifyAgentToken: vi.fn(),
    revokeAgentToken: vi.fn(),
    listAgentTokens: vi.fn(),
  };
});

const mockPrivateKey = "MC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1wbWFyZm9yIGRlbW8ga2V5IGZvciB0ZXN0aW5n";
const mockPublicKey = "MCowBQYDK2VwAyEAJGzcyKvZjbOGJjxhJHJhJHJhJHJhJHJhJHJhJHJhJHQ=";

describe("MCP Agent Token Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEON_JWT_PRIVATE_KEY = mockPrivateKey;
    process.env.NEON_JWT_PUBLIC_KEY = mockPublicKey;
  });

  afterEach(() => {
    delete process.env.NEON_JWT_PRIVATE_KEY;
    delete process.env.NEON_JWT_PUBLIC_KEY;
  });

  const makeRequest = (method: string, params: any, token: string = "mem_live_validtoken") => {
    return new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  };

  const makeGetRequest = () => {
    return new Request("http://localhost/mcp", { method: "GET" });
  };

  describe("tools/list", () => {
    it("should include agent token tools in tool list", async () => {
      const req = makeGetRequest();
      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.tools).toContain("agent_token_create");
      expect(data.tools).toContain("agent_token_revoke");
      expect(data.tools).toContain("agent_token_list");
    });
  });

  describe("agent_token_create", () => {
    it("should require tokens:admin scope", async () => {
      // Mock verifyAgentToken to return payload without tokens:admin
      const { verifyAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["memory:read"],
        jti: "test-jti",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_create",
        arguments: {
          agent_id: "agent-123",
          scopes: ["memory:read"],
        },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.error).toBeDefined();
      expect(data.error.message).toContain("Insufficient scope: tokens:admin required");
    });

    it("should create token when authorized", async () => {
      const { verifyAgentToken, createAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });
      (createAgentToken as any).mockResolvedValueOnce({
        token: "mem_live_newtoken...",
        jti: "new-jti",
        expiresAt: "2024-12-31T00:00:00Z",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_create",
        arguments: {
          agent_id: "target-agent",
          scopes: ["memory:read", "skills:read"],
          expires_in_seconds: 3600,
        },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.result).toBeDefined();
      expect(data.result.content[0].text).toContain("mem_live_newtoken");
      expect(createAgentToken).toHaveBeenCalledWith({
        workspace_id: "ws-123",
        agent_id: "target-agent",
        scopes: ["memory:read", "skills:read"],
        expiresInSeconds: 3600,
      });
    });

    it("should validate required parameters", async () => {
      const { verifyAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_create",
        arguments: {
          // missing agent_id and scopes
        },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.error).toBeDefined();
    });
  });

  describe("agent_token_revoke", () => {
    it("should require tokens:admin scope", async () => {
      const { verifyAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["memory:read"],
        jti: "test-jti",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_revoke",
        arguments: { jti: "token-to-revoke" },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.error).toBeDefined();
      expect(data.error.message).toContain("Insufficient scope: tokens:admin required");
    });

    it("should revoke by jti when authorized", async () => {
      const { verifyAgentToken, revokeAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });
      (revokeAgentToken as any).mockResolvedValueOnce(1);

      const req = makeRequest("tools/call", {
        name: "agent_token_revoke",
        arguments: { jti: "token-to-revoke" },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.result).toBeDefined();
      expect(data.result.content[0].text).toContain("revoked");
      expect(revokeAgentToken).toHaveBeenCalledWith({
        workspace_id: "ws-123",
        jti: "token-to-revoke",
        prefix: undefined,
      });
    });

    it("should revoke by prefix when authorized", async () => {
      const { verifyAgentToken, revokeAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });
      (revokeAgentToken as any).mockResolvedValueOnce(3);

      const req = makeRequest("tools/call", {
        name: "agent_token_revoke",
        arguments: { prefix: "batch-" },
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.result).toBeDefined();
      expect(revokeAgentToken).toHaveBeenCalledWith({
        workspace_id: "ws-123",
        jti: undefined,
        prefix: "batch-",
      });
    });

    it("should fail when neither jti nor prefix provided", async () => {
      const { verifyAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_revoke",
        arguments: {},
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.error).toBeDefined();
      expect(data.error.message).toContain("Either jti or prefix required");
    });
  });

  describe("agent_token_list", () => {
    it("should require tokens:admin or workspace:admin scope", async () => {
      const { verifyAgentToken } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["memory:read"],
        jti: "test-jti",
      });

      const req = makeRequest("tools/call", {
        name: "agent_token_list",
        arguments: {},
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.error).toBeDefined();
      expect(data.error.message).toContain("Insufficient scope");
    });

    it("should allow tokens:admin scope", async () => {
      const { verifyAgentToken, listAgentTokens } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["tokens:admin"],
        jti: "test-jti",
      });
      (listAgentTokens as any).mockResolvedValueOnce([
        { id: "1", agent_id: "agent-1", jti: "jti-1", scopes: ["memory:read"], created_at: "2024-01-01", last_used_at: null, revoked_at: null, expires_at: null },
      ]);

      const req = makeRequest("tools/call", {
        name: "agent_token_list",
        arguments: {},
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.result).toBeDefined();
      expect(listAgentTokens).toHaveBeenCalledWith("ws-123");
    });

    it("should allow workspace:admin scope", async () => {
      const { verifyAgentToken, listAgentTokens } = await import("../lib/agent-token.ts");
      (verifyAgentToken as any).mockResolvedValueOnce({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["workspace:admin"],
        jti: "test-jti",
      });
      (listAgentTokens as any).mockResolvedValueOnce([]);

      const req = makeRequest("tools/call", {
        name: "agent_token_list",
        arguments: {},
      });

      const res = await handleMcp(req);
      const data = await res.json();

      expect(data.result).toBeDefined();
    });
  });
});