import { query } from "../../backend/lib/db.ts";

export default async () => {
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS mcp_sse_sessions (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`
    );

    await query(
      `CREATE TABLE IF NOT EXISTS mcp_sse_messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) REFERENCES mcp_sse_sessions(id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Create an index to speed up polling
    await query(
      `CREATE INDEX IF NOT EXISTS idx_mcp_sse_messages_session ON mcp_sse_messages(session_id, created_at)`
    );

    return new Response(JSON.stringify({ success: true, message: "SSE tables created" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
