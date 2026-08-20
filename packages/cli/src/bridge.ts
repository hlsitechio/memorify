// src/bridge.ts — stdio ⇄ streamable-http MCP bridge.
// Lets stdio-only MCP clients (Claude Desktop, etc.) talk to memorify.dev/mcp.
//
// Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio transport),
// forwarded as HTTP POSTs to the streamable-http endpoint.

import { createInterface } from "node:readline";

export function runBridge(mcpUrl: string, token: string): void {
  const rl = createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: any;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      sendToClient({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }

    // Forward every message to the HTTP endpoint. Responses (and server
    // notifications) come back as SSE/HTTP body; we surface request responses.
    fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: trimmed,
    })
      .then(async (res) => {
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("text/event-stream")) {
          // Consume SSE stream; write each `data:` JSON message to stdout.
          const reader = res.body?.getReader();
          if (!reader) return;
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const evt of events) {
              for (const l of evt.split("\n")) {
                if (l.startsWith("data:")) {
                  const payload = l.slice(5).trim();
                  if (payload && payload !== "[DONE]") {
                    try {
                      sendToClient(JSON.parse(payload));
                    } catch {
                      /* ignore malformed SSE payloads */
                    }
                  }
                }
              }
            }
          }
          return;
        }
        const text = await res.text();
        if (!text) {
          // 202 Accepted with no body — standard for notifications. If this was
          // a request (has id) but server gave nothing, synthesize an error.
          if (msg.id !== undefined && msg.id !== null) {
            sendToClient({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `upstream ${res.status} (empty body)` } });
          }
          return;
        }
        try {
          sendToClient(JSON.parse(text));
        } catch {
          if (msg.id !== undefined && msg.id !== null) {
            sendToClient({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: `upstream ${res.status}: ${text.slice(0, 200)}` } });
          }
        }
      })
      .catch((e: any) => {
        if (msg.id !== undefined && msg.id !== null) {
          sendToClient({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `bridge network error: ${e.message}` } });
        } else {
          process.stderr.write(`[memorify] ${e.message}\n`);
        }
      });
  });

  rl.on("close", () => process.exit(0));
}

function sendToClient(msg: any): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
