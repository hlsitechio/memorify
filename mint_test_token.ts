// mint_test_token.ts — Mint a test agent token for local dev
import { loadEnv } from "./backend/lib/env.ts";
loadEnv("./backend/.env.local");
import { mintAgentToken } from "./backend/lib/agent-token.ts";

const token = await mintAgentToken({
  workspace_id: "test-workspace-001",
  user_id: "test-user-001",
  name: "Hermes Agent",
  kind: "hermes",
});
console.log("AGENT_TOKEN=" + token);