# Memorify Remote daemon (`memorify-agentd`)

The background app that runs on **your machine** and lets Memorify (you, or an
agent) take control of it remotely — TeamViewer-style.

## What it does today (Layer 1)

- **Pairing**: shows a 6-character code in the tray; you approve it in the
  Memorify dashboard (`/dashboard/machines`). The machine receives a one-time
  `mem_mac_...` token (held in memory only, never written to disk).
- **Heartbeat**: polls `/api/machine/poll` every few seconds.
- **Command relay**: executes commands an agent sends via the `computer_exec`
  MCP tool, and posts results back.

## Security model

- **Deny-by-default allowlist** (`src/allowlist.ts`) is the *real* gate on what
  runs on your machine. Only read-only inspection + a small set of vetted write
  commands are permitted. The server-side denylist is defense-in-depth only.
- Every command is capped in length (2000 chars) and time (60s).
- The machine token is 384-bit, stored only as a SHA-256 hash on the server.
- Every control session emails you a one-click **kill switch** that revokes the
  token and stops the daemon.

## Run

```bash
cd packages/agentd
npm install
npm run build
npm start
```

Environment overrides:

- `MEMORIFY_HOST` — default `https://memorify.dev`
- `MEMORIFY_MACHINE_NAME` — default `<user>'s <platform>`

## Roadmap

- **Layer 2**: screen streaming (desktopCapturer → WebRTC → dashboard viewer).
- **Layer 3**: input injection (mouse/keyboard over the same channel).
- **MFA**: strong human auth via Clerk (Windows Hello / Microsoft Authenticator).
