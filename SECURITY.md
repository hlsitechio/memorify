# Security & source protection

Memorify is **proprietary** software (see `LICENSE`).

## Repository

- GitHub repository is **private**.
- Only the `main` branch is used.
- Do not make the repository public without a deliberate product decision.

## What must never be committed

- `.env`, `.env.*`, `backend/.env.local`
- Database connection strings
- Clerk secret keys
- `MEMORIFY_AGENT_TOKEN_SECRET`
- Agent tokens (`mem_live_…`)
- Private keys / PEM files

## Deploy surface

- Production build **does not emit source maps**.
- Netlify blocks `*.map` with HTTP 404.
- Deploy previews and branch deploys are **disabled** in `netlify.toml`.
- Backend secrets are injected via Netlify environment variables only.

## Public CDN reality

Minified JavaScript for the SPA is necessarily downloadable by browsers.
That is **not** the TypeScript source tree. Do not enable source maps in production.

## Reporting

Security issues: memorify-ops@agentmail.to
