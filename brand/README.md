# Memorify brand pack

Generated 2026-08-08 for ads / landing / social.

## Brand system

| Token | Value |
|---|---|
| Tagline | The motherboard for AI agents |
| Promise | One backend every agent plugs into |
| Background | `#05070B` near-black |
| Accent | `#2EE6C8` → `#5CF0D8` cyan/teal |
| Text | `#EEFAF7` / muted `#9BB5B0` |
| Fonts | Inter (UI) · JetBrains Mono (labels) |
| Protocols | MCP · HTTP · WS |
| Protocol shape | `{ agent, action, input }` |

## Product layers (source of truth)

1. **Agents** — Claude Code · Cursor · ChatGPT · Custom  
2. **Gateway (hero)** — Memorify Gateway · MCP/HTTP/WS · `mem_live_` tokens  
3. **Services** — `/memory` `/files` `/tools` `/connectors` `/vector` `/automation`  
4. **Primitives** — Native memory · Universal connectors · Real-time context bus · Observability  
5. **Foundation** — Deno Edge · Neon Postgres · Clerk · HMAC agent JWT · Netlify · MCP JSON-RPC  

## Files

### Logo (`brand/logo/`)

| File | Use |
|---|---|
| `logo-icon.svg` / `logo-icon.png` | App icon, favicon base, avatar |
| `logo-wordmark.svg` / `logo-wordmark-clean.png` | Horizontal lockup for headers |
| `logo-mark-a-circuit-m.png` | FLUX concept A — circuit **M** (strong candidate) |
| `logo-mark-b-memory-core.png` | FLUX concept B — crystal shield (secondary / security vibe) |
| `logo-wordmark.png` | FLUX wordmark experiment |

**Recommended primary mark:** clean SVG icon + wordmark (`logo-icon` / `logo-wordmark`).  
**Recommended artistic mark:** `logo-mark-a-circuit-m.png` (circuit M with “Memorify”).

### Layers (`brand/layers/`)

| File | Use |
|---|---|
| `memorify-layers.html` | Editable source |
| `memorify-layers.png` | **Canonical layers explainer** (readable text) |
| `layers-flux-a.png` / `layers-flux-b.png` | Atmospheric FLUX variants (text may be imperfect) |

### Ads (`brand/ads/`)

| File | Format | Angle |
|---|---|---|
| `ad-hero-motherboard.html/.png` | 1600×900 landscape | Brand hero — motherboard tagline |
| `ad-square-problem.html/.png` | 1080×1080 | Problem → one gateway |
| `ad-story-layers.html/.png` | 1080×1920 | Vertical story — all layers |

HTML sources are editable; re-export with Chrome headless:

```bash
python - <<'PY'
from pathlib import Path
import subprocess
chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
html = Path(r"G:\memorify-backend\brand\layers\memorify-layers.html")
png = html.with_suffix('.png')
subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--window-size=1600,1150", f"--screenshot={png}", html.as_uri()], check=True)
print(png)
PY
```

## Next ad angles (ready to generate)

1. Protocol close-up — `remember` / `recall` request-response  
2. Agent mosaic — Claude + Cursor + ChatGPT sharing one memory row  
3. “The memory layer for agent-native apps…” primitives grid  
4. Waitlist CTA with logo + single line benefit  

## Notes

- Site still uses Lucide `Cpu` in a gradient square as nav mark — swap to `logo-icon.svg` when ready.  
- Domain in creatives: `memorify.dev`  
- Keep copy English for product marketing (product UI is EN).
