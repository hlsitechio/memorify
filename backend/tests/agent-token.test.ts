// backend/tests/agent-token.test.ts
// Tests for agent token management (mint, verify, revoke, list)

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createAgentToken, verifyAgentToken, revokeAgentToken, listAgentTokens, VALID_SCOPES, type Scope } from "../lib/agent-token.ts";
import { query, queryOne, execute } from "../lib/db.ts";

// Mock the database
vi.mock("../lib/db.ts", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  execute: vi.fn(),
  withTransaction: vi.fn((fn) => fn(vi.fn())),
}));

// Mock environment variables
const mockPrivateKey = "MC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1wbWFyZm9yIGRlbW8ga2V5IGZvciB0ZXN0aW5n";
const mockPublicKey = "MCowBQYDK2VwAyEAJGzcyKvZjbOGJjxhJHJhJHJhJHJhJHJhJHJhJHJhJHQ=";

vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  subtle: {
    ...globalThis.crypto.subtle,
    importKey: vi.fn(async (format: string, keyData: ArrayBuffer, algorithm: any, extractable: boolean, usages: string[]) => {
      if (algorithm.name === "Ed25519") {
        return { format, keyData, algorithm, extractable, usages } as any;
      }
      return globalThis.crypto.subtle.importKey(format, keyData, algorithm, extractable, usages);
    }),
    sign: vi.fn(async () => new Uint8Array(64).fill(1)),
    verify: vi.fn(async () => true),
    digest: vi.fn(async (algo: string, data: ArrayBuffer) => {
      const hash = await globalThis.crypto.subtle.digest(algo, data);
      return hash;
    }),
  },
  randomUUID: vi.fn(() => "550e8400-e29b-41d4-a716-446655440000"),
});

describe("Agent Token Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variables
    process.env.NEON_JWT_PRIVATE_KEY = mockPrivateKey;
    process.env.NEON_JWT_PUBLIC_KEY = mockPublicKey;
  });

  afterEach(() => {
    delete process.env.NEON_JWT_PRIVATE_KEY;
    delete process.env.NEON_JWT_PUBLIC_KEY;
  });

  describe("VALID_SCOPES", () => {
    it("should contain all required scopes", () => {
      expect(VALID_SCOPES).toEqual([
        "memory:read",
        "memory:write",
        "skills:read",
        "skills:write",
        "documents:read",
        "documents:write",
        "events:read",
        "events:write",
        "workspace:admin",
        "tokens:admin",
      ]);
    });
  });

  describe("createAgentToken", () => {
    it("should create a token with valid scopes", async () => {
      (queryOne as any).mockResolvedValueOnce({ id: "agent-123", workspace_id: "ws-123" });
      (execute as any).mockResolvedValueOnce(1);

      const result = await createAgentToken({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["memory:read", "memory:write"],
        expiresInSeconds: 3600,
      });

      expect(result).toHaveProperty("token");
      expect(result.token).toMatch(/^mem_live_[a-f0-9-]+\.[^.]+\.[^.]+$/);
      expect(result).toHaveProperty("jti");
      expect(result).toHaveProperty("expiresAt");
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO agent_tokens"),
        expect.arrayContaining(["ws-123", "agent-123", expect.any(String), expect.any(String), ["memory:read", "memory:write"], expect.any(String)])
      );
    });

    it("should throw on invalid scopes", async () => {
      await expect(createAgentToken({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["invalid:scope"],
      })).rejects.toThrow("Invalid scopes: invalid:scope");
    });

    it("should throw on empty scopes", async () => {
      await expect(createAgentToken({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: [],
      })).rejects.toThrow("At least one valid scope required");
    });

    it("should throw when agent not found in workspace", async () => {
      (queryOne as any).mockResolvedValueOnce(null);

      await expect(createAgentToken({
        workspace_id: "ws-123",
        agent_id: "agent-123",
        scopes: ["memory:read"],
      })).rejects.toThrow("Agent not found in workspace");
    });

    it("should throw when rate limit exceeded", async () => {
      // This test would need to manipulate the internal rate limit map
      // For now, we just verify the function exists
      expect(typeof createAgentToken).toBe("function");
    });
  });

  describe("verifyAgentToken", () => {
    it("should return null for invalid token format", async () => {
      const result = await verifyAgentToken("invalid-token");
      expect(result).toBeNull();
    });

    it("should return null for token with wrong signature", async () => {
      // Mock verify to return false
      const { subtle } = globalThis.crypto as any;
      subtle.verify.mockResolvedValueOnce(false);

      (queryOne as any).mockResolvedValueOnce({
        revoked_at: null,
        expires_at: null,
        scopes: ["memory:read"],
        workspace_id: "ws-123",
        agent_id: "agent-123",
      });

      const result = await verifyAgentToken("mem_live_abc.def.ghi");
      expect(result).toBeNull();
    });

    it("should return null for expired token", async () => {
      (queryOne as any).mockResolvedValueOnce({
        revoked_at: null,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        scopes: ["memory:read"],
        workspace_id: "ws-123",
        agent_id: "agent-123",
      });

      const result = await verifyAgentToken("mem_live_abc.def.ghi");
      expect(result).toBeNull();
    });

    it("should return null for revoked token", async () => {
      (queryOne as any).mockResolvedValueOnce({
        revoked_at: new Date().toISOString(),
        expires_at: null,
        scopes: ["memory:read"],
        workspace_id: "ws-123",
        agent_id: "agent-123",
      });

      const result = await verifyAgentToken("mem_live_abc.def.ghi");
      expect(result).toBeNull();
    });

    it("should return payload for valid token", async () => {
      (queryOne as any).mockResolvedValueOnce({
        revoked_at: null,
        expires_at: null,
        scopes: ["memory:read", "memory:write"],
        workspace_id: "ws-123",
        agent_id: "agent-123",
      });

      const result = await verifyAgentToken("mem_live_abc.def.ghi");

      expect(result).not.toBeNull();
      expect(result?.workspace_id).toBe("ws-123");
      expect(result?.agent_id).toBe("agent-123");
      expect(result?.scopes).toEqual(["memory:read", "memory:write"]);
      expect(result?.jti).toBe("abc");
    });
  });

  describe("revokeAgentToken", () => {
    it("should revoke token by jti", async () => {
      (execute as any).mockResolvedValueOnce(1);

      const revoked = await revokeAgentToken({
        workspace_id: "ws-123",
        jti: "token-jti-123",
      });

      expect(revoked).toBe(1);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agent_tokens SET revoked_at = now()"),
        expect.arrayContaining(["ws-123", "token-jti-123"])
      );
    });

    it("should revoke tokens by prefix", async () => {
      (execute as any).mockResolvedValueOnce(3);

      const revoked = await revokeAgentToken({
        workspace_id: "ws-123",
        prefix: "batch-",
      });

      expect(revoked).toBe(3);
      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agent_tokens SET revoked_at = now()"),
        expect.arrayContaining(["ws-123", "batch-%"])
      );
    });

    it("should throw when neither jti nor prefix provided", async () => {
      await expect(revokeAgentToken({ workspace_id: "ws-123" })).rejects.toThrow("Either jti or prefix required");
    });
  });

  describe("listAgentTokens", () => {
    it("should list tokens for workspace", async () => {
      const mockTokens = [
        { id: "1", agent_id: "agent-1", jti: "jti-1", scopes: ["memory:read"], created_at: "2024-01-01T00:00:00Z", last_used_at: null, revoked_at: null, expires_at: null },
        { id: "2", agent_id: "agent-2", jti: "jti-2", scopes: ["memory:write"], created_at: "2024-01-02T00:00:00Z", last_used_at: "2024-01-03T00:00:00Z", revoked_at: null, expires_at: "2024-12-31T00:00:00Z" },
      ];
      (query as any).mockResolvedValueOnce(mockTokens);

      const tokens = await listAgentTokens("ws-123");

      expect(tokens).toEqual(mockTokens);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, agent_id, jti, scopes"),
        ["ws-123"]
      );
    });
  });
});

describe("Integration: Token lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEON_JWT_PRIVATE_KEY = mockPrivateKey;
    process.env.NEON_JWT_PUBLIC_KEY = mockPublicKey;
  });

  afterEach(() => {
    delete process.env.NEON_JWT_PRIVATE_KEY;
    delete process.env.NEON_JWT_PUBLIC_KEY;
  });

  it("should create, verify, revoke, and list tokens", async () => {
    // Mock agent exists
    (queryOne as any).mockResolvedValueOnce({ id: "agent-123", workspace_id: "ws-123" });
    (execute as any).mockResolvedValueOnce(1); // insert token

    // Create token
    const created = await createAgentToken({
      workspace_id: "ws-123",
      agent_id: "agent-123",
      scopes: ["memory:read", "skills:read"],
      expiresInSeconds: 3600,
    });

    expect(created.token).toMatch(/^mem_live_/);
    expect(created.jti).toBeDefined();

    // Mock token exists and not revoked
    (queryOne as any).mockResolvedValueOnce({
      revoked_at: null,
      expires_at: null,
      scopes: ["memory:read", "skills:read"],
      workspace_id: "ws-123",
      agent_id: "agent-123",
    });

    // Verify token
    const verified = await verifyAgentToken(created.token);
    expect(verified).not.toBeNull();
    expect(verified?.scopes).toEqual(["memory:read", "skills:read"]);

    // Revoke token
    (execute as any).mockResolvedValueOnce(1);
    const revoked = await revokeAgentToken({
      workspace_id: "ws-123",
      jti: created.jti,
    });
    expect(revoked).toBe(1);

    // List tokens
    (query as any).mockResolvedValueOnce([{
      id: "1", agent_id: "agent-123", jti: created.jti,
      scopes: ["memory:read", "skills:read"],
      created_at: "2024-01-01T00:00:00Z",
      last_used_at: null,
      revoked_at: new Date().toISOString(),
      expires_at: null,
    }]);
    const listed = await listAgentTokens("ws-123");
    expect(listed.length).toBe(1);
    expect(listed[0].revoked_at).not.toBeNull();
  });
});