import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Terminal, Copy, Check, Plus, Trash2, Zap, Wifi, RefreshCw, ExternalLink, Sparkles, ShieldCheck, Activity, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Agent = {
  id: string;
  name: string;
  kind: string;
  status: "pending" | "connected" | "disconnected" | string;
  token: string;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const CATALOG = [
  {
    kind: "claude_code",
    name: "Claude Code",
    tagline: "Anthropic's terminal coding agent",
    description: "Connect Claude Code to this workspace as an MCP server — no ngrok, no local tunnel. Paste one command.",
    icon: Terminal,
    tone: "text-amber-400",
    featured: true,
  },
  { kind: "openai_codex", name: "OpenAI Codex CLI",  tagline: "Coming soon", description: "OpenAI's terminal coding agent.",          icon: Sparkles, tone: "text-emerald-400", featured: false },
  { kind: "cursor",       name: "Cursor",            tagline: "Coming soon", description: "Cursor MCP integration.",                  icon: Bot,      tone: "text-sky-400",     featured: false },
  { kind: "custom",       name: "Custom agent",      tagline: "Bring your own", description: "Any MCP-capable agent via the hosted URL + token.", icon: Zap, tone: "text-primary",     featured: false },
];

function endpointUrl() {
  // Public hosted ping endpoint — replaces the need for ngrok / local tunnels.
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-ping`;
}

function CopyField({ value, label, mono = true, multiline = false }: { value: string; label?: string; mono?: boolean; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label ?? "Copied"} to clipboard`);
    setTimeout(() => setCopied(false), 1400);
  };
  if (multiline) {
    return (
      <div className="relative rounded-md border border-border bg-secondary/40 overflow-hidden min-w-0 w-full">
        <pre className={cn("max-h-72 overflow-auto px-3 py-2 pr-12 text-[11px] leading-relaxed whitespace-pre-wrap break-words", mono && "font-mono")}>{value}</pre>
        <button
          onClick={copy}
          className="absolute top-1.5 right-1.5 rounded-md border border-border bg-background/80 backdrop-blur px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Copy"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-stretch rounded-md border border-border bg-secondary/40 overflow-hidden group min-w-0 w-full">
      <code className={cn("flex-1 min-w-0 px-3 py-2 text-xs truncate", mono && "font-mono")} title={value}>{value}</code>
      <button
        onClick={copy}
        className="px-3 shrink-0 border-l border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}


export default function Agents() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardId, setWizardId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setAgents((data as Agent[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime — flips status to "connected" the moment the agent pings.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`agents:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agents", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const connect = async (kind: string, name: string) => {
    if (!user) return;
    if (kind !== "claude_code" && kind !== "custom") {
      toast.info(`${name} support is coming soon.`);
      return;
    }
    const { data, error } = await supabase
      .from("agents")
      .insert({ user_id: user.id, kind, name, status: "pending" })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setWizardId((data as Agent).id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("agents").delete().eq("id", id);
    if (wizardId === id) setWizardId(null);
    toast.success("Agent removed");
    load();
  };

  const wizardAgent = useMemo(
    () => agents.find((a) => a.id === wizardId) ?? null,
    [agents, wizardId],
  );

  return (
    <>
      <PageHeader
        title="Agents"
        description="Connect AI agents to this workspace. No ngrok, no local tunnel — just a hosted URL and a token."
        actions={
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        }
      />
      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <Tabs defaultValue={agents.length ? "connected" : "library"} className="space-y-6">
          <TabsList>
            <TabsTrigger value="connected">
              Connected <Badge variant="secondary" className="ml-2">{agents.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="h-3.5 w-3.5 mr-1.5" /> Activity
            </TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="mt-0 space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : agents.length === 0 ? (
              <EmptyHero onConnect={() => connect("claude_code", "Claude Code")} />
            ) : (
              agents.map((a) => <AgentRow key={a.id} agent={a} onOpen={() => setWizardId(a.id)} onDelete={() => remove(a.id)} />)
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <ActivityFeed userId={user?.id} agents={agents} />
          </TabsContent>

          <TabsContent value="library" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATALOG.map((c) => {
                const Icon = c.icon;
                const available = c.kind === "claude_code" || c.kind === "custom";
                return (
                  <div key={c.kind} className={cn(
                    "relative rounded-lg border bg-card p-4 transition-all hover:border-primary/40",
                    c.featured ? "border-primary/40 shadow-sm" : "border-border"
                  )}>
                    {c.featured && (
                      <Badge className="absolute top-3 right-3 text-[10px]" variant="default">Featured</Badge>
                    )}
                    <div className={cn("h-10 w-10 rounded-md bg-secondary/60 flex items-center justify-center mb-3", c.tone)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold">{c.name}</div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">{c.tagline}</div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
                    <Button
                      size="sm"
                      className="w-full h-8 mt-4"
                      variant={available ? "default" : "outline"}
                      disabled={!available}
                      onClick={() => connect(c.kind, c.name)}
                    >
                      {available ? <><Plus className="h-3.5 w-3.5 mr-1.5" /> Connect</> : "Coming soon"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ConnectWizard
        agent={wizardAgent}
        onClose={() => setWizardId(null)}
      />
    </>
  );
}

function EmptyHero({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-gradient-to-b from-card to-card/30 p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-lg bg-gradient-primary flex items-center justify-center mb-4">
        <Terminal className="h-6 w-6 text-primary-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Bring your first AI agent online</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
        Connect Claude Code in one click. We give you a public HTTPS endpoint and a token — no ngrok, no tunnels, no port forwarding.
      </p>
      <div className="flex items-center justify-center gap-3 mt-5">
        <Button onClick={onConnect}>
          <Terminal className="h-4 w-4 mr-1.5" /> Connect Claude Code
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 max-w-2xl mx-auto text-left">
        <Feature icon={Zap}        title="Zero setup"      body="No ngrok, no local tunnel. The endpoint is already hosted." />
        <Feature icon={ShieldCheck} title="Token-scoped"    body="Each agent gets its own revocable token. Delete to disconnect." />
        <Feature icon={Wifi}       title="Live status"     body="Status flips to Connected the instant your agent calls in." />
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <Icon className="h-4 w-4 text-primary mb-1.5" />
      <div className="text-xs font-semibold">{title}</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function AgentRow({ agent, onOpen, onDelete }: { agent: Agent; onOpen: () => void; onDelete: () => void }) {
  const connected = agent.status === "connected";
  const last = agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleString() : "Never";
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 group hover:border-primary/30 transition-colors">
      <div className={cn(
        "h-10 w-10 rounded-md flex items-center justify-center shrink-0",
        connected ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground"
      )}>
        <Terminal className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold truncate">{agent.name}</div>
          <Badge variant={connected ? "default" : "secondary"} className={cn("text-[10px] gap-1", connected && "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground")} />
            {connected ? "Connected" : "Pending"}
          </Badge>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
          {agent.kind} · last seen {last}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onOpen}>
        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Setup
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ConnectWizard({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const open = !!agent;
  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const apiUrl = `${base}/agent-api`;
  const pingUrl = `${base}/agent-ping`;
  const token = agent?.token ?? "";

  const curlWhoami =
    `curl -s ${apiUrl} -H "Authorization: Bearer ${token}"`;
  const curlRemember =
    `curl -s -X POST ${apiUrl} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"memory.remember","params":{"content":"User prefers dark mode","tags":["preference"]}}'`;
  const curlRecall =
    `curl -s -X POST ${apiUrl} \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"memory.recall","params":{"query":"dark"}}'`;
  const mcpCmd = `claude mcp add synapse --transport http ${pingUrl}?token=${token}`;

  const systemPrompt = `You are connected to Synapse — a personal AI workspace shared with your human user. You have persistent memory, documents, skills, and an event timeline available via a simple HTTP API. Use it on every task.

## Your credentials
- Endpoint: ${apiUrl}
- Token:    ${token}
- Auth:     Authorization: Bearer <token>

## How to call any command
Run this in a bash tool:
\`\`\`bash
curl -s -X POST ${apiUrl} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"<ACTION>","params":{...}}'
\`\`\`
Every response is JSON: \`{ ok, action, result, agent }\` on success, or \`{ ok:false, error }\` on failure.

## First thing to do, ONCE per session
1. GET ${apiUrl} with your bearer token. If \`first_connection: true\`, carefully read the \`welcome\` markdown — it explains the platform.
2. Call \`memory.recall\` with no query to see the user's latest 10 memories. This gives you context about who they are and what they're working on.

## Available actions
- \`synapse.welcome\` — re-read the onboarding guide
- \`whoami\` — confirm identity
- \`memory.remember\` — params: { content, tags?, category?, namespace? }
- \`memory.recall\`   — params: { query?, limit?, category? }
- \`memory.update\`   — params: { id, content?, tags?, category? }
- \`memory.delete\`   — params: { id }
- \`documents.list\`  — params: { limit? }
- \`skills.list\`
- \`events.log\`      — params: { kind, payload?, source? }
- \`events.list\`     — params: { limit? }

## Rules of engagement
1. **Recall before answering.** At the start of any task, \`memory.recall\` with a relevant query.
2. **Remember what matters.** When the user states a preference, fact, decision, or context worth keeping — call \`memory.remember\` with descriptive tags (e.g. \`["preference"]\`, \`["project:synapse"]\`).
3. **Don't duplicate.** Recall first; if a similar memory exists, \`memory.update\` it instead of adding a new one.
4. **Log meaningful actions** with \`events.log\` (kind: \`"task_completed"\`, \`"file_generated"\`, etc.) so the user has an audit trail.
5. **Use namespaces** to separate contexts: \`default\`, \`work\`, \`personal\`, or per-project.
6. **Stay scoped.** Your token is bound to one user — everything you read/write belongs to them.

You're ready. Begin by running the GET request above to confirm the connection.`;


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl [&>*]:min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-amber-400" />
            Connect {agent?.name}
          </DialogTitle>
          <DialogDescription>
            Two ways to plug in. <span className="text-foreground font-medium">Direct API</span> is instant — no restart, no handshake.
          </DialogDescription>
        </DialogHeader>

        {agent && (
          <div className="space-y-4 min-w-0">
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
              <span className={cn(
                "h-2 w-2 rounded-full",
                agent.status === "connected" ? "bg-emerald-400 animate-pulse" : "bg-amber-400 animate-pulse"
              )} />
              <span className="text-xs">
                {agent.status === "connected" ? (
                  <>Connected · last seen {agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleTimeString() : "just now"}</>
                ) : (
                  <>Waiting for first ping…</>
                )}
              </span>
            </div>

            <Tabs defaultValue="prompt">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="prompt">
                  <Zap className="h-3.5 w-3.5 mr-1.5" /> System Prompt
                </TabsTrigger>
                <TabsTrigger value="api">Direct API</TabsTrigger>
                <TabsTrigger value="mcp">MCP</TabsTrigger>
              </TabsList>

              <TabsContent value="prompt" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">
                  Paste this into Claude Code (e.g. in your <code className="text-foreground">CLAUDE.md</code>) or any agent's system prompt. Token is already baked in — the agent will self-onboard and start using Synapse on its next message.
                </p>
                <CopyField value={systemPrompt} label="Agent system prompt" multiline />
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="text-primary font-medium">Keep token secret.</span> Anyone with this prompt has full read/write access to your Synapse data.
                </div>
              </TabsContent>

              <TabsContent value="api" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Endpoint</label>
                  <CopyField value={apiUrl} label="Endpoint" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Bearer token (keep secret)</label>
                  <CopyField value={token} label="Token" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">List commands + whoami</label>
                  <CopyField value={curlWhoami} label="whoami" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Store a memory</label>
                  <CopyField value={curlRemember} label="memory.remember" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Recall</label>
                  <CopyField value={curlRecall} label="memory.recall" />
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  <span className="text-primary font-medium">Tip:</span> any agent (Claude Code via bash, scripts, your own tools) can call this with no restart. Available actions: <code className="text-foreground">whoami</code>, <code className="text-foreground">memory.remember/recall/update/delete</code>, <code className="text-foreground">documents.list</code>, <code className="text-foreground">skills.list</code>, <code className="text-foreground">events.log/list</code>.
                </div>
              </TabsContent>

              <TabsContent value="mcp" className="space-y-3 mt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">1. Register MCP server</label>
                  <CopyField value={mcpCmd} label="MCP install" />
                  <p className="text-[11px] text-muted-foreground">Restart Claude Code afterward — MCP servers only load at startup.</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
