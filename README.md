<div align="center">

# Memorify

### The AI Agent Motherboard & Unified MCP Gateway

**One gateway. One connection. Every agent. Every tool.**

[![Status](https://img.shields.io/badge/Gateway-Online-00E599?style=flat-square&logo=statuspage&logoColor=white)](https://memorify.dev)
[![Protocol](https://img.shields.io/badge/MCP-2024--11--05-79E3C1?style=flat-square)](https://modelcontextprotocol.io)
[![JSON-RPC](https://img.shields.io/badge/JSON--RPC-2.0-blue?style=flat-square)](https://memorify.dev/mcp)
[![Security](https://img.shields.io/badge/Vault-AES--256--GCM-blueviolet?style=flat-square)](https://memorify.dev)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=flat-square)](LICENSE)

---

[Website](https://memorify.dev) • [Auth Portal](https://memorify.dev/auth) • [Control Plane](https://memorify.dev/dashboard) • [MCP Endpoint](https://memorify.dev/mcp) • [Pricing](https://memorify.dev/#pricing)

</div>

---

## ⚡ Overview

**Memorify** is the unified control plane and persistent memory gateway for autonomous AI agents. It connects modern AI developer tools—including **Claude Code**, **Cursor**, **OpenAI**, **Microsoft Copilot**, **Codex**, and **Hermes**—into a single secure, synchronized ecosystem.

Instead of fragmenting context across disconnected chats and CLI sessions, Memorify ensures that **the next agent session always inherits the context the last one earned.**

```
                               ┌───────────────────────────┐
                               │  Connected AI Agents      │
                               │  Claude • Cursor • Codex  │
                               │  Copilot • Hermes • CLI   │
                               └─────────────┬─────────────┘
                                             │
                                   [ JSON-RPC 2.0 / MCP ]
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   MEMORIFY MCP GATEWAY    │
                               │   https://memorify.dev/mcp│
                               └─────────────┬─────────────┘
                                             │
                 ┌───────────────────────────┼───────────────────────────┐
                 ▼                           ▼                           ▼
    ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
    │  Cross-Session Memory   │ │   Zero-Leak Vault       │ │   Unified Tool Engine   │
    │  • Vector Similarity    │ │   • AES-256-GCM Storage │ │   • Dynamic Connectors  │
    │  • Episodic Recall      │ │   • Scoped mem_live_ Keys│ │   • Document Indexing   │
    │  • Cross-Agent Sync     │ │   • Server-Side Exec    │ │   • 23+ Live MCP Tools  │
    └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

---

## 🛡️ Zero-Leak Security Architecture

Memorify is engineered from the ground up for strict confidentiality and multi-tenant isolation:

* **Zero-Leak Secret Vault**: Third-party API keys (GitHub, Netlify, Stripe, Resend, Cloudflare) are encrypted at rest using AES-256-GCM. AI agents invoke actions through the gateway without ever receiving or inspecting raw secrets.
* **Granular Scoped Tokens**: Access tokens (`mem_live_...`) utilize strict cryptographic scoping (`memory:read`, `memory:write`, `skills:read`, `documents:read`, `tokens:admin`).
* **Hardware-Secured Isolation**: Each workspace operates in an isolated tenant schema within Neon Postgres with strict Row-Level Security (RLS).
* **Zero Browser State Dependency**: Authentication state is derived purely server-side from cryptographically signed session claims.

---

## 🛠️ Supported Agent Integrations

Connect any Model Context Protocol compliant client in seconds:

### 1. Claude Code / Claude Desktop
Add to your `claude_desktop_config.json` (or CLI settings):

```json
{
  "mcpServers": {
    "memorify": {
      "url": "https://memorify.dev/mcp",
      "headers": {
        "Authorization": "Bearer mem_live_YOUR_SCOPED_TOKEN"
      }
    }
  }
}
```

### 2. Cursor IDE
Add to your project's `.cursor/mcp.json` or Global Cursor Settings:

```json
{
  "mcpServers": {
    "memorify": {
      "url": "https://memorify.dev/mcp",
      "headers": {
        "Authorization": "Bearer mem_live_YOUR_SCOPED_TOKEN"
      }
    }
  }
}
```

### 3. Open-Source AI Agents / Custom LLMs
Invoke via standard JSON-RPC 2.0 over HTTPS:

```bash
curl -X POST https://memorify.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mem_live_YOUR_SCOPED_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "memorify_search_memory",
      "arguments": {
        "query": "deployment pipeline architecture",
        "limit": 5
      }
    }
  }'
```

---

## 💎 Core Capabilities

| Feature | Description |
| :--- | :--- |
| **Persistent Episodic Memory** | Store and query learnings, user preferences, and project state with sub-millisecond semantic search. |
| **Cross-Agent Synchronization** | A decision recorded by Claude in the terminal is instantly retrievable by Cursor in the IDE. |
| **Dynamic Connectors** | Connect databases, SaaS platforms, webhooks, and third-party APIs through managed gateway relays. |
| **Document Indexing & RAG** | Ingest architectural specs, runbooks, and design systems with automated chunking and embeddings. |
| **Live Health & Telemetry** | Real-time gateway latency tracking and tool availability monitoring via `/api/health`. |

---

## 📦 Transparent Memory Capacity (No Recurring Subscriptions)

Memorify operates on a **transparent, one-time capacity model** with zero recurring monthly lock-in:

* **Starter Pack ($1.99)**: 500 Persistent Memory Credits (~0.4¢ / memory)
* **Popular Pack ($4.99)**: 2,500 Persistent Memory Credits (~0.2¢ / memory)
* **Value Pack ($9.99)**: 10,000 Persistent Memory Credits (~0.1¢ / memory)

All packs include unlimited tool calls, AES-256 Vault storage, and multi-agent synchronization.

---

## 🔒 Proprietary License & Confidentiality

**Copyright © 2026 Memorify. All rights reserved.**

This repository and its contents constitute **proprietary and confidential software**. 

* **No Open Source License**: Unauthorized copying, modification, distribution, sublicensing, decompilation, or commercial deployment of this software, via any medium, is strictly prohibited without explicit written permission from the copyright holders.
* **Security Inquiries**: For security disclosures or enterprise inquiries, contact our operations team at `memorify-ops@agentmail.to`.

---

<div align="center">
  <sub>Built for the next generation of autonomous AI agents.</sub>
</div>
