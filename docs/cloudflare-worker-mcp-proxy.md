# Cloudflare Worker — proxy `mcp.memorify.dev` → Supabase

But : exposer le MCP sous `https://mcp.memorify.dev` au lieu de l'URL Supabase publique.

## 1. Créer le Worker

Dashboard Cloudflare → **Workers & Pages** → **Create** → **Create Worker** → nom `memorify-mcp-proxy` → **Deploy**.

Puis **Edit code** et colle :

```js
const UPSTREAM = "https://qkgzetykzzsqgiqzlwsv.supabase.co/functions/v1/memorify-mcp";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrZ3pldHlrenpzcWdpcXpsd3N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDU5MTMsImV4cCI6MjA5MzkyMTkxM30.Oc4f7fEhzKnd_TJSgRjkg8E26l-csIpV52WifwPjgaw";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const target = UPSTREAM + (url.pathname === "/" ? "" : url.pathname) + url.search;

    const headers = new Headers(req.headers);
    // Supabase edge functions require the anon apikey header — inject it
    headers.set("apikey", ANON);
    // Strip Cloudflare's host header so Supabase routes correctly
    headers.delete("host");

    const proxied = await fetch(target, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      redirect: "manual",
    });

    const respHeaders = new Headers(proxied.headers);
    respHeaders.set("Access-Control-Allow-Origin", "*");
    respHeaders.set("Access-Control-Allow-Headers", "authorization, content-type, mcp-protocol-version, accept");
    respHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    return new Response(proxied.body, { status: proxied.status, headers: respHeaders });
  },
};
```

Save & Deploy.

## 2. Mapper le domaine

Worker → **Settings** → **Domains & Routes** → **Add → Custom Domain** → `mcp.memorify.dev`.

Cloudflare crée le DNS + SSL automatiquement (~1 min). `memorify.dev` doit être géré par Cloudflare (nameservers ou zone).

## 3. Tester

```bash
curl https://mcp.memorify.dev -H "Authorization: Bearer <ton-token>"
```

Doit renvoyer `{"name":"synapse-mcp",...}`.

## 4. C'est tout

L'app affiche déjà `https://mcp.memorify.dev` dans l'écran Connect (ChatGPT / Claude / Cursor). Plus aucune URL Supabase visible côté users.
