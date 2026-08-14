import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, RefreshCcw, Trash2, Server, Wrench, Plug2, Play, Sparkles, ChevronDown, Copy, Check, KeyRound, Zap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { getMcpUrl } from "@/lib/mcp-url";

type McpServer = {
  id: string;
  name: string;
  url: string;
  transport: string;
  auth_type?: string;
  enabled: boolean;
  last_handshake_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at?: string;
};

type McpTool = {
  id: string;
  mcp_server_id: string;
  name: string;
  description: string | null;
  input_schema: any;
  enabled: boolean;
};

type Preset = {
  id: string;
  name: string;
  url: string;
  transport: "http" | "sse";
  needsToken: boolean;
  tokenLabel: string;
  tokenHint: string;
  docsUrl: string;
  oauth?: boolean;
  /** If set, the token is sent as a custom header rather than Authorization: Bearer */
  authHeader?: string;
  tokenPlaceholder?: string;
  allowUrlOverride?: boolean;
  urlHint?: string;
};

type CopilotActionResponse<T = unknown> = {
  ok?: boolean;
  data?: T;
  error?: string;
  detail?: string;
};

const PRESETS: Preset[] = [
  {
    id: "methora",
    name: "Methora",
    url: "https://memorify.dev/api/v1",
    transport: "http",
    needsToken: true,
    tokenLabel: "Methora personal access token",
    tokenHint:
      "The skills studio. Generate a PAT at memorify.dev → Settings → API Keys (Pro/Team). Adds skills_create, skills_list, skills_get, skills_run, skills_publish to every connected agent.",
    docsUrl: "https://memorify.dev",
    tokenPlaceholder: "lit_pat_…",
  },
  {
    id: "deepwiki",
    name: "DeepWiki",
    url: "https://mcp.deepwiki.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "Public MCP — ask questions about any GitHub repo's docs.",
    docsUrl: "https://docs.devin.ai/work-with-devin/deepwiki-mcp",
  },
  {
    id: "githubmcp",
    name: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    transport: "http",
    needsToken: true,
    tokenLabel: "GitHub personal access token",
    tokenHint: "Create a fine-grained PAT at github.com → Settings → Developer settings → Personal access tokens.",
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  {
    id: "linearmcp",
    name: "Linear",
    url: "https://mcp.linear.app/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "One-click OAuth — sign in with your Linear account.",
    docsUrl: "https://linear.app/docs/mcp",
    oauth: true,
  },
  {
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "One-click OAuth — sign in with your Notion workspace.",
    docsUrl: "https://developers.notion.com/docs/mcp",
    oauth: true,
  },
  {
    id: "sentry",
    name: "Sentry",
    url: "https://mcp.sentry.dev/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — connect your Sentry org to query issues, errors and traces.",
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
    oauth: true,
  },
  {
    id: "atlassian",
    name: "Atlassian",
    url: "https://mcp.atlassian.com/v1/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — Jira + Confluence in one connection.",
    docsUrl: "https://support.atlassian.com/rovo/docs/setting-up-ides-mcp-and-custom-clients/",
    oauth: true,
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    url: "https://docs.mcp.cloudflare.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "Public MCP — search the entire Cloudflare developer documentation.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
  },
  {
    id: "context7",
    name: "Context7",
    url: "https://mcp.context7.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "Public MCP — pulls up-to-date docs and code for any library by Upstash.",
    docsUrl: "https://github.com/upstash/context7",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    url: "https://huggingface.co/mcp",
    transport: "http",
    needsToken: true,
    tokenLabel: "Hugging Face access token",
    tokenHint: "Create a token at huggingface.co → Settings → Access Tokens (read scope is enough).",
    docsUrl: "https://huggingface.co/settings/mcp",
    tokenPlaceholder: "hf_…",
  },
  {
    id: "stripe",
    name: "Stripe",
    url: "https://mcp.stripe.com",
    transport: "http",
    needsToken: true,
    tokenLabel: "Stripe restricted API key",
    tokenHint: "Use a restricted key (rk_…) — never your secret key. Dashboard → Developers → API keys.",
    docsUrl: "https://docs.stripe.com/mcp",
    tokenPlaceholder: "rk_live_… or rk_test_…",
  },
  {
    id: "paypal",
    name: "PayPal",
    url: "https://mcp.paypal.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — connect a PayPal merchant account.",
    docsUrl: "https://developer.paypal.com/community/blog/paypal-mcp-server/",
    oauth: true,
  },
  {
    id: "intercom",
    name: "Intercom",
    url: "https://mcp.intercom.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — read conversations, contacts, articles.",
    docsUrl: "https://developers.intercom.com/docs/guides/mcp",
    oauth: true,
  },
  {
    id: "asana",
    name: "Asana",
    url: "https://mcp.asana.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — manage tasks and projects in your Asana workspace.",
    docsUrl: "https://developers.asana.com/docs/using-asanas-model-control-protocol-mcp-server",
    oauth: true,
  },
  {
    id: "zapier",
    name: "Zapier",
    url: "https://mcp.zapier.com/api/v1/connect",
    transport: "http",
    needsToken: true,
    tokenLabel: "Zapier connection token or embed secret",
    tokenHint: "Use a connection token with the default URL, or use an embed secret with the user-specific server URL above. A full https://mcp.zapier.com/api/v1/connect?token=... URL also works.",
    docsUrl: "https://docs.zapier.com/mcp/get-started/authentication",
    tokenPlaceholder: "https://mcp.zapier.com/api/v1/connect?token=... or secret",
    allowUrlOverride: true,
    urlHint: "For a connection token, keep this URL. For Zapier Embed, paste the mcp-server-url emitted by the embed here.",
  },
  {
    id: "vercel",
    name: "Vercel",
    url: "https://mcp.vercel.com",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — manage deployments, projects and logs.",
    docsUrl: "https://vercel.com/docs/mcp",
    oauth: true,
  },
  {
    id: "cloudflare-bindings",
    name: "Cloudflare Workers",
    url: "https://bindings.mcp.cloudflare.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — manage Workers, KV, R2, D1, Durable Objects.",
    docsUrl: "https://developers.cloudflare.com/agents/model-context-protocol/",
    oauth: true,
  },
  {
    id: "shopify",
    name: "Shopify",
    url: "https://mcp.shopify.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — connect your Shopify store to read products, orders and customers.",
    docsUrl: "https://shopify.dev/docs/apps/build/storefront-mcp",
    oauth: true,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    url: "https://mcp.hubspot.com/anthropic",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — CRM contacts, deals, companies and tickets.",
    docsUrl: "https://developers.hubspot.com/mcp",
    oauth: true,
  },
  {
    id: "canva",
    name: "Canva",
    url: "https://mcp.canva.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — create and edit Canva designs from your agent.",
    docsUrl: "https://www.canva.dev/docs/connect/canva-mcp-server-api/",
    oauth: true,
  },
  {
    id: "posthog",
    name: "PostHog",
    url: "https://mcp.posthog.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — query product analytics, feature flags and experiments.",
    docsUrl: "https://posthog.com/docs/model-context-protocol",
    oauth: true,
  },
  {
    id: "plaid",
    name: "Plaid",
    url: "https://api.dashboard.plaid.com/mcp/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — financial data, bank accounts and transactions in your Plaid dashboard.",
    docsUrl: "https://plaid.com/docs/mcp/",
    oauth: true,
  },
  {
    id: "square",
    name: "Square",
    url: "https://mcp.squareup.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — payments, catalog, customers and orders for your Square business.",
    docsUrl: "https://developer.squareup.com/docs/mcp",
    oauth: true,
  },
  {
    id: "wix",
    name: "Wix",
    url: "https://mcp.wix.com/mcp",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — manage Wix sites, content and bookings.",
    docsUrl: "https://dev.wix.com/docs/mcp-server",
    oauth: true,
  },
  {
    id: "webflow",
    name: "Webflow",
    url: "https://mcp.webflow.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — sites, collections and CMS items in your Webflow workspace.",
    docsUrl: "https://developers.webflow.com/data/docs/ai-tools",
    oauth: true,
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    url: "https://mcp.elevenlabs.io/mcp",
    transport: "http",
    needsToken: true,
    tokenLabel: "ElevenLabs API key",
    tokenHint: "Create at elevenlabs.io → Profile → API Keys. Powers TTS, voice cloning and dubbing.",
    docsUrl: "https://elevenlabs.io/docs/conversational-ai/customization/mcp",
    tokenPlaceholder: "sk_…",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    url: "https://asset-management.mcp.cloudinary.com/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — upload, search and transform media assets.",
    docsUrl: "https://cloudinary.com/documentation/cloudinary_mcp_server",
    oauth: true,
  },
  {
    id: "box",
    name: "Box",
    url: "https://mcp.box.com/",
    transport: "http",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "OAuth — search files, read content and manage folders in Box.",
    docsUrl: "https://developer.box.com/guides/box-mcp/remote/",
    oauth: true,
  },
  {
    id: "globalping",
    name: "Globalping",
    url: "https://mcp.globalping.dev/sse",
    transport: "sse",
    needsToken: false,
    tokenLabel: "",
    tokenHint: "Public MCP — run ping, traceroute, DNS and HTTP tests from 500+ locations worldwide.",
    docsUrl: "https://globalping.io/docs/mcp",
  },
];

export default function Mcp() {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const workspaceId = organization?.id ?? "";
  const [servers, setServers] = useState<McpServer[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", transport: "http", bearer: "" });

  // Preset dialog
  const [presetOpen, setPresetOpen] = useState<Preset | null>(null);
  const [presetToken, setPresetToken] = useState("");
  const [presetUrl, setPresetUrl] = useState("");

  // Test-tool dialog
  const [testTool, setTestTool] = useState<{ server: McpServer; tool: McpTool } | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testOutput, setTestOutput] = useState<string>("");
  const [testRunning, setTestRunning] = useState(false);

  // Memorify-as-MCP connect card (same-origin /mcp on Netlify — not Deno Deploy)
  const MCP_URL = getMcpUrl();
  const [connectOpen, setConnectOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("ChatGPT");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const connectedUrls = useMemo(() => new Set(servers.map((s) => s.url)), [servers]);

  const providerGroups = useMemo(() => {
    const available = PRESETS.filter((p) => !connectedUrls.has(p.url));
    return {
      public: available.filter((p) => !p.needsToken && !p.oauth),
      token: available.filter((p) => p.needsToken && !p.oauth),
      oauth: available.filter((p) => p.oauth),
    };
  }, [connectedUrls]);

  const apiError = (data: any, fallback: string) =>
    data?.detail || data?.error || data?.data?.detail || data?.data?.error || fallback;

  const presetBadge = (p: Preset) => p.oauth ? "oauth" : p.needsToken ? "token ready" : "public ready";
  const presetButton = (p: Preset) => p.oauth ? "Connect" : p.needsToken ? "Add token" : "Add public";

  const runAction = useCallback(async <T,>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
    if (!workspaceId) throw new Error("Select or create a workspace first");
    const token = await getToken();
    if (!token) throw new Error("No Clerk session token");
    const res = await fetch("/api/copilot/action", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Workspace-Id": workspaceId,
      },
      body: JSON.stringify({ name, args, workspace_id: workspaceId }),
    });
    const body = (await res.json().catch(() => ({}))) as CopilotActionResponse<T>;
    if (!res.ok || body.ok === false) {
      throw new Error(apiError(body, `HTTP ${res.status}`));
    }
    return (body.data ?? body) as T;
  }, [getToken, workspaceId]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1500);
  };

  const generateMcpToken = async () => {
    if (!user || !workspaceId) {
      toast.error("Select or create a workspace first");
      return;
    }
    setGenerating(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No Clerk session token");
      const res = await fetch("/api/bootstrap-agent", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          agent_name: keyName || "MCP client",
          access_level: "full",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.token) {
        throw new Error(apiError(data, `HTTP ${res.status}`));
      }
      setGeneratedToken(data.token);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const load = useCallback(async () => {
    if (!user || !workspaceId) {
      setServers([]);
      setTools([]);
      return;
    }
    try {
      const [serverRows, toolRows] = await Promise.all([
        runAction<McpServer[]>("mcp.servers.list"),
        runAction<McpTool[]>("mcp.tools.list"),
      ]);
      setServers(serverRows ?? []);
      setTools(toolRows ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load MCP servers");
    }
  }, [runAction, user, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (presetOpen) setPresetUrl(presetOpen.url);
  }, [presetOpen?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mcp");
    if (!status) return;
    if (status === "connected") {
      const toolsCount = params.get("tools");
      toast.success(toolsCount ? `MCP connected — ${toolsCount} tools synced` : "MCP connected");
      void load();
    } else if (status === "error") {
      toast.error(params.get("detail") || "MCP OAuth failed");
    }
    params.delete("mcp");
    params.delete("detail");
    params.delete("provider");
    params.delete("server_id");
    params.delete("tools");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }, [load]);

  const createServer = async (payload: { name: string; url: string; transport: string; auth: any }) => {
    if (!user) return null;
    try {
      const data = await runAction<any>("mcp.servers.add", { ...payload, sync: false });
      const id = data?.id as string | undefined;
      if (!id) return null;
      return {
        id,
        name: payload.name,
        url: payload.url,
        transport: payload.transport,
        enabled: true,
        last_handshake_at: null,
        last_error: data?.sync?.error ?? null,
        created_at: new Date().toISOString(),
      } as McpServer;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add server");
      return null;
    }
  };

  const create = async () => {
    if (!form.name || !form.url) return toast.error("Name and URL required");
    const srv = await createServer({
      name: form.name, url: form.url, transport: form.transport,
      auth: form.bearer ? { bearer: form.bearer } : {},
    });
    if (!srv) return;
    toast.success("Server added");
    setOpen(false);
    setForm({ name: "", url: "", transport: "http", bearer: "" });
    await load();
    void handshake(srv.id);
  };

  const startOAuth = async (p: Preset) => {
    try {
      const data = await runAction<any>("mcp.oauth.start", {
        provider: p.id,
        server_url: p.url,
        server_name: p.name,
        transport: p.transport,
        redirect_uri: `${window.location.origin}/api/mcp/oauth/callback`,
      });
      if (data?.authorize_url) {
        window.location.href = data.authorize_url;
        setPresetOpen(null);
        return;
      }
      toast.error(data?.detail ?? data?.error ?? "OAuth setup is not configured yet");
    } catch (e: any) {
      toast.error(e?.message ?? "OAuth setup is not configured yet");
    }
  };

  const addPreset = async (p: Preset) => {
    if (p.oauth) return startOAuth(p);
    if (p.needsToken && !presetToken) return toast.error(`${p.tokenLabel} required`);
    const auth: any = {};
    let serverUrl = p.allowUrlOverride ? (presetUrl.trim() || p.url) : p.url;
    if (presetToken) {
      if (p.id === "zapier" && /^https?:\/\//i.test(presetToken.trim())) {
        serverUrl = presetToken.trim();
      } else if (p.authHeader) auth.headers = { [p.authHeader]: presetToken };
      else auth.bearer = presetToken;
    }
    const srv = await createServer({
      name: p.name, url: serverUrl, transport: p.transport, auth,
    });
    if (!srv) return;
    toast.success(`${p.name} added`);
    setPresetOpen(null);
    setPresetToken("");
    setPresetUrl("");
    await load();
    void handshake(srv.id);
  };

  const handshake = async (id: string) => {
    setBusy(id);
    try {
      const data = await runAction<any>("mcp.sync", { server_id: id });
      toast.success(`Discovered ${data?.tools ?? 0} tools`);
    } catch (e: any) {
      toast.error(e?.message ?? e?.context?.error ?? "handshake failed");
    } finally {
      setBusy(null);
      void load();
    }
  };

  const del = async (id: string) => {
    try {
      await runAction("mcp.servers.delete", { id });
      toast.success("Server removed");
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove server");
    }
  };

  const toggleServer = async (s: McpServer) => {
    try {
      await runAction("mcp.servers.toggle", { id: s.id, enabled: !s.enabled });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update server");
    }
  };

  const toggleTool = async (t: McpTool) => {
    try {
      await runAction("mcp.tools.toggle", { id: t.id, enabled: !t.enabled });
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update tool");
    }
  };

  const addAsPlugin = async (s: McpServer, t: McpTool) => {
    if (!user) return;
    try {
      await runAction("plugins.add", {
        name: `${s.name}: ${t.name}`,
        kind: "mcp_tool",
        ref_id: t.id,
        config: { server_id: s.id, tool_name: t.name },
        enabled: true,
      });
      toast.success("Added to plugins");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add plugin");
    }
  };

  const openTest = (server: McpServer, tool: McpTool) => {
    setTestTool({ server, tool });
    // Pre-fill with an empty object skeleton from input_schema if possible
    try {
      const props = tool.input_schema?.properties ?? {};
      const skeleton: any = {};
      const required = Array.isArray(tool.input_schema?.required) ? tool.input_schema.required : [];
      for (const k of required) skeleton[k] = props[k]?.type === "number" ? 0 : "";
      setTestArgs(JSON.stringify(skeleton, null, 2));
    } catch { setTestArgs("{}"); }
    setTestOutput("");
  };

  const runTest = async () => {
    if (!testTool) return;
    let args: any = {};
    try { args = testArgs.trim() ? JSON.parse(testArgs) : {}; }
    catch (e: any) { return toast.error("Arguments must be valid JSON"); }
    setTestRunning(true);
    setTestOutput("");
    try {
      const data = await runAction<any>("mcp.call", {
        server_id: testTool.server.id,
        tool: testTool.tool.name,
        arguments: args,
      });
      setTestOutput(JSON.stringify(data?.result ?? data, null, 2));
    } catch (e: any) {
      setTestOutput(`Error: ${e.message ?? e}`);
    } finally {
      setTestRunning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="MCP servers"
        description="Model Context Protocol — bring your own tools via remote servers"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Add server</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add MCP server</DialogTitle></DialogHeader>

                {/* Quick presets */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quick connect</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <Button key={p.id} variant="outline" size="sm" onClick={() => { setOpen(false); setPresetOpen(p); }}>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" /> {p.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="my-2 h-px bg-border" />

                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My MCP" /></div>
                  <div className="space-y-1.5"><Label>URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/mcp" /></div>
                  <div className="space-y-1.5">
                    <Label>Transport</Label>
                    <Select value={form.transport} onValueChange={(v) => setForm({ ...form, transport: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">Streamable HTTP</SelectItem>
                        <SelectItem value="sse">SSE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Bearer token (optional)</Label><Input value={form.bearer} onChange={(e) => setForm({ ...form, bearer: e.target.value })} type="password" /></div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={create}>Add</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {/* Preset dialog */}
      <Dialog open={!!presetOpen} onOpenChange={(v) => { if (!v) { setPresetOpen(null); setPresetToken(""); setPresetUrl(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {presetOpen?.name}</DialogTitle>
            <DialogDescription>
              {presetOpen?.tokenHint}
              {presetOpen?.docsUrl && (
                <> · <a className="underline" href={presetOpen.docsUrl} target="_blank" rel="noreferrer">Docs</a></>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{presetOpen?.allowUrlOverride ? "Server URL" : "URL"}</Label>
              <Input
                value={presetOpen?.allowUrlOverride ? presetUrl : (presetOpen?.url ?? "")}
                onChange={(e) => setPresetUrl(e.target.value)}
                readOnly={!presetOpen?.allowUrlOverride}
                className="font-mono text-xs"
              />
              {presetOpen?.urlHint && (
                <p className="text-[11px] text-muted-foreground">{presetOpen.urlHint}</p>
              )}
            </div>
            {presetOpen?.needsToken && (
              <div className="space-y-1.5">
                <Label>{presetOpen.tokenLabel}</Label>
                <Input
                  type="password"
                  value={presetToken}
                  onChange={(e) => setPresetToken(e.target.value)}
                  placeholder={presetOpen.tokenPlaceholder ?? "token…"}
                  autoComplete="new-password"
                />
              </div>
            )}
            {presetOpen?.oauth && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
                OAuth opens the provider consent screen. After approval, Memorify stores the access token encrypted,
                adds the MCP server, and syncs its tools into this page.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPresetOpen(null); setPresetToken(""); setPresetUrl(""); }}>Cancel</Button>
            <Button onClick={() => presetOpen && addPreset(presetOpen)}>
              {presetOpen ? presetButton(presetOpen) : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test-tool dialog */}
      <Dialog open={!!testTool} onOpenChange={(v) => { if (!v) { setTestTool(null); setTestOutput(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{testTool?.tool.name}</DialogTitle>
            {testTool?.tool.description && (
              <DialogDescription>{testTool.tool.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Arguments (JSON)</Label>
              <Textarea value={testArgs} onChange={(e) => setTestArgs(e.target.value)} className="font-mono text-xs min-h-[120px]" />
              {testTool?.tool.input_schema?.properties && (
                <p className="text-[10px] text-muted-foreground">
                  Schema: {Object.keys(testTool.tool.input_schema.properties).join(", ") || "—"}
                </p>
              )}
            </div>
            {testOutput && (
              <div className="space-y-1.5">
                <Label className="text-xs">Result</Label>
                <pre className="text-[11px] font-mono bg-muted/40 border border-border rounded p-3 max-h-[300px] overflow-auto">{testOutput}</pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTestTool(null)}>Close</Button>
            <Button onClick={runTest} disabled={testRunning}>
              <Play className={cn("h-3.5 w-3.5 mr-1.5", testRunning && "animate-pulse")} /> {testRunning ? "Running…" : "Run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect Memorify dialog */}
      <Dialog open={connectOpen} onOpenChange={(v) => { setConnectOpen(v); if (!v) { setGeneratedToken(null); setKeyName("ChatGPT"); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Connect Memorify to your AI</DialogTitle>
            <DialogDescription>
              Plug Memorify into ChatGPT, Claude, Cursor or any MCP-compatible client. Just an URL + a bearer token — like any custom MCP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Server URL</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-xs">
                <span className="flex-1 truncate">{MCP_URL}</span>
                <button onClick={() => copy(MCP_URL, "url")} className="text-muted-foreground hover:text-foreground">
                  {copied === "url" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Bearer token</Label>
              {!generatedToken ? (
                <div className="flex items-center gap-2">
                  <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="ChatGPT" className="flex-1" />
                  <Button onClick={generateMcpToken} disabled={generating}>
                    <KeyRound className="h-3.5 w-3.5 mr-1.5" /> {generating ? "Generating…" : "Generate token"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 font-mono text-xs">
                    <span className="flex-1 truncate">{generatedToken}</span>
                    <button onClick={() => copy(generatedToken, "token")} className="text-muted-foreground hover:text-foreground">
                      {copied === "token" ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Shown only once — copy it now. Revoke it anytime in API Keys.</p>
                </>
              )}
            </div>

            {generatedToken && (
              <Tabs defaultValue="chatgpt">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Paste into</Label>
                <TabsList className="mt-1.5">
                  <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                  <TabsTrigger value="claude">Claude</TabsTrigger>
                  <TabsTrigger value="cursor">Cursor</TabsTrigger>
                </TabsList>
                <TabsContent value="chatgpt" className="space-y-2">
                  <p className="text-xs text-muted-foreground">Settings → Connectors → Add custom MCP server.</p>
                  <pre className="text-[11px] font-mono bg-muted/40 border border-border rounded p-3 overflow-auto">{`Name:   Memorify
URL:    ${MCP_URL}
Auth:   Bearer ${generatedToken}`}</pre>
                </TabsContent>
                <TabsContent value="claude" className="space-y-2">
                  <p className="text-xs text-muted-foreground">Settings → Connectors → Add custom connector.</p>
                  <pre className="text-[11px] font-mono bg-muted/40 border border-border rounded p-3 overflow-auto">{`Name:   Memorify
URL:    ${MCP_URL}
Token:  ${generatedToken}`}</pre>
                </TabsContent>
                <TabsContent value="cursor" className="space-y-2">
                  <p className="text-xs text-muted-foreground">Add to <code className="font-mono">~/.cursor/mcp.json</code>:</p>
                  <pre className="text-[11px] font-mono bg-muted/40 border border-border rounded p-3 overflow-auto">{JSON.stringify({
                    mcpServers: {
                      memorify: { url: MCP_URL, headers: { Authorization: `Bearer ${generatedToken}` } },
                    },
                  }, null, 2)}</pre>
                </TabsContent>
              </Tabs>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConnectOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {servers.map((s) => {
            const stools = tools.filter((t) => t.mcp_server_id === s.id);
            return (
              <Collapsible key={s.id} className="rounded-lg border border-border bg-card overflow-hidden group/srv">
                <div className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-semibold truncate">{s.name}</div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono",
                        s.last_error ? "bg-destructive/15 text-destructive" :
                        s.last_handshake_at ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                        {s.last_error ? "error" : s.last_handshake_at ? "ready" : "pending"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{s.url}</div>
                    {s.last_error && <div className="text-xs text-destructive mt-1 truncate">{s.last_error}</div>}
                    {s.last_handshake_at && !s.last_error && <div className="text-[10px] text-muted-foreground mt-0.5">Last sync {formatDistanceToNow(new Date(s.last_handshake_at), { addSuffix: true })}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost" className="gap-1.5">
                        <Wrench className="h-3.5 w-3.5" />
                        <span className="text-xs">{stools.length} tool{stools.length === 1 ? "" : "s"}</span>
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]/srv:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <Switch checked={s.enabled} onCheckedChange={() => toggleServer(s)} />
                    <Button size="sm" variant="outline" onClick={() => handshake(s.id)} disabled={busy === s.id}>
                      <RefreshCcw className={cn("h-3.5 w-3.5 mr-1.5", busy === s.id && "animate-spin")} /> Sync
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="divide-y divide-border border-t border-border">
                    {stools.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">No tools discovered yet — click Sync.</div>
                    ) : stools.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono truncate">{t.name}</div>
                          {t.description && <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>}
                        </div>
                        <Switch checked={t.enabled} onCheckedChange={() => toggleTool(t)} />
                        <Button size="sm" variant="ghost" onClick={() => openTest(s, t)}>
                          <Play className="h-3.5 w-3.5 mr-1.5" /> Test
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => addAsPlugin(s, t)}>
                          <Plug2 className="h-3.5 w-3.5 mr-1.5" /> As plugin
                        </Button>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}

        {/* Available presets — not yet connected */}
        {(providerGroups.public.length || providerGroups.token.length || providerGroups.oauth.length) > 0 && (
          <>
            <div className="pt-4 pb-1 text-xs uppercase tracking-wide text-muted-foreground">Available to connect</div>
            {[
              { label: "Ready now", items: [...providerGroups.public, ...providerGroups.token] },
              { label: "OAuth", items: providerGroups.oauth },
            ].map((group) => group.items.length ? (
              <div key={group.label} className="space-y-2">
                <div className="text-[11px] font-medium text-muted-foreground">{group.label}</div>
                {group.items.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card/40 gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <div className="text-sm font-semibold truncate">{p.name}</div>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono",
                          p.oauth ? "bg-amber-500/15 text-amber-500" :
                          p.needsToken ? "bg-sky-500/15 text-sky-500" : "bg-primary/15 text-primary")}>
                          {presetBadge(p)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{p.url}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.tokenHint}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button size="sm" variant={p.oauth ? "outline" : "default"} onClick={() => setPresetOpen(p)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> {presetButton(p)}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null)}
          </>
        )}
      </div>
    </>
  );
}
