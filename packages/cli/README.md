# memorify CLI

Universal MCP onboarding for [Memorify](https://memorify.dev) — pair **any** AI coding client in one command.

## Quick start

```bash
npx memorify pair
```

That's it. The CLI:

1. Detects which MCP clients you use (Claude Code, Cline, Roo Code, Cursor, Windsurf, VS Code Copilot, Claude Desktop, Gemini CLI, Continue, Codex CLI, opencode)
2. Runs the device-flow pairing — shows a 6-character code, opens `memorify.dev/pair`
3. A human approves and picks the workspace
4. Writes the correct config for **every** detected client (merge-safe — existing servers are preserved)

## Commands

| Command | Purpose |
|---|---|
| `memorify pair` | Full pairing flow + auto-config for detected clients |
| `memorify pair --client cursor,vscode` | Configure specific clients only |
| `memorify pair --print` | Print token to stdout (for scripts/piping) |
| `memorify mcp` | **stdio⇄HTTP bridge** — lets stdio-only clients (Claude Desktop) talk to memorify.dev/mcp |
| `memorify whoami` | Verify your token against the live server |
| `memorify clients` | List supported clients |

## How universality works

- **Native HTTP clients** get a streamable-http server entry with a Bearer header.
- **stdio-only clients** (Claude Desktop) get `npx -y memorify@latest mcp` as their server command — this package doubles as the bridge.
- Tokens are also saved to `~/.memorify/credentials.json` (0600) so `memorify mcp` works without config.

## Security

- No credentials ever handled by the agent — human approves every pairing at memorify.dev/pair
- Tokens are workspace-scoped, Ed25519-signed, revocable from the dashboard
- Config writes are merge-safe and idempotent (re-running replaces the memorify entry only)
