import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import {
  Bot,
  Check,
  Copy,
  Download,

  KeyRound,
  LayoutGrid,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  Code,
  Eye,
  EyeOff,
  Cpu,
  Layers,
  Globe,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sliders,

  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getMcpUrl } from "@/lib/mcp-url";

export type AgentKind =
  | "claude_code"
  | "github_copilot"
  | "openai_codex"
  | "opencode"
  | "cline"
  | "kilo_code"
  | "hermes"
  | "openclaw"
  | "pi"
  | "cursor"
  | "grok"
  | "windsurf"
  | "custom"
  // Legacy kinds kept so agents already registered in the database still typecheck.
  | "claude_desktop"
  | "chatgpt"
  | "vscode"
  | "zed";

export type Agent = {
  id: string;
  name: string;
  kind: AgentKind | string;
  status: "pending" | "connected" | "disconnected" | string;
  workspace_id?: string;
  access_level?: string;
  last_seen_at: string | null;
  created_at: string;
  user_id?: string;
};

type FreshToken = {
  token: string;
  createdAt: string;
};

type ToolMeta = {
  name: string;
  description?: string;
};

type TestState = {
  ok: boolean;
  label: string;
  detail?: string;
  latencyMs?: number;
  tools?: ToolMeta[];
};

export type CatalogItem = {
  kind: AgentKind;
  name: string;
  tagline: string;
  description: string;
  category: "cli" | "ide" | "desktop" | "platform" | "custom";
  icon: typeof Terminal;
  accent: string;
  bgAccent: string;
  /** Real brand logo (SVG from svgl.app) — shown when present, icon is the fallback. */
  logo?: string;
  installUrl?: string;
  installLabel?: string;
  ready: boolean;
};

const MCP_URL = getMcpUrl();
const MCP_SSE_URL = `${MCP_URL}/sse`;
const PAIR_COMMAND = "npx https://memorify.dev/cli/memorify.tgz pair";
const OAUTH_WELL_KNOWN_URL = `${new URL(MCP_URL).origin}/.well-known/oauth-authorization-server`;

export const CATALOG: CatalogItem[] = [
  {
    kind: "claude_code",
    name: "Claude Code",
    tagline: "Anthropic terminal coding agent",
    description: "Connect Claude Code CLI in one command. Gives Claude continuous memory, codebase context, and custom workspace tools.",
    category: "cli",
    icon: Terminal,
    accent: "text-amber-500",
    bgAccent: "bg-amber-500/10 border-amber-500/30",
    logo: "/logos/claude-ai-icon.svg",
    installUrl: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "github_copilot",
    name: "GitHub Copilot",
    tagline: "Copilot CLI & VS Code agent mode",
    description: "Pair GitHub Copilot CLI or VS Code agent mode with Memorify for shared memory across repos, PRs, and terminal sessions.",
    category: "cli",
    icon: Sparkles,
    accent: "text-purple-300",
    bgAccent: "bg-purple-500/10 border-purple-500/30",
    logo: "/logos/copilot_dark.svg",
    installUrl: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "openai_codex",
    name: "Codex",
    tagline: "OpenAI terminal coding agent",
    description: "Connect Codex CLI in one command. Persistent memory and workspace tools for every Codex session.",
    category: "cli",
    icon: Cpu,
    accent: "text-emerald-400",
    bgAccent: "bg-emerald-500/10 border-emerald-500/30",
    logo: "/logos/codex.svg",
    installUrl: "https://developers.openai.com/codex/",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "opencode",
    name: "OpenCode",
    tagline: "Open-source terminal coding agent",
    description: "Connect OpenCode in one command. Shared memory, skills, and tools across all your OpenCode projects.",
    category: "cli",
    icon: Code,
    accent: "text-orange-400",
    bgAccent: "bg-orange-500/10 border-orange-500/30",
    logo: "/logos/opencode-dark.svg",
    installUrl: "https://opencode.ai",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "cline",
    name: "Cline",
    tagline: "Autonomous VS Code coding agent",
    description: "Connect Cline in VS Code for persistent workspace memory that survives context resets between tasks.",
    category: "ide",
    icon: Bot,
    accent: "text-indigo-400",
    bgAccent: "bg-indigo-500/10 border-indigo-500/30",
    logo: "/logos/cline.svg",
    installUrl: "https://github.com/cline/cline",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "kilo_code",
    name: "Kilo Code",
    tagline: "Open-source VS Code agent",
    description: "Connect Kilo Code in VS Code. Plan, build, and fix with an agent that remembers every previous session.",
    category: "ide",
    icon: Zap,
    accent: "text-amber-400",
    bgAccent: "bg-amber-500/10 border-amber-500/30",
    logo: "/logos/kilocode-dark.svg",
    installUrl: "https://kilocode.ai",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "hermes",
    name: "Hermes Agents",
    tagline: "Autonomous multi-agent workflows",
    description: "Connect Hermes agents to Memorify for shared memory, plans, and tool access across the full agent fleet.",
    category: "platform",
    icon: Globe,
    accent: "text-cyan-400",
    bgAccent: "bg-cyan-500/10 border-cyan-500/30",
    logo: "/logos/hermes.png",
    ready: true,
  },
  {
    kind: "openclaw",
    name: "OpenClaw",
    tagline: "Personal AI agent gateway",
    description: "Connect OpenClaw to Memorify so your personal agent keeps long-term memory and workspace context.",
    category: "platform",
    icon: Layers,
    accent: "text-red-400",
    bgAccent: "bg-red-500/10 border-red-500/30",
    logo: "/logos/openclaw.svg",
    installUrl: "https://openclaw.ai",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "pi",
    name: "PI",
    tagline: "pi.dev agent platform",
    description: "Connect PI agents from pi.dev to Memorify for shared memory and tool execution across your agent stack.",
    category: "platform",
    icon: LayoutGrid,
    accent: "text-violet-400",
    bgAccent: "bg-violet-500/10 border-violet-500/30",
    logo: "/logos/pi-dev.png",
    installUrl: "https://pi.dev/",
    installLabel: "Site",
    ready: true,
  },
  {
    kind: "cursor",
    name: "Cursor",
    tagline: "AI code editor with native MCP",
    description: "Add Memorify as an MCP server in Cursor for shared memory and workspace tools across every AI edit.",
    category: "ide",
    icon: LayoutGrid,
    accent: "text-cyan-400",
    bgAccent: "bg-cyan-500/10 border-cyan-500/30",
    logo: "/logos/cursor_dark.svg",
    installUrl: "https://docs.cursor.com/context/model-context-protocol",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "grok",
    name: "Grok",
    tagline: "xAI coding agent & MCP tools",
    description: "Connect Grok to Memorify for real-time tool calling and cross-agent memory shared with the rest of your fleet.",
    category: "cli",
    icon: Globe,
    accent: "text-blue-400",
    bgAccent: "bg-blue-500/10 border-blue-500/30",
    logo: "/logos/grok-dark.svg",
    installUrl: "https://x.ai/api",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "windsurf",
    name: "Windsurf",
    tagline: "Cascade agentic IDE",
    description: "Configure the Windsurf Cascade agent with Memorify MCP to share memory across editors and sessions.",
    category: "ide",
    icon: Zap,
    accent: "text-teal-400",
    bgAccent: "bg-teal-500/10 border-teal-500/30",
    logo: "/logos/windsurf-dark.svg",
    installUrl: "https://codeium.com/windsurf",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "custom",
    name: "Custom MCP Agent",
    tagline: "cURL, Python, Node.js, REST",
    description: "Connect any custom agent, Python script, or server using standard HTTP Stream or SSE transport.",
    category: "custom",
    icon: Wifi,
    accent: "text-purple-400",
    bgAccent: "bg-purple-500/10 border-purple-500/30",
    ready: true,
  },
];

const COMING_SOON = [
  "Zed Editor",
  "Claude Desktop",
  "Gemini CLI",
  "Antigravity Agent",
  "LangChain / LangGraph",
];

const apiError = (data: any, fallback: string) =>
  data?.detail || data?.error || data?.data?.detail || data?.data?.error || fallback;

function kindMeta(kind: string): CatalogItem {
  return (
    CATALOG.find((item) => item.kind === kind) ??
    CATALOG.find((item) => item.kind === "custom") ??
    CATALOG[0]
  );
}

/** Logos for legacy agent kinds that predate the CLI-first catalog — existing agents keep their real brand mark. */
const LEGACY_LOGOS: Record<string, string> = {
  claude_desktop: "/logos/claude-ai-icon.svg",
  chatgpt: "/logos/openai_dark.svg",
  vscode: "/logos/vscode.svg",
  zed: "/logos/zed-logo_dark.svg",
};

/** Renders the real brand logo when available (sourced from svgl.app), else the lucide icon. */
function BrandMark({ kind, className }: { kind: string; className?: string }) {
  const item = kindMeta(kind);
  const logo = item.logo ?? LEGACY_LOGOS[kind];
  if (logo) {
    return <img src={logo} alt="" aria-hidden className={cn("object-contain", className)} />;
  }
  const Icon = item.icon;
  return <Icon className={cn(className, item.accent)} />;
}

function relativeDate(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    return `${formatDistanceToNow(new Date(value), { addSuffix: true })}`;
  } catch {
    return "Unknown";
  }
}

function redactToken(token: string) {
  if (!token) return "";
  if (token.length <= 16) return token;
  return `${token.slice(0, 12)}••••••••••••${token.slice(-6)}`;
}

function bearerHeader(token: string) {
  return `Authorization: Bearer ${token}`;
}

export function configSnippetFor(
  kind: string,
  token: string,
  transport: "http" | "sse" = "http",
  revealed = false,
) {
  const activeToken = revealed && token ? token : token ? redactToken(token) : "mem_live_YOUR_TOKEN";
  const endpoint = transport === "sse" ? MCP_SSE_URL : MCP_URL;

  switch (kind) {
    case "claude_code":
      return `claude mcp add memorify ${endpoint} \\
  --transport ${transport} \\
  --header "Authorization: Bearer ${activeToken}"`;

    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            memorify: {
              url: endpoint,
              headers: {
                Authorization: `Bearer ${activeToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case "claude_desktop":
      return JSON.stringify(
        {
          mcpServers: {
            memorify: {
              command: "npx",
              args: [
                "-y",
                "mcp-remote@latest",
                endpoint,
                "--header",
                `Authorization: Bearer ${activeToken}`,
              ],
            },
          },
        },
        null,
        2,
      );

    case "windsurf":
      return JSON.stringify(
        {
          mcpServers: {
            memorify: {
              serverUrl: endpoint,
              headers: {
                Authorization: `Bearer ${activeToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case "vscode":
      return JSON.stringify(
        {
          mcpServers: {
            memorify: {
              url: endpoint,
              transport: transport,
              headers: {
                Authorization: `Bearer ${activeToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case "zed":
      return JSON.stringify(
        {
          context_servers: {
            memorify: {
              endpoint: endpoint,
              headers: {
                Authorization: `Bearer ${activeToken}`,
              },
            },
          },
        },
        null,
        2,
      );

    case "chatgpt":
      return `# ChatGPT Custom Action / Remote MCP Connector Configuration
Endpoint URL: ${endpoint}
Authentication Type: Bearer Token / API Key
Auth Header: Bearer ${activeToken}
OAuth Authorization URL: ${MCP_URL}/oauth/authorize
OAuth Token URL: ${MCP_URL}/oauth/token
OAuth Discovery: ${OAUTH_WELL_KNOWN_URL}`;

    case "grok":
      return `# Grok / xAI Integration Configuration
Endpoint URL: ${endpoint}
Auth Type: Bearer Token or OAuth 2.0
Bearer Token: ${activeToken}
OAuth Discovery: ${OAUTH_WELL_KNOWN_URL}`;

    default:
      return `# Memorify MCP Gateway Connection
MCP_URL=${endpoint}
MEMORIFY_AGENT_TOKEN=${activeToken}
Authorization: Bearer ${activeToken}

# cURL Test:
curl -X POST ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${activeToken}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`;
  }
}

function connectionPackageFor(
  agent: Agent,
  token: string,
  authType: "bearer" | "oauth" = "bearer",
) {
  const meta = kindMeta(agent.kind);

  const basePackage = {
    schema: "memorify.agent_connection.v2",
    created_at: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      label: meta.name,
      workspace_id: agent.workspace_id ?? null,
    },
    endpoints: {
      http_stream: MCP_URL,
      sse: MCP_SSE_URL,
      oauth_discovery: OAUTH_WELL_KNOWN_URL,
      oauth_authorize: `${MCP_URL}/oauth/authorize`,
      oauth_token: `${MCP_URL}/oauth/token`,
    },
    auth: {
      type: authType,
      token: token,
      header: bearerHeader(token),
    },
    client_configs: {
      claude_code_command: configSnippetFor("claude_code", token, "http", true),
      cursor_mcp_json: JSON.parse(configSnippetFor("cursor", token, "http", true)),
      claude_desktop_json: JSON.parse(configSnippetFor("claude_desktop", token, "sse", true)),
      windsurf_json: JSON.parse(configSnippetFor("windsurf", token, "http", true)),
      vscode_mcp_json: JSON.parse(configSnippetFor("vscode", token, "http", true)),
      zed_settings_json: JSON.parse(configSnippetFor("zed", token, "http", true)),
    },
  };

  return basePackage;
}

export function AgentsManager() {
  const { user } = useAuth();
  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();
  const workspaceId = organization?.id ?? "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [freshTokens, setFreshTokens] = useState<Record<string, FreshToken>>({});
  const [selectedKind, setSelectedKind] = useState<AgentKind>("claude_code");
  const [name, setName] = useState("Claude Code");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<AgentKind | null>(null);
  const [wizardAgent, setWizardAgent] = useState<Agent | null>(null);
  const [wizardKind, setWizardKind] = useState<AgentKind>("claude_code");
  const [wizardTransport, setWizardTransport] = useState<"http" | "sse">("http");
  const [wizardAuthType, setWizardAuthType] = useState<"bearer" | "oauth">("bearer");
  const [showFullToken, setShowFullToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testState, setTestState] = useState<Record<string, TestState>>({});

  const connected = useMemo(
    () => agents.filter((agent) => agent.status !== "disconnected"),
    [agents],
  );

  const runAction = useCallback(
    async <T,>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
      if (!workspaceId) throw new Error("Select or create a workspace first");
      const token = await getToken();
      if (!token) throw new Error("Sign in again to continue");

      const res = await fetch("/api/copilot/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: command, workspace_id: workspaceId, args }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) throw new Error(apiError(body, `${command} failed`));
      return (body?.data ?? body) as T;
    },
    [getToken, workspaceId],
  );

  const loadAgents = useCallback(async () => {
    if (!user || !workspaceId) {
      setAgents([]);
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again to continue");
      const res = await fetch(`/api/agents?workspace_id=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiError(body, "Could not load agents"));
      setAgents(body.agents ?? []);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not load agents");
    } finally {
      setLoading(false);
    }
  }, [getToken, user, workspaceId]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const createAgent = async (kind = selectedKind) => {
    if (!workspaceId) {
      toast.error("Create or select a workspace organization first");
      return;
    }
    const meta = kindMeta(kind);
    const agentName = name.trim() || meta.name;
    setConnecting(kind);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again to continue");
      const res = await fetch("/api/bootstrap-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          agent_name: agentName,
          kind,
          access_level: "full",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.token || !body.agent)
        throw new Error(apiError(body, "Could not create agent"));

      const nextAgent: Agent = {
        ...body.agent,
        kind,
        status: body.agent.status ?? "connected",
        last_seen_at: body.agent.last_seen_at ?? null,
        created_at: body.agent.created_at ?? new Date().toISOString(),
      };
      setFreshTokens((current) => ({
        ...current,
        [nextAgent.id]: { token: body.token, createdAt: new Date().toISOString() },
      }));
      setAgents((current) => [
        nextAgent,
        ...current.filter((agent) => agent.id !== nextAgent.id),
      ]);
      setWizardAgent(nextAgent);
      setWizardKind(kind);
      setTestState((current) => ({
        ...current,
        [nextAgent.id]: { ok: false, label: "Ready to test connection" },
      }));
      toast.success(`${meta.name} agent created`);
      window.dispatchEvent(new CustomEvent("agents-changed"));
    } catch (error: any) {
      toast.error(error?.message ?? "Could not create agent");
    } finally {
      setConnecting(null);
    }
  };

  const mintToken = async (agent: Agent) => {
    try {
      const minted = await runAction<{ token: string; expires_at: string | null }>(
        "agents.tokens.mint",
        {
          agent_id: agent.id,
        },
      );
      setFreshTokens((current) => ({
        ...current,
        [agent.id]: { token: minted.token, createdAt: new Date().toISOString() },
      }));
      setWizardAgent(agent);
      setWizardKind((agent.kind as AgentKind) || "claude_code");
      toast.success("New agent token generated");
      return minted.token;
    } catch (error: any) {
      toast.error(error?.message ?? "Could not generate token");
      return null;
    }
  };

  const downloadConnectionFile = (agent: Agent, authType: "bearer" | "oauth") => {
    const token = freshTokens[agent.id]?.token;
    if (!token) {
      toast.error("No token available to download. Please mint a token first.");
      return;
    }
    const data = connectionPackageFor(agent, token, authType);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memorify-${agent.kind}-${agent.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Connection JSON downloaded");
  };

  const testMcp = async (agent: Agent) => {
    const token = freshTokens[agent.id]?.token;
    if (!token) {
      toast.error("Generate an active token first to test");
      return;
    }
    setTestingId(agent.id);
    const startTime = performance.now();
    try {
      const endpoint = wizardTransport === "sse" ? MCP_SSE_URL : MCP_URL;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `memorify-test-${Date.now()}`,
          method: "tools/list",
          params: {},
        }),
      });
      const latencyMs = Math.round(performance.now() - startTime);
      const data = await res.json().catch(() => null);
      const ok = res.ok && data?.result?.tools;
      const toolsList = (data?.result?.tools ?? []) as ToolMeta[];

      setTestState((current) => ({
        ...current,
        [agent.id]: {
          ok: !!ok,
          label: ok ? `Connected & Verified (${toolsList.length} tools discovered)` : `Test failed (${res.status})`,
          detail: ok
            ? `Server responded with ${toolsList.length} tools available.`
            : JSON.stringify(data || "Invalid response").slice(0, 200),
          latencyMs,
          tools: toolsList,
        },
      }));

      if (!ok) throw new Error(`MCP test failed (status ${res.status})`);

      setAgents((current) =>
        current.map((row) =>
          row.id === agent.id
            ? { ...row, status: "connected", last_seen_at: new Date().toISOString() }
            : row,
        ),
      );
      toast.success(`MCP connection verified in ${latencyMs}ms!`);
    } catch (error: any) {
      toast.error(error?.message ?? "MCP connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  const copyText = async (value: string, label = "Copied", key?: string) => {
    await navigator.clipboard.writeText(value);
    if (key) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
    toast.success(label);
  };

  const renameAgent = async (agent: Agent) => {
    const next = renameValue.trim();
    if (!next) return;
    try {
      await runAction("agents.rename", { id: agent.id, name: next });
      setAgents((current) =>
        current.map((row) => (row.id === agent.id ? { ...row, name: next } : row)),
      );
      setRenamingId(null);
      toast.success("Agent renamed");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not rename agent");
    }
  };

  const disconnectAgent = async (agent: Agent) => {
    try {
      await runAction("agents.disconnect", { id: agent.id });
      setAgents((current) =>
        current.map((row) =>
          row.id === agent.id ? { ...row, status: "disconnected" } : row,
        ),
      );
      toast.success("Agent disconnected");
      window.dispatchEvent(new CustomEvent("agents-changed"));
    } catch (error: any) {
      toast.error(error?.message ?? "Could not disconnect agent");
    }
  };

  const selectKind = (kind: AgentKind) => {
    setSelectedKind(kind);
    setName(kindMeta(kind).name);
  };

  const openSetupModal = (agent: Agent) => {
    setWizardAgent(agent);
    setWizardKind((agent.kind as AgentKind) || "claude_code");
    setShowFullToken(false);
  };

  const wizardToken = wizardAgent ? freshTokens[wizardAgent.id]?.token ?? "" : "";
  const activeTest = wizardAgent ? testState[wizardAgent.id] : null;

  return (
    <>
      <PageHeader
        title="Agent Connectors & MCP Hub"
        description="Connect Claude Code, Cursor, ChatGPT, Grok, Windsurf, VS Code, and custom agents through a unified Model Context Protocol endpoint."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAgents} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => createAgent()} disabled={!!connecting || !workspaceId}>
              <Plus className="mr-2 h-4 w-4" />
              Connect new agent
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Universal CLI Pairing Banner */}
        <Alert className="border-emerald-500/40 bg-emerald-500/5">
          <Terminal className="h-4 w-4 text-emerald-500" />
          <AlertTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Universal Agent Pairing (Recommended)</span>
            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Device Flow</Badge>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <code className="font-mono text-xs text-foreground bg-background/80 px-2 py-1 rounded border border-border/60 break-all">
                {PAIR_COMMAND}
              </code>
              <Button variant="outline" size="sm" onClick={() => copyText(PAIR_COMMAND, "Pair command copied", "top-pair")}>
                {copiedKey === "top-pair" ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                Copy command
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Works anywhere npx does — no npm account needed. Auto-detects installed clients (Claude Code, Codex,
              GitHub Copilot, opencode, Cline, Kilo Code, Cursor, Windsurf, OpenClaw), opens your browser to approve
              the pairing, and writes the MCP config for you. Tokens are workspace-scoped and never pass through
              a chat window.
            </p>
          </AlertDescription>
        </Alert>

        {/* Top Universal Endpoints Banner */}
        <div className="grid gap-3 md:grid-cols-2">
          <Alert className="border-primary/40 bg-primary/5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Universal MCP Endpoint (HTTP Stream)</span>
              <Badge variant="outline" className="text-[10px]">Standard</Badge>
            </AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <code className="font-mono text-xs text-foreground bg-background/80 px-2 py-1 rounded border border-border/60 break-all">
                {MCP_URL}
              </code>
              <Button variant="outline" size="sm" onClick={() => copyText(MCP_URL, "Endpoint URL copied", "top-http")}>
                {copiedKey === "top-http" ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                Copy URL
              </Button>
            </AlertDescription>
          </Alert>

          <Alert className="border-border bg-card">
            <Globe className="h-4 w-4 text-blue-400" />
            <AlertTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Server-Sent Events (SSE Transport)</span>
              <Badge variant="outline" className="text-[10px]">Streaming</Badge>
            </AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <code className="font-mono text-xs text-foreground bg-background/80 px-2 py-1 rounded border border-border/60 break-all">
                {MCP_SSE_URL}
              </code>
              <Button variant="outline" size="sm" onClick={() => copyText(MCP_SSE_URL, "SSE URL copied", "top-sse")}>
                {copiedKey === "top-sse" ? <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                Copy SSE
              </Button>
            </AlertDescription>
          </Alert>
        </div>

        {/* Quick Connect & Creation Bar */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Quick Connect</CardTitle>
                  <CardDescription>Manual mode: pick an environment to mint a token and get ready-to-use configs. For most clients, use the universal pairing command above instead.</CardDescription>
                </div>
                <Badge variant="secondary" className="hidden sm:inline-flex gap-1.5">
                  <Zap className="h-3 w-3 text-amber-500" />
                  Model Context Protocol v1.0
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {CATALOG.map((item) => {
                  const active = selectedKind === item.kind;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => selectKind(item.kind)}
                      className={cn(
                        "rounded-xl border p-3.5 text-left transition-all hover:border-primary/60 hover:shadow-sm",
                        active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background/60",
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className={cn("p-1.5 rounded-lg", item.bgAccent)}>
                          <BrandMark kind={item.kind} className="h-4 w-4" />
                        </div>
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="text-sm font-semibold leading-tight">{item.name}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{item.tagline}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="agent-name" className="text-xs">Custom Agent / Alias Name</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. Claude Code Terminal"
                  />
                </div>
                <Button onClick={() => createAgent()} disabled={!!connecting || !workspaceId} className="sm:min-w-44">
                  {connecting ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  Create & Get Token
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workspace Status</CardTitle>
              <CardDescription className="text-xs">Active connections & auth.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Workspace</span>
                <Badge variant={workspaceId ? "secondary" : "destructive"}>{workspaceId ? "Ready" : "Missing"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Active Agents</span>
                <span className="font-mono font-medium">{connected.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">OAuth 2.0 Server</span>
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Enabled</Badge>
              </div>
              <Separator />
              <div>
                <span className="text-muted-foreground block mb-1">Org ID:</span>
                <p className="break-all font-mono text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded">
                  {workspaceId || "No active Clerk organization"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Connected Agents */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Connected Agents ({connected.length})
            </h3>
          </div>
          <div className="space-y-3">
            {connected.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center bg-card/40">
                <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                <h3 className="text-base font-semibold">No active agent connections yet</h3>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                  Run <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[11px]">{PAIR_COMMAND}</code> on
                  your machine to pair any client in seconds — the browser flow keeps tokens out of your chat. Prefer
                  manual setup? Pick a client below to mint a token and copy ready-made configs.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(PAIR_COMMAND, "Pair command copied", "empty-pair")}
                  >
                    {copiedKey === "empty-pair" ? (
                      <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Terminal className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Copy pair command
                  </Button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card divide-y divide-border">
                {connected.map((agent) => {
                  const meta = kindMeta(agent.kind);
                  const fresh = freshTokens[agent.id];
                  const tested = testState[agent.id];
                  const renaming = renamingId === agent.id;
                  return (
                    <div
                      key={agent.id}
                      className="grid gap-3 p-4 md:grid-cols-[36px_minmax(0,1fr)_auto] md:items-center hover:bg-muted/10 transition-colors"
                    >
                      <div className={cn("p-2 rounded-lg flex items-center justify-center", meta.bgAccent)}>
                        <BrandMark kind={agent.kind} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        {renaming ? (
                          <div className="flex max-w-lg gap-2">
                            <Input
                              value={renameValue}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void renameAgent(agent);
                                if (event.key === "Escape") setRenamingId(null);
                              }}
                              autoFocus
                            />
                            <Button size="sm" onClick={() => renameAgent(agent)}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm">{agent.name}</span>
                            <Badge variant="secondary" className="capitalize text-xs">
                              {agent.status}
                            </Badge>
                            {fresh && (
                              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                                Fresh Token Active
                              </Badge>
                            )}
                            {tested && (
                              <Badge
                                variant={tested.ok ? "secondary" : "destructive"}
                                className="text-[10px]"
                              >
                                {tested.label}
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">{meta.name}</span>
                          <span>Last active: {relativeDate(agent.last_seen_at)}</span>
                          <span className="font-mono">ID: {agent.id.slice(0, 8)}</span>
                          {fresh && <span className="font-mono text-[11px]">{redactToken(fresh.token)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button variant="default" size="sm" onClick={() => openSetupModal(agent)} className="gap-1.5">
                          <Sliders className="h-3.5 w-3.5" />
                          Setup & Config
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => mintToken(agent)} className="gap-1.5">
                          <KeyRound className="h-3.5 w-3.5" />
                          New Token
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testMcp(agent)}
                          disabled={!freshTokens[agent.id] || testingId === agent.id}
                          className="gap-1.5"
                        >
                          {testingId === agent.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          Test Probe
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setRenamingId(agent.id);
                            setRenameValue(agent.name);
                          }}
                          aria-label="Rename agent"
                        >
                          <span className="text-xs font-semibold">Aa</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => disconnectAgent(agent)}
                          aria-label="Disconnect agent"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Native Connectors</span>
              <Badge variant="outline" className="text-[10px]">Roadmap</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {COMING_SOON.map((label) => (
                <Badge key={label} variant="secondary" className="text-xs py-1 px-2.5 bg-background/80 border border-border/80">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modernized Full Connection Setup Wizard Modal */}
      <Dialog open={!!wizardAgent} onOpenChange={(open) => !open && setWizardAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 rounded-2xl border-border bg-card">
          {wizardAgent && (
            <div className="space-y-0">
              {/* Header */}
              <div className="p-6 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-xl", kindMeta(wizardKind).bgAccent)}>
                      <BrandMark kind={wizardKind} className="h-6 w-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold">
                        Connect {wizardAgent.name}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        Model Context Protocol (MCP) live configuration & credentials.
                      </DialogDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    Agent ID: {wizardAgent.id.slice(0, 8)}
                  </Badge>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Token & Secret Bar */}
                <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        Agent Authentication Secret
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setShowFullToken(!showFullToken)}
                        disabled={!wizardToken}
                      >
                        {showFullToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {showFullToken ? "Mask secret" : "Reveal full token"}
                      </Button>
                    </div>
                  </div>

                  {wizardToken ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-lg bg-muted/60 px-3 py-2 text-xs font-mono break-all border border-border/60">
                          {showFullToken ? wizardToken : redactToken(wizardToken)}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyText(wizardToken, "Agent token copied to clipboard", "modal-token")}
                        >
                          {copiedKey === "modal-token" ? (
                            <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Copy
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40 text-xs">
                        <span className="text-muted-foreground text-[11px]">
                          Store securely — this is the only time it is shown. Tokens are workspace-scoped and can be revoked any time from this page. Prefer{" "}
                          <code className="font-mono text-[10px]">{PAIR_COMMAND}</code> so tokens never pass through the browser.
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => downloadConnectionFile(wizardAgent, wizardAuthType)}
                          >
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            Download JSON Package
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => mintToken(wizardAgent)}
                          >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Rotate
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground">No active token loaded in current session.</span>
                      <Button size="sm" onClick={() => mintToken(wizardAgent)}>
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        Generate Live Token
                      </Button>
                    </div>
                  )}
                </div>

                {/* Transport & Client Tab Selection */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Target AI Client / Platform
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Transport:</span>
                      <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                        <button
                          type="button"
                          onClick={() => setWizardTransport("http")}
                          className={cn(
                            "px-2.5 py-1 text-[11px] rounded font-medium transition-colors",
                            wizardTransport === "http" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          HTTP Stream
                        </button>
                        <button
                          type="button"
                          onClick={() => setWizardTransport("sse")}
                          className={cn(
                            "px-2.5 py-1 text-[11px] rounded font-medium transition-colors",
                            wizardTransport === "sse" ? "bg-background shadow-xs text-foreground" : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          SSE (Server-Sent Events)
                        </button>
                      </div>
                    </div>
                  </div>

                  <Tabs
                    value={wizardKind}
                    onValueChange={(val) => setWizardKind(val as AgentKind)}
                    className="w-full"
                  >
                    <TabsList className="grid grid-cols-4 sm:grid-cols-8 h-auto p-1 bg-muted/40 gap-1 rounded-xl">
                      <TabsTrigger value="claude_code" className="text-xs py-2 px-1 rounded-lg">
                        Claude Code
                      </TabsTrigger>
                      <TabsTrigger value="cursor" className="text-xs py-2 px-1 rounded-lg">
                        Cursor
                      </TabsTrigger>
                      <TabsTrigger value="claude_desktop" className="text-xs py-2 px-1 rounded-lg">
                        Claude Desktop
                      </TabsTrigger>
                      <TabsTrigger value="chatgpt" className="text-xs py-2 px-1 rounded-lg">
                        ChatGPT
                      </TabsTrigger>
                      <TabsTrigger value="grok" className="text-xs py-2 px-1 rounded-lg">
                        Grok / xAI
                      </TabsTrigger>
                      <TabsTrigger value="windsurf" className="text-xs py-2 px-1 rounded-lg">
                        Windsurf
                      </TabsTrigger>
                      <TabsTrigger value="vscode" className="text-xs py-2 px-1 rounded-lg">
                        VS Code
                      </TabsTrigger>
                      <TabsTrigger value="custom" className="text-xs py-2 px-1 rounded-lg">
                        cURL / Other
                      </TabsTrigger>
                    </TabsList>

                    {/* Claude Code CLI Content */}
                    <TabsContent value="claude_code" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">1-Click Terminal Command</h4>
                            <p className="text-xs text-muted-foreground">Run this in your terminal inside any project folder to hook up Claude Code.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("claude_code", wizardToken, wizardTransport, true),
                                "Claude Code command copied!",
                                "cli-cmd",
                              )
                            }
                            disabled={!wizardToken}
                          >
                            {copiedKey === "cli-cmd" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Terminal className="mr-1.5 h-3.5 w-3.5" />}
                            Copy Command
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("claude_code", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-24 font-mono text-xs bg-muted/40 select-all"
                        />
                        <div className="text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/40 space-y-1">
                          <span className="font-semibold text-foreground">💡 Pro tip:</span> After adding, type <code>/mcp</code> in Claude Code to see all available Memorify memory, doc search, and custom tools.
                        </div>
                      </div>
                    </TabsContent>

                    {/* Cursor Content */}
                    <TabsContent value="cursor" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">Cursor IDE Configuration</h4>
                            <p className="text-xs text-muted-foreground">
                              Add to <code>~/.cursor/mcp.json</code> or paste into <strong>Cursor Settings &gt; Features &gt; MCP</strong>.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("cursor", wizardToken, wizardTransport, true),
                                "Cursor config JSON copied!",
                                "cursor-json",
                              )
                            }
                            disabled={!wizardToken}
                          >
                            {copiedKey === "cursor-json" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />}
                            Copy JSON
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("cursor", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-36 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>

                    {/* Claude Desktop Content */}
                    <TabsContent value="claude_desktop" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">Claude Desktop Config</h4>
                            <p className="text-xs text-muted-foreground">
                              Uses official <code>mcp-remote</code> bridge. Paste into <code>claude_desktop_config.json</code>.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("claude_desktop", wizardToken, "sse", true),
                                "Claude Desktop config copied!",
                                "claude-desktop-json",
                              )
                            }
                            disabled={!wizardToken}
                          >
                            {copiedKey === "claude-desktop-json" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Cpu className="mr-1.5 h-3.5 w-3.5" />}
                            Copy JSON
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("claude_desktop", wizardToken, "sse", showFullToken)}
                          className="min-h-36 font-mono text-xs bg-muted/40 select-all"
                        />
                        <div className="text-[11px] text-muted-foreground space-y-1">
                          <p><strong>Config file path:</strong></p>
                          <p className="font-mono bg-muted/40 p-1 rounded">macOS: ~/Library/Application Support/Claude/claude_desktop_config.json</p>
                          <p className="font-mono bg-muted/40 p-1 rounded">Windows: %APPDATA%\Claude\claude_desktop_config.json</p>
                        </div>
                      </div>
                    </TabsContent>

                    {/* ChatGPT Content */}
                    <TabsContent value="chatgpt" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">ChatGPT & Custom GPTs Setup</h4>
                            <p className="text-xs text-muted-foreground">Configure as a Custom Action or Developer MCP Connector.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("chatgpt", wizardToken, wizardTransport, true),
                                "ChatGPT credentials copied!",
                                "chatgpt-info",
                              )
                            }
                          >
                            {copiedKey === "chatgpt-info" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                            Copy Info
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("chatgpt", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-36 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>

                    {/* Grok / xAI Content */}
                    <TabsContent value="grok" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">Grok / xAI Connectors</h4>
                            <p className="text-xs text-muted-foreground">Paste into Grok Tools / Connectors or xAI API integration settings.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("grok", wizardToken, "sse", true),
                                "Grok config copied!",
                                "grok-info",
                              )
                            }
                          >
                            {copiedKey === "grok-info" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Globe className="mr-1.5 h-3.5 w-3.5" />}
                            Copy Info
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("grok", wizardToken, "sse", showFullToken)}
                          className="min-h-36 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>

                    {/* Windsurf Content */}
                    <TabsContent value="windsurf" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">Windsurf (Cascade) Config</h4>
                            <p className="text-xs text-muted-foreground">Add to <code>~/.codeium/windsurf/mcp_config.json</code>.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("windsurf", wizardToken, wizardTransport, true),
                                "Windsurf config copied!",
                                "windsurf-json",
                              )
                            }
                          >
                            {copiedKey === "windsurf-json" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                            Copy JSON
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("windsurf", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-32 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>

                    {/* VS Code / Cline Content */}
                    <TabsContent value="vscode" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">VS Code (Roo Code / Cline)</h4>
                            <p className="text-xs text-muted-foreground">Paste in Roo Code MCP Settings or <code>cline_mcp_settings.json</code>.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("vscode", wizardToken, wizardTransport, true),
                                "VS Code config copied!",
                                "vscode-json",
                              )
                            }
                          >
                            {copiedKey === "vscode-json" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Code className="mr-1.5 h-3.5 w-3.5" />}
                            Copy JSON
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("vscode", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-32 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>

                    {/* Custom / cURL Content */}
                    <TabsContent value="custom" className="mt-4 space-y-3">
                      <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold">cURL & Generic JSON-RPC</h4>
                            <p className="text-xs text-muted-foreground">Standard JSON-RPC 2.0 payload to interact directly via HTTP POST.</p>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              copyText(
                                configSnippetFor("custom", wizardToken, wizardTransport, true),
                                "cURL snippet copied!",
                                "custom-curl",
                              )
                            }
                          >
                            {copiedKey === "custom-curl" ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                            Copy cURL
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={configSnippetFor("custom", wizardToken, wizardTransport, showFullToken)}
                          className="min-h-36 font-mono text-xs bg-muted/40 select-all"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Diagnostic Probe & Verification */}
                <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        Live Connection Tester & Inspector
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Simulates a live JSON-RPC <code>tools/list</code> probe against your Netlify Edge gateway.
                      </p>
                    </div>
                    <Button
                      onClick={() => testMcp(wizardAgent)}
                      disabled={!wizardToken || testingId === wizardAgent.id}
                      className="gap-2"
                    >
                      {testingId === wizardAgent.id ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wifi className="h-4 w-4" />
                      )}
                      Test Live Connection
                    </Button>
                  </div>

                  {activeTest && (
                    <div className="pt-2">
                      <Alert
                        variant={activeTest.ok ? "default" : "destructive"}
                        className={cn(
                          "border",
                          activeTest.ok ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {activeTest.ok ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <AlertTitle className="text-sm font-semibold">
                                {activeTest.label}
                              </AlertTitle>
                              {activeTest.latencyMs && (
                                <Badge variant="outline" className="font-mono text-[10px] bg-background">
                                  ⚡ {activeTest.latencyMs}ms roundtrip
                                </Badge>
                              )}
                            </div>
                            {activeTest.detail && (
                              <AlertDescription className="text-xs font-mono break-all text-muted-foreground">
                                {activeTest.detail}
                              </AlertDescription>
                            )}

                            {activeTest.tools && activeTest.tools.length > 0 && (
                              <div className="pt-2 border-t border-border/40">
                                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider block mb-1.5">
                                  Discovered Workspace Tools:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {activeTest.tools.map((t) => (
                                    <Badge
                                      key={t.name}
                                      variant="secondary"
                                      className="font-mono text-[11px] py-0.5 px-2 bg-background border border-border"
                                    >
                                      {t.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </Alert>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Agents() {
  return <AgentsManager />;
}
