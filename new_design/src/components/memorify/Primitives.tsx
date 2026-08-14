import { Brain, GitBranch, Radio, Shield, Users, Key, Cpu, Database, FolderTree, Plug, Workflow, Wrench } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const primitives = [
  {
    icon: Brain,
    title: "Native Memory",
    desc: "Long-term, episodic, and semantic memory queryable in natural language. Replaces Notion, Obsidian, and your half-broken vector DB.",
    visual: <MemoryVisual />,
    specs: ["Episodic + semantic memory", "Version history on every write", "Full-text + semantic search", "Namespaced isolation per agent"],
    metrics: { latency: "< 12ms p99", throughput: "142 rps", storage: "Unlimited" },
  },
  {
    icon: GitBranch,
    title: "Universal Connectors",
    desc: "Link Gmail, Drive, Linear, Slack, GitHub once — every agent connected to your gateway can use them. Auth handled.",
    visual: <ConnectorsVisual />,
    specs: ["15+ pre-built connectors", "OAuth 2.0 + token vault", "Auto token refresh", "Scoped permissions per agent"],
    metrics: { connectors: "15+", auth: "Managed", uptime: "99.9%" },
  },
  {
    icon: Radio,
    title: "Real-time Context Bus",
    desc: "Same state, every agent. What Claude Code learns in your terminal, ChatGPT sees in your browser. Live.",
    visual: <RealtimeVisual />,
    specs: ["WebSocket push to all agents", "Sub-12ms sync latency", "Conflict-free replication", "Offline-first with sync"],
    metrics: { sync: "< 12ms", agents: "Unlimited", delivery: "Guaranteed" },
  },
  {
    icon: Shield,
    title: "Built-in Observability",
    desc: "Every call logged, replayable, scoped. Inspect what your agents read, wrote, and did — not a black box.",
    visual: <ObservabilityVisual />,
    specs: ["Full request/response logging", "Replay any execution", "Real-time metrics dashboard", "Agent RBAC audit trail"],
    metrics: { retention: "90 days", query: "< 50ms", export: "JSON/CSV" },
  },
  {
    icon: Users,
    title: "Agent Identity & Auth",
    desc: "Clerk-powered identity for agents. Issue mem_live_ tokens with scoped access levels. Revoke instantly. Audit everything.",
    visual: <IdentityVisual />,
    specs: ["mem_live_ HMAC tokens", "4 access levels (read/write/both/full)", "Instant revocation", "Workspace isolation via Clerk orgs"],
    metrics: { issuance: "< 100ms", revocation: "Instant", audit: "Immutable" },
  },
];

// Visual components (same as before but enhanced)
function MemoryVisual() {
  const stored = [
    { t: "user prefers cyan accents", tag: "pref", d: "0s" },
    { t: "ships to EU only", tag: "rule", d: "1.1s" },
    { t: "API key rotated mar 8", tag: "event", d: "2.2s" },
  ];
  return (
    <div className="absolute inset-0 flex">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent animate-mem-shimmer" />
      <div className="flex-1 p-3 flex flex-col gap-1.5 font-mono text-[10px] min-w-0">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/80 border border-primary/30 mb-1">
          <span className="text-primary">›</span>
          <span className="overflow-hidden whitespace-nowrap text-foreground/90 inline-block animate-type-in border-r border-primary">
            remember("ships to EU only")
          </span>
        </div>
        <div className="flex flex-col gap-1 mt-auto">
          {stored.map((r, i) => (
            <div
              key={i}
              style={{ animationDelay: r.d }}
              className="animate-mem-drop flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/60 border border-border/60"
            >
              <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
              <span className="truncate flex-1 text-foreground/80">{r.t}</span>
              <span className="text-primary bg-primary/10 px-1 rounded text-[9px]">{r.tag}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="w-20 border-l border-border/60 p-2 grid grid-cols-4 gap-1 content-center">
        {Array.from({ length: 16 }).map((_, i) => (
          <span
            key={i}
            className="aspect-square rounded-sm bg-primary/70 animate-embed-pulse"
            style={{
              animationDelay: `${(i * 0.11).toFixed(2)}s`,
              opacity: 0.3 + ((i * 37) % 70) / 100,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectorsVisual() {
  const nodes = ["Gmail", "Drive", "Linear", "Slack", "GitHub"];
  const radius = 58;
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative w-36 h-36">
        <div className="absolute inset-0 rounded-full border border-dashed border-primary/25" />
        <div className="absolute inset-3 rounded-full border border-dashed border-primary/15" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gradient-primary grid place-items-center text-[9px] font-mono font-bold text-primary-foreground glow-primary z-10">
          HUB
        </div>
        {nodes.map((_, i) => {
          const angle = (i / nodes.length) * Math.PI * 2;
          const tx = Math.cos(angle) * radius;
          const ty = Math.sin(angle) * radius;
          return (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full bg-primary-glow animate-spoke-flow"
              style={{
                ["--tx" as string]: `${-tx}px`,
                ["--ty" as string]: `${-ty}px`,
                left: `calc(50% + ${tx}px)`,
                top: `calc(50% + ${ty}px)`,
                animationDelay: `${i * 0.45}s`,
              }}
            />
          );
        })}
        {nodes.map((n, i) => {
          const angle = (i / nodes.length) * Math.PI * 2;
          const tx = Math.cos(angle) * radius;
          const ty = Math.sin(angle) * radius;
          return (
            <div
              key={n}
              className="absolute px-1.5 py-0.5 rounded bg-secondary border border-border text-[9px] font-mono text-foreground/80 whitespace-nowrap -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc(50% + ${tx}px)`, top: `calc(50% + ${ty}px)` }}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RealtimeVisual() {
  return (
    <div className="absolute inset-0 px-4 flex items-center justify-between font-mono text-[10px]">
      <div className="flex flex-col items-center gap-1.5 z-10">
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/90 animate-sync-left">
          claude_code
        </div>
        <span className="text-[9px] text-muted-foreground">terminal</span>
      </div>
      <div className="relative flex-1 mx-3 h-10">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary glow-primary animate-packet" />
        <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary-glow animate-packet" style={{ animationDelay: "0.8s" }} />
        <span className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary animate-packet" style={{ animationDelay: "1.6s", animationDirection: "reverse" }} />
        <div className="absolute left-1/2 -translate-x-1/2 -top-0.5 px-1.5 rounded bg-background border border-border text-[8.5px] text-primary">
          state.sync
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 text-[8.5px] text-muted-foreground animate-count-flicker">
          ~12ms
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5 z-10">
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/90 animate-sync-right">
          chatgpt_web
        </div>
        <span className="text-[9px] text-muted-foreground">browser</span>
      </div>
      <span className="absolute left-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave pointer-events-none" />
      <span className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave pointer-events-none" style={{ animationDelay: "1.3s" }} />
    </div>
  );
}

function ObservabilityVisual() {
  const logs = [
    { c: "memory.remember", s: "200", d: "0s" },
    { c: "gmail.search", s: "200", d: "1s" },
    { c: "linear.create", s: "201", d: "2s" },
    { c: "memory.recall", s: "200", d: "3s" },
    { c: "drive.upload", s: "403", d: "4s", err: true },
    { c: "memory.list", s: "200", d: "5s" },
  ];
  return (
    <div className="absolute inset-0 flex">
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-sweep pointer-events-none" />
        <div className="absolute inset-0 px-3 py-2 flex flex-col gap-1 font-mono text-[10px]">
          {logs.map((l, i) => (
            <div
              key={i}
              className="animate-log-stream flex items-center gap-2 whitespace-nowrap"
              style={{ animationDelay: l.d }}
            >
              <span className="text-muted-foreground">›</span>
              <span className="text-foreground/80 flex-1 truncate">{l.c}</span>
              <span className={l.err ? "text-destructive" : "text-primary"}>{l.s}</span>
              <span className="text-muted-foreground/60 text-[9px]">
                {(8 + ((i * 13) % 40)).toString()}ms
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="w-24 border-l border-border/60 px-2 py-2 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[8.5px] font-mono text-muted-foreground">rps</span>
          <span className="text-[10px] font-mono text-primary animate-count-flicker">142</span>
        </div>
        <div className="flex-1 flex items-end justify-between gap-0.5">
          {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5, 0.75, 0.6].map((h, i) => (
            <span
              key={i}
              className="flex-1 bg-primary/70 rounded-sm animate-tick"
              style={{ height: `${h * 100}%`, animationDelay: `${i * 0.13}s` }}
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[8.5px] font-mono text-muted-foreground">p99</span>
          <span className="text-[10px] font-mono text-foreground/80">38ms</span>
        </div>
      </div>
    </div>
  );
}

function IdentityVisual() {
  const agents = [
    { name: "claude-prod", level: "full", status: "active" },
    { name: "cursor-dev", level: "both", status: "active" },
    { name: "chatgpt-web", level: "read", status: "active" },
    { name: "custom-bot", level: "write", status: "revoked" },
  ];
  return (
    <div className="absolute inset-0 p-3 flex flex-col gap-2 font-mono text-[10px]">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-secondary/80 border border-primary/30">
                <span className="text-primary">›</span>
                <span className="text-foreground/90 font-mono text-xs">{`agents.new({name: "prod-agent", level: "both"})`}</span>
              </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex flex-col gap-1.5">
          {agents.map((a, i) => (
            <div
              key={a.name}
              className={`flex items-center gap-2 px-2 py-1.5 rounded bg-secondary/60 border border-border/60 animate-in slide-in-from-bottom-4`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="w-2 h-2 rounded-full bg-primary/50 flex-shrink-0" />
              <span className="truncate flex-1 text-foreground/80">{a.name}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                a.level === "full" ? "bg-primary/20 text-primary" :
                a.level === "both" ? "bg-green-500/20 text-green-400" :
                a.level === "read" ? "bg-blue-500/20 text-blue-400" :
                "bg-amber-500/20 text-amber-400"
              }`}>
                {a.level}
              </span>
              <span className={`text-[9px] ${
                a.status === "active" ? "text-green-400" : "text-destructive"
              }`}>
                {a.status === "active" ? "●" : "○"} {a.status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/60 pt-2 grid grid-cols-2 gap-2 text-center">
        <div className="bg-secondary/50 rounded p-2">
          <div className="text-primary font-semibold text-lg animate-count-flicker">4</div>
          <div className="text-[9px] text-muted-foreground">Active Agents</div>
        </div>
        <div className="bg-secondary/50 rounded p-2">
          <div className="text-primary font-semibold text-lg animate-count-flicker">0</div>
          <div className="text-[9px] text-muted-foreground">Revoked</div>
        </div>
      </div>
    </div>
  );
}

export const Primitives = () => {
  const { ref, isVisible } = useScrollReveal({ delay: 100 });

  return (
    <section id="primitives" className="py-24 border-t border-border/50 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden />
      
      <div className="container relative">
        <div className="max-w-2xl mx-auto mb-16 text-center animate-in slide-in-from-bottom-4">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider uppercase">PRIMITIVES</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            The memory layer for<br />
            <span className="text-muted-foreground">agent-native apps.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {primitives.map((primitive, i) => (
            <div
              key={primitive.title}
              className="group relative p-6 rounded-xl border border-border/50 bg-card/40 backdrop-blur card-elevated hover:border-primary/40 transition-all overflow-hidden animate-in slide-in-from-bottom-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-accent grid place-items-center group-hover:bg-primary/20 transition-colors">
                  <primitive.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold mb-1.5">{primitive.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{primitive.desc}</p>
                </div>
              </div>

              <div className="relative h-44 rounded-lg border border-border/60 bg-background/40 overflow-hidden">
                {primitive.visual}
              </div>

              {/* Specs */}
              <div className="mt-4 pt-4 border-t border-border/30 space-y-2">
                {primitive.specs.map((spec, si) => (
                  <div key={si} className="flex items-center gap-2 text-xs text-muted-foreground/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
                    <span>{spec}</span>
                  </div>
                ))}
              </div>

              {/* Metrics */}
              <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-3 gap-2">
                {Object.entries(primitive.metrics).map(([key, value]) => (
                  <div key={key} className="text-center p-2 rounded-lg bg-secondary/30">
                    <div className="text-xs font-mono text-primary">{value}</div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{key}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Export section components for Index page
export const PrimitivesSection = () => <Primitives />;
