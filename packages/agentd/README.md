# Memorify Remote daemon (`memorify-agentd`)

The background app that runs on **your machine** and lets Memorify (you, or an
agent) take control of it remotely — TeamViewer-style.

## What it does today

- **Pairing**: shows a 6-character code in the tray; you approve it in the
  Memorify dashboard (`/dashboard/machines`). The machine receives a one-time
  `mem_mac_...` token (held in memory only, never written to disk).
- **Heartbeat**: polls `/api/machine/poll` every few seconds.
- **Command relay**: executes commands an agent sends via the `computer_exec`
  MCP tool, and posts results back.
- **Remote desktop**: captures the screen and streams it to the dashboard
  viewer over WebRTC; relays mouse/keyboard input (Layer 2/3).

## Security model

- **Deny-by-default allowlist** (`src/allowlist.ts`) is the *real* gate on what
  runs on your machine. Only read-only inspection + a small set of vetted write
  commands are permitted. The server-side denylist is defense-in-depth only.
- Every command is capped in length (2000 chars) and time (60s).
- The machine token is 384-bit, stored only as a SHA-256 hash on the server.
- Every control session emails you a one-click **kill switch** that revokes the
  token and stops the daemon.
- Input injection (`@nut-tree/nut-js`) is lazy-loaded; without the native module
  the app still runs (screen view only, no mouse/keyboard).

## Develop

```bash
cd packages/agentd
npm install
npm run dev        # build + run via Electron
```

Environment overrides:

- `MEMORIFY_HOST` — default `https://memorify.dev`
- `MEMORIFY_MACHINE_NAME` — default `<user>'s <platform>`

## Package + release

```bash
npm run dist:win    # build a Windows NSIS installer → release/
npm run release     # build + publish to GitHub Releases (auto-update)
```

Releases are published to GitHub Releases via the
`.github/workflows/release-agentd.yml` workflow (triggered by a `v*` tag push).
The app auto-updates via `electron-updater` and auto-starts on login.

## Roadmap

- **TURN relay** for machines behind symmetric NAT (currently STUN-only).
- **MFA** (Windows Hello / Microsoft Authenticator) via Clerk.
- **Code signing** to remove Windows SmartScreen warnings.

