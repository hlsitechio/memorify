import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useOrganization } from "@clerk/react";
import {
  Bot,
  Check,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getMcpUrl } from "@/lib/mcp-url";

type AgentKind = "claude_code" | "github_copilot" | "openai_codex" | "custom";

type Agent = {
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

type TestState = {
  ok: boolean;
  label: string;
  detail?: string;
};

type CatalogItem = {
  kind: AgentKind;
  name: string;
  tagline: string;
  description: string;
  icon: typeof Terminal;
  accent: string;
  installUrl?: string;
  installLabel?: string;
  ready: boolean;
};

const MCP_URL = getMcpUrl();

const CATALOG: CatalogItem[] = [
  {
    kind: "claude_code",
    name: "Claude Code",
    tagline: "Terminal coding agent",
    description: "Paste one command. Claude gets Memorify memory, tools, documents, and connectors through the hosted MCP endpoint.",
    icon: Terminal,
    accent: "text-amber-500",
    installUrl: "https://code.claude.com/docs/en/overview",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "openai_codex",
    name: "OpenAI Codex CLI",
    tagline: "MCP native via config.toml",
    description: "Add the hosted Memorify MCP server to Codex and use the generated agent token as the bearer credential.",
    icon: Sparkles,
    accent: "text-emerald-500",
    installUrl: "https://github.com/openai/codex",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "github_copilot",
    name: "GitHub Copilot",
    tagline: "CLI / agent mode",
    description: "Use the same hosted MCP URL and token from Copilot environments that support MCP servers.",
    icon: Bot,
    accent: "text-violet-500",
    installUrl: "https://docs.github.com/en/copilot",
    installLabel: "Docs",
    ready: true,
  },
  {
    kind: "custom",
    name: "Custom agent",
    tagline: "Bring your own",
    description: "Any MCP-capable agent can connect with the hosted URL and a scoped Memorify token.",
    icon: Wifi,
    accent: "text-cyan-500",
    ready: true,
  },
];

const COMING_SOON = [
  "Microsoft Copilot",
  "Cursor",
  "Hermes Agents",
  "Manus AI",
  "OpenCode",
  "Pi",
];

const apiError = (data: any, fallback: string) =>
  data?.detail || data?.error || data?.data?.detail || data?.data?.error || fallback;

function kindMeta(kind: string) {
  return CATALOG.find((item) => item.kind === kind) ?? CATALOG[CATALOG.length - 1];
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
  return `${token.slice(0, 14)}...${token.slice(-6)}`;
}

function bearerHeader(token: string) {
  return `Authorization: Bearer ${token}`;
}

function configFor(kind: string, token: string, hideToken = false) {
  const safeToken = hideToken ? "mem_live_[stored-in-json-file]" : (token || "mem_live_...");
  if (kind === "claude_code") {
    return `claude mcp add memorify ${MCP_URL} \\
  --transport http \\
  --header "${bearerHeader(safeToken)}"`;
  }
  if (kind === "openai_codex") {
    return `[mcp_servers.memorify]
url = "${MCP_URL}"
headers = { Authorization = "Bearer ${safeToken}" }`;
  }
  if (kind === "github_copilot") {
    return `{
  "mcpServers": {
    "memorify": {
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${safeToken}"
      }
    }
  }
}`;
  }
  return `MCP_URL=${MCP_URL}
MEMORIFY_AGENT_TOKEN=${safeToken}
Authorization: Bearer ${safeToken}`;
}

function connectionPackageFor(agent: Agent, token: string, authType: "bearer" | "oauth" = "bearer") {
  const meta = kindMeta(agent.kind);
  const tokenRef = "<token from memorify.auth.token>";
  
  const basePackage = {
    schema: "memorify.agent_connection.v1",
    created_at: new Date().toISOString(),
    warning: "This file contains a live Memorify agent token. Store it like a password. Delete or rotate it if shared.",
    agent: {
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      label: meta.name,
      workspace_id: agent.workspace_id ?? null,
    },
    instructions: [
      "Use memorify.mcp_url as the MCP server endpoint.",
      "Build the Authorization header from memorify.auth.token and send it on every MCP request.",
      "Run tools/list first to confirm the connection.",
      "Run tools/call with name=whoami to confirm this agent identity.",
    ],
    install: {
      openai_codex_config_toml: configFor("openai_codex", token, true),
      claude_code_command: configFor("claude_code", token, true),
      github_copilot_mcp_json: configFor("github_copilot", token, true),
      generic_env: configFor("custom", token, true),
    },
    test_request: {
      method: "POST",
      url: MCP_URL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer <token from memorify.auth.token>",
      },
      body: {
        jsonrpc: "2.0",
        id: "memorify-test",
        method: "tools/list",
        params: {},
      },
    },
  };

  if (authType === "oauth") {
    return {
      ...basePackage,
      memorify: {
        mcp_url: MCP_URL,
        auth: {
          type: "oauth",
          client_id: "<client_id from Memorify dashboard>",
          client_secret: "<client_secret from Memorify dashboard>",
          authorize_url: `${MCP_URL}/oauth/authorize`,
          token_url: `${MCP_URL}/oauth/token`,
          scopes: ["mcp:read", "mcp:write"],
        },
        scopes_note: "OAuth 2.0 credentials - exchange for access token via token endpoint.",
      },
    };
  }

  return {
    ...basePackage,
    memorify: {
      mcp_url: MCP_URL,
      auth: {
        type: "bearer",
        token,
        header: bearerHeader(tokenRef),
      },
      scopes_note: "Token scopes are enforced server-side by Memorify and can be revoked from the Agents page.",
    },
  };
}

function agentFilename(agent: Agent) {
  const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
  return `memorify-${safeName}-${agent.id.slice(0, 8)}.json`;
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
  const [wizardAuthType, setWizardAuthType] = useState<"bearer" | "oauth">("bearer");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testState, setTestState] = useState<Record<string, TestState>>({});
  const [showToken, setShowToken] = useState(false);

  const connected = useMemo(
    () => agents.filter((agent) => agent.status !== "disconnected"),
    [agents],
  );

  const runAction = useCallback(async <T,>(command: string, args: Record<string, unknown> = {}): Promise<T> => {
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
  }, [getToken, workspaceId]);

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
      toast.error("Create or select a Clerk organization first");
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
      if (!res.ok || !body.token || !body.agent) throw new Error(apiError(body, "Could not create agent"));

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
      setAgents((current) => [nextAgent, ...current.filter((agent) => agent.id !== nextAgent.id)]);
      setWizardAgent(nextAgent);
      setTestState((current) => ({ ...current, [nextAgent.id]: { ok: false, label: "Ready to test" } }));
      toast.success(`${meta.name} agent created`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not create agent");
    } finally {
      setConnecting(null);
    }
  };

  const mintToken = async (agent: Agent) => {
    try {
      const minted = await runAction<{ token: string; expires_at: string | null }>("agents.tokens.mint", {
        agent_id: agent.id,
      });
      setFreshTokens((current) => ({
        ...current,
        [agent.id]: { token: minted.token, createdAt: new Date().toISOString() },
      }));
      setWizardAgent(agent);
      toast.success("New token generated");
      return minted.token;
    } catch (error: any) {
      toast.error(error?.message ?? "Could not generate token");
      return null;
    }
  };

  const downloadConnectionFile = (agent: Agent, authType: "bearer" | "oauth") => {
    const token = freshTokens[agent.id]?.token;
    if (!token) {
      toast.error("No token available to download");
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
  };

  const testMcp = async (agent: Agent) => {
    const token = freshTokens[agent.id]?.token;
    if (!token) {
      toast.error("Generate a token first");
      return;
    }
    setTestingId(agent.id);
    try {
      const res = await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `memorify-${Date.now()}`,
          method: "tools/list",
          params: {},
        }),
      });
      const text = await res.text();
      const ok = res.ok && !text.toLowerCase().includes("invalid");
      setTestState((current) => ({
        ...current,
        [agent.id]: {
          ok,
          label: ok ? "MCP reachable" : `MCP test failed (${res.status})`,
          detail: text.slice(0, 180),
        },
      }));
      if (!ok) throw new Error(`MCP test failed (${res.status})`);
      setAgents((current) =>
        current.map((row) =>
          row.id === agent.id ? { ...row, status: "connected", last_seen_at: new Date().toISOString() } : row,
        ),
      );
      toast.success("MCP connection works");
    } catch (error: any) {
      toast.error(error?.message ?? "MCP test failed");
    } finally {
      setTestingId(null);
    }
  };

  const copyText = async (value: string, label = "Copied") => {
    await navigator.clipboard.writeText(value);
    toast.success(label);
  };

  const renameAgent = async (agent: Agent) => {
    const next = renameValue.trim();
    if (!next) return;
    try {
      await runAction("agents.rename", { id: agent.id, name: next });
      setAgents((current) => current.map((row) => (row.id === agent.id ? { ...row, name: next } : row)));
      setRenamingId(null);
      toast.success("Agent renamed");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not rename agent");
    }
  };

  const disconnectAgent = async (agent: Agent) => {
    try {
      await runAction("agents.disconnect", { id: agent.id });
      setAgents((current) => current.map((row) => (row.id === agent.id ? { ...row, status: "disconnected" } : row)));
      toast.success("Agent disconnected");
    } catch (error: any) {
      toast.error(error?.message ?? "Could not disconnect agent");
    }
  };

  const selectKind = (kind: AgentKind) => {
    setSelectedKind(kind);
    setName(kindMeta(kind).name);
  };

  const wizardToken = wizardAgent ? freshTokens[wizardAgent.id]?.token ?? "" : "";

  return (
    <>
      <PageHeader
        title="Agents"
        description="Connect AI agents to Memorify through one hosted MCP endpoint."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadAgents} disabled={loading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => createAgent()} disabled={!!connecting || !workspaceId}>
              <Plus className="mr-2 h-4 w-4" />
              Connect agent
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <Alert className="border-primary/30 bg-primary/5">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Hosted MCP endpoint</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-xs text-foreground">{MCP_URL}</span>
            <Button variant="outline" size="sm" onClick={() => copyText(MCP_URL, "Endpoint copied")}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Copy URL
            </Button>
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Connect in two steps</CardTitle>
              <CardDescription>Choose the agent, generate the token, paste the config.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {CATALOG.map((item) => {
                  const Icon = item.icon;
                  const active = selectedKind === item.kind;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => selectKind(item.kind)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition-colors hover:border-primary/50",
                        active ? "border-primary bg-primary/5" : "border-border bg-background",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Icon className={cn("h-5 w-5", item.accent)} />
                        {active && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.tagline}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Agent name</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Claude Code"
                  />
                </div>
                <Button onClick={() => createAgent()} disabled={!!connecting || !workspaceId} className="sm:min-w-40">
                  {connecting ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Generate token
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Status</CardTitle>
              <CardDescription>Workspace connection state.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Workspace</span>
                <Badge variant={workspaceId ? "secondary" : "destructive"}>{workspaceId ? "Ready" : "Missing"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Connected</span>
                <span className="font-mono">{connected.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Endpoint</span>
                <Badge variant="outline">Netlify MCP</Badge>
              </div>
              <Separator />
              <p className="break-all font-mono text-xs text-muted-foreground">{workspaceId || "No active Clerk organization"}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="connected" className="space-y-4">
          <TabsList>
            <TabsTrigger value="connected">Connected</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="space-y-3">
            {connected.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <h3 className="text-base font-semibold">No agents connected yet</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  Generate a token for Claude Code, Codex, GitHub Copilot, or a custom MCP client.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-card">
                {connected.map((agent) => {
                  const meta = kindMeta(agent.kind);
                  const Icon = meta.icon;
                  const fresh = freshTokens[agent.id];
                  const tested = testState[agent.id];
                  const renaming = renamingId === agent.id;
                  return (
                    <div
                      key={agent.id}
                      className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[28px_minmax(0,1fr)_auto] md:items-center"
                    >
                      <Icon className={cn("h-5 w-5", meta.accent)} />
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
                            />
                            <Button size="sm" onClick={() => renameAgent(agent)}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{agent.name}</span>
                            <Badge variant="secondary" className="capitalize">{agent.status}</Badge>
                            {fresh && <Badge variant="outline">Token shown once</Badge>}
                            {tested && <Badge variant={tested.ok ? "secondary" : "destructive"}>{tested.label}</Badge>}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{meta.name}</span>
                          <span>Last seen: {relativeDate(agent.last_seen_at)}</span>
                          <span className="font-mono">{agent.id.slice(0, 8)}</span>
                          {fresh && <span className="font-mono">{redactToken(fresh.token)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button variant="outline" size="sm" onClick={() => setWizardAgent(agent)}>
                          <Clipboard className="mr-2 h-3.5 w-3.5" />
                          Setup
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => mintToken(agent)}>
                          <KeyRound className="mr-2 h-3.5 w-3.5" />
                          Token
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testMcp(agent)}
                          disabled={!freshTokens[agent.id] || testingId === agent.id}
                        >
                          {testingId === agent.id ? (
                            <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wifi className="mr-2 h-3.5 w-3.5" />
                          )}
                          Test
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
                          <span className="sr-only">Rename</span>
                          <span className="text-xs font-semibold">Aa</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => disconnectAgent(agent)} aria-label="Disconnect agent">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="library">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CATALOG.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.kind}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Icon className={cn("h-5 w-5", item.accent)} />
                        <Badge variant={item.ready ? "secondary" : "outline"}>{item.ready ? "Ready" : "Soon"}</Badge>
                      </div>
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <CardDescription>{item.tagline}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="min-h-16 text-sm text-muted-foreground">{item.description}</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => createAgent(item.kind)} disabled={!!connecting || !workspaceId}>
                          <Plus className="mr-2 h-3.5 w-3.5" />
                          Connect
                        </Button>
                        {item.installUrl && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={item.installUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-3.5 w-3.5" />
                              {item.installLabel ?? "Install"}
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 text-sm font-medium">Next agents</div>
              <div className="flex flex-wrap gap-2">
                {COMING_SOON.map((label) => (
                  <Badge key={label} variant="outline">{label}</Badge>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!wizardAgent} onOpenChange={(open) => !open && setWizardAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{wizardAgent ? `Connect ${wizardAgent.name}` : "Connect agent"}</DialogTitle>
            <DialogDescription>
              Token secrets are only visible right after generation. Generate a new one if this dialog has no token.
            </DialogDescription>
          </DialogHeader>
          {wizardAgent && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="text-xs uppercase text-muted-foreground">Endpoint</div>
                  <div className="mt-1 break-all font-mono text-sm">{MCP_URL}</div>
                </div>
                <Button variant="outline" onClick={() => copyText(MCP_URL, "Endpoint copied")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy URL
                </Button>
              </div>

              {wizardToken ? (
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-xs uppercase text-muted-foreground">Connection secret</div>
                    <div className="mt-1 text-sm font-medium">Token stored in downloadable JSON file</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{redactToken(wizardToken)}</div>
                  </div>
                  <div className="space-y-2">
                    <Label>Auth type</Label>
                    <Select
                      value={wizardAuthType}
                      onValueChange={(v) => setWizardAuthType(v as "bearer" | "oauth")}
                    >
                      <SelectTrigger><SelectValue placeholder="Bearer token" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bearer">Bearer token (default)</SelectItem>
                        <SelectItem value="oauth">OAuth 2.0 (for Gemini, etc.)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => downloadConnectionFile(wizardAgent, wizardAuthType)}>
                    <Download className="mr-2 h-4 w-4" />
                    Download JSON
                  </Button>
                </div>
              ) : (
                <Alert>
                  <KeyRound className="h-4 w-4" />
                  <AlertTitle>No visible token for this agent</AlertTitle>
                  <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>Create a fresh token for this agent. The old tokens stay valid until revoked.</span>
                    <Button size="sm" onClick={() => mintToken(wizardAgent)}>
                      <KeyRound className="mr-2 h-3.5 w-3.5" />
                      Generate token
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue={wizardAgent.kind === "custom" ? "custom" : wizardAgent.kind} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="custom">Custom</TabsTrigger>
                  <TabsTrigger value="claude_code">Claude Code</TabsTrigger>
                  <TabsTrigger value="github_copilot">Cursor</TabsTrigger>
                  <TabsTrigger value="openai_codex">VS Code</TabsTrigger>
                </TabsList>

                <TabsContent value="custom" className="mt-4 space-y-4">
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm font-medium mb-1">Custom App Integration</div>
                    <div className="text-xs text-muted-foreground mb-4">
                      Enter these credentials exactly as shown into the app's (e.g., Grok) integration settings.
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs font-semibold mb-1 uppercase text-muted-foreground">1. Endpoint URL</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs font-mono">{MCP_URL}/sse</code>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => copyText(`${MCP_URL}/sse`, "Endpoint URL copied")}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <div className="text-xs font-semibold mb-1 uppercase text-muted-foreground">2. Authentication Type</div>
                        <code className="rounded bg-muted px-2 py-1 text-xs font-mono">OAuth 2.0</code> <span className="text-xs text-muted-foreground mx-1">or</span> <code className="rounded bg-muted px-2 py-1 text-xs font-mono">Bearer Token</code>
                      </div>

                      <div>
                        <div className="text-xs font-semibold mb-1 uppercase text-muted-foreground">3. Agent Token / Client Secret</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 rounded bg-muted px-2 py-1.5 text-xs font-mono">
                            {showToken ? wizardToken : redactToken(wizardToken)}
                          </code>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => {
                            setShowToken(!showToken);
                            if (!showToken && wizardToken) copyText(wizardToken, "Token copied");
                          }}>
                            {showToken ? <Copy className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="claude_code" className="mt-4 space-y-3">
                  <div className="text-sm font-medium">Claude Code CLI</div>
                  <p className="text-xs text-muted-foreground">Run this exact command in your terminal to connect Claude Code to this agent.</p>
                  <Textarea readOnly value={configFor("claude_code", wizardToken, true)} className="min-h-24 font-mono text-xs" />
                  <Button variant="outline" onClick={() => copyText(configFor("claude_code", wizardToken, false), "Claude Code command copied")} disabled={!wizardToken}>
                    <Terminal className="mr-2 h-4 w-4" /> Copy Command
                  </Button>
                </TabsContent>

                <TabsContent value="github_copilot" className="mt-4 space-y-3">
                  <div className="text-sm font-medium">Cursor IDE</div>
                  <p className="text-xs text-muted-foreground">Add this to your <code>cursor-mcp.json</code> or paste it in the MCP Settings.</p>
                  <Textarea readOnly value={configFor("github_copilot", wizardToken, true)} className="min-h-32 font-mono text-xs" />
                  <Button variant="outline" onClick={() => copyText(
                    JSON.stringify({ mcpServers: { memorify: { url: getMcpUrl(), headers: { Authorization: `Bearer ${wizardToken}` } } } }, null, 2),
                    "Cursor config copied"
                  )} disabled={!wizardToken}>
                    <LayoutGrid className="mr-2 h-4 w-4" /> Copy JSON
                  </Button>
                </TabsContent>

                <TabsContent value="openai_codex" className="mt-4 space-y-3">
                  <div className="text-sm font-medium">Roo Code / VS Code</div>
                  <p className="text-xs text-muted-foreground">Add this to your <code>cline_mcp_settings.json</code> or Roo Code settings.</p>
                  <Textarea readOnly value={configFor("openai_codex", wizardToken, true)} className="min-h-24 font-mono text-xs" />
                  <Button variant="outline" onClick={() => copyText(
                    `[mcp_servers.memorify]\nurl = "${getMcpUrl()}"\nheaders = { Authorization = "Bearer ${wizardToken}" }`,
                    "VS Code config copied"
                  )} disabled={!wizardToken}>
                    <Code className="mr-2 h-4 w-4" /> Copy TOML
                  </Button>
                </TabsContent>
              </Tabs>

              <div className="flex items-center gap-2 pt-2">
                <Button onClick={() => testMcp(wizardAgent)} disabled={!wizardToken || testingId === wizardAgent.id} className="w-full sm:w-auto">
                  {testingId === wizardAgent.id ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                  Test Connection
                </Button>
              </div>

              {testState[wizardAgent.id] && (
                <Alert variant={testState[wizardAgent.id].ok ? "default" : "destructive"}>
                  <Wifi className="h-4 w-4" />
                  <AlertTitle>{testState[wizardAgent.id].label}</AlertTitle>
                  {testState[wizardAgent.id].detail && (
                    <AlertDescription className="break-all font-mono text-xs">
                      {testState[wizardAgent.id].detail}
                    </AlertDescription>
                  )}
                </Alert>
              )}
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
