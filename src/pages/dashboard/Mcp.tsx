import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, RefreshCcw, Trash2, Server, Wrench, Plug2, Play, Sparkles, ChevronDown, Copy, Check, KeyRound, Zap, Search, ExternalLink, LayoutGrid, GitBranch, CloudCog, Database, Activity, BookOpen, FileSearch, MessagesSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { getMcpUrl } from "@/lib/mcp-url";
import { MCP_CATALOG, CATEGORY_META, type CatalogItem, type CatalogCategory } from "@/data/mcpCatalog";

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
  /** Optional second credential sent as another header (e.g. Datadog app key) */
  secondAuth?: { header: string; label: string; placeholder?: string };
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
    tokenHint:
      "Create a token at huggingface.co → Settings → Access Tokens (read scope is enough). The base server exposes 4 tools (whoami, repo search, repo details, hf_fs) — enable extra tools (repos, sandboxes, jobs, Spaces) at huggingface.co/settings/mcp and paste the customized URL below to use them.",
    docsUrl: "https://huggingface.co/settings/mcp",
    tokenPlaceholder: "hf_…",
    allowUrlOverride: true,
    urlHint:
      "Keep https://huggingface.co/mcp for the default 4 tools, or paste the URL from your HF MCP settings page (with bouquet/mix params) to expose the extra tools you enabled there.",
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

/**
 * Catalog entries that define their own hosted remote server (no built-in preset yet).
 * Deduped against PRESETS by URL, so catalog + built-ins never collide.
 */
const CATALOG_PRESETS: Preset[] = MCP_CATALOG
  .filter((c) => c.url && !PRESETS.some((p) => p.url === c.url))
  .map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url!,
    transport: c.transport ?? "http",
    needsToken: !!c.needsToken,
    tokenLabel: c.tokenLabel ?? "",
    tokenHint: c.tokenHint ?? "",
    docsUrl: c.docsUrl,
    oauth: c.oauth,
    authHeader: c.authHeader,
    secondAuth: c.secondAuth,
    tokenPlaceholder: c.tokenPlaceholder,
    allowUrlOverride: c.allowUrlOverride,
    urlHint: c.urlHint,
  }));

const ALL_PRESETS = [...PRESETS, ...CATALOG_PRESETS];

/** Resolve the connectable preset behind a catalog entry (by presetId, else by URL). */
const presetForItem = (item: CatalogItem): Preset | undefined =>
  item.presetId
    ? ALL_PRESETS.find((p) => p.id === item.presetId)
    : item.url
      ? ALL_PRESETS.find((p) => p.url === item.url)
      : undefined;

const normUrl = (u: string) => u.replace(/\/+$/, "").toLowerCase();

const CATEGORY_ICON: Record<string, LucideIcon> = {
  all: LayoutGrid,
  vcs: GitBranch,
  devops: CloudCog,
  data: Database,
  observability: Activity,
  knowledge: BookOpen,
  mlops: Sparkles,
  rag: FileSearch,
  comms: MessagesSquare,
};

/** Brand logo from svgl.app with light/dark variants; falls back to an initials tile. */
function ProviderLogo({ item, className }: { item: { name: string; logo?: { light: string; dark?: string } }; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = cn("flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 p-1 text-primary", className);
  if (!item.logo || failed) {
    const initials =
      item.name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "M";
    return <div className={box}><span className="text-[10px] font-bold">{initials}</span></div>;
  }
  return (
    <>
      <img
        src={item.logo.light}
        alt={item.name}
        onError={() => setFailed(true)}
        className={cn("h-7 w-7 flex-shrink-0 object-contain", className, item.logo.dark && "dark:hidden")}
      />
      {item.logo.dark && (
        <img
          src={item.logo.dark}
          alt={item.name}
          onError={() => setFailed(true)}
          className={cn("hidden h-7 w-7 flex-shrink-0 object-contain", className, "dark:block")}
        />
      )}
    </>
  );
}

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

  // ----- Integration catalog (browse / search) -----
  const [catalogCat, setCatalogCat] = useState<CatalogCategory | "all" | "more">("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [presetSecondToken, setPresetSecondToken] = useState("");

  const connectedSet = useMemo(() => new Set(servers.map((s) => normUrl(s.url))), [servers]);

  /** Built-in presets not covered by any catalog entry (PayPal, Shopify, …) → "More" tab */
  const claimedPresetKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const c of MCP_CATALOG) {
      const p = presetForItem(c);
      if (p) {
        keys.add(p.id);
        keys.add(normUrl(p.url));
      }
    }
    return keys;
  }, []);

  const morePresets = useMemo(
    () => ALL_PRESETS.filter((p) => !claimedPresetKeys.has(p.id) && !claimedPresetKeys.has(normUrl(p.url))),
    [claimedPresetKeys],
  );

  const catalogQueryLower = catalogQuery.trim().toLowerCase();
  const catalogRows: CatalogItem[] = useMemo(() => {
    const q = catalogQueryLower;
    const hit = (name: string, blurb: string) => !q || name.toLowerCase().includes(q) || blurb.toLowerCase().includes(q);
    if (catalogCat === "more") {
      return morePresets
        .filter((p) => hit(p.name, p.tokenHint ?? ""))
        .map((p): CatalogItem => ({
          id: p.id,
          name: p.name,
          category: "comms",
          tagline: p.tokenHint,
          presetId: p.id,
          docsUrl: p.docsUrl,
        }));
    }
    if (catalogCat === "all") return MCP_CATALOG.filter((c) => hit(c.name, c.tagline));
    return MCP_CATALOG.filter((c) => c.category === catalogCat && hit(c.name, c.tagline));
  }, [catalogCat, catalogQueryLower, morePresets]);

  const apiError = (data: any, fallback: string) =>
    data?.detail || data?.error || data?.data?.detail || data?.data?.error || fallback;

  const presetButton = (p: Preset) => p.oauth ? "Connect" : p.needsToken ? "Add token" : "Add public";

  const catalogBadge = (item: CatalogItem, preset?: Preset, connected = false): { label: string; cls: string } => {
    if (connected) return { label: "connected", cls: "bg-emerald-500/15 text-emerald-500" };
    if (preset?.oauth || item.oauth) return { label: "oauth", cls: "bg-amber-500/15 text-amber-500" };
    if (preset?.needsToken || item.needsToken) return { label: "api key", cls: "bg-sky-500/15 text-sky-500" };
    if (item.local || !preset) return { label: "local", cls: "bg-violet-500/15 text-violet-500" };
    return { label: "public", cls: "bg-primary/15 text-primary" };
  };

  const openLocalSetup = (item: CatalogItem) => {
    setForm({ name: `${item.name} (local)`, url: "", transport: "http", bearer: "" });
    setOpen(true);
    toast.info(`${item.name} runs locally — follow its docs, then paste the server URL here`);
  };

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
    if (p.secondAuth && presetSecondToken) {
      auth.headers = { ...(auth.headers ?? {}), [p.secondAuth.header]: presetSecondToken };
    }
    const srv = await createServer({
      name: p.name, url: serverUrl, transport: p.transport, auth,
    });
    if (!srv) return;
    toast.success(`${p.name} added`);
    setPresetOpen(null);
    setPresetToken("");
    setPresetSecondToken("");
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

                {/* Hint — the full one-click catalog lives on the page below */}
                <p className="text-[11px] text-muted-foreground">
                  For one-click integrations (GitHub, Stripe, Notion, Docker, …) close this dialog and pick one from the
                  catalog below — this form is for custom or self-hosted servers.
                </p>

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
      <Dialog open={!!presetOpen} onOpenChange={(v) => { if (!v) { setPresetOpen(null); setPresetToken(""); setPresetSecondToken(""); setPresetUrl(""); } }}>
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
            {presetOpen?.secondAuth && (
              <div className="space-y-1.5">
                <Label>{presetOpen.secondAuth.label}</Label>
                <Input
                  type="password"
                  value={presetSecondToken}
                  onChange={(e) => setPresetSecondToken(e.target.value)}
                  placeholder={presetOpen.secondAuth.placeholder ?? "key…"}
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
            <Button variant="ghost" onClick={() => { setPresetOpen(null); setPresetToken(""); setPresetSecondToken(""); setPresetUrl(""); }}>Cancel</Button>
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

        {/* Integration catalog — categorized, searchable, svgl.app logos */}
        <div className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">Integration catalog</div>
              <div className="text-xs text-muted-foreground">
                {MCP_CATALOG.length + morePresets.length} one-click MCP servers across 8 workflow categories · logos by{" "}
                <a href="https://svgl.app" target="_blank" rel="noreferrer" className="underline hover:text-foreground">svgl.app</a>
              </div>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Search integrations…"
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORY_META.map((cat) => {
              const Icon = CATEGORY_ICON[cat.id] ?? LayoutGrid;
              return (
                <button
                  key={cat.id}
                  type="button"
                  title={cat.blurb}
                  onClick={() => setCatalogCat(cat.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    catalogCat === cat.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {cat.label}
                </button>
              );
            })}
            {morePresets.length > 0 && (
              <button
                type="button"
                onClick={() => setCatalogCat("more")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  catalogCat === "more"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <Server className="h-3 w-3" />
                More ({morePresets.length})
              </button>
            )}
          </div>

          {catalogRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No integrations match your search.</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {catalogRows.map((c) => {
                const preset = presetForItem(c);
                const isConnected = !!preset && connectedSet.has(normUrl(preset.url));
                const badge = catalogBadge(c, preset, isConnected);
                return (
                  <div
                    key={`${catalogCat}-${c.id}`}
                    className={cn(
                      "flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3 transition-opacity",
                      isConnected && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <ProviderLogo item={c} />
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        <span className={cn("flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]", badge.cls)}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    <p className="min-h-[2.2em] text-[11px] leading-snug text-muted-foreground">{c.tagline}</p>
                    <div className="mt-auto flex items-center gap-2">
                      {isConnected ? (
                        <span className="text-[11px] font-medium text-emerald-500">✓ Connected</span>
                      ) : preset ? (
                        <Button size="sm" variant={preset.oauth ? "outline" : "default"} onClick={() => setPresetOpen(preset)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> {presetButton(preset)}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openLocalSetup(c)}>
                          Set up locally
                        </Button>
                      )}
                      <a
                        href={c.docsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" /> Docs
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
