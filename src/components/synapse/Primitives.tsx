import { Brain, GitBranch, Radio, Shield } from "lucide-react";

const items = [
  {
    icon: Brain,
    title: "Native memory",
    desc: "Long-term, episodic, and semantic memory queryable in natural language. Replaces Notion, Obsidian, and your half-broken vector DB.",
    visual: <MemoryVisual />,
  },
  {
    icon: GitBranch,
    title: "Universal connectors",
    desc: "Link Gmail, Drive, Linear, Slack, GitHub once — every agent connected to your gateway can use them. Auth handled.",
    visual: <ConnectorsVisual />,
  },
  {
    icon: Radio,
    title: "Real-time context bus",
    desc: "Same state, every agent. What Claude Code learns in your terminal, ChatGPT sees in your browser. Live.",
    visual: <RealtimeVisual />,
  },
  {
    icon: Shield,
    title: "Built-in observability",
    desc: "Every call logged, replayable, scoped. Inspect what your agents read, wrote, and did — not a black box.",
    visual: <ObservabilityVisual />,
  },
];

export const Primitives = () => {
  return (
    <section id="primitives" className="py-24 border-t border-border/50">
      <div className="container">
        <div className="max-w-2xl mx-auto mb-16 text-center">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider">PRIMITIVES</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            What Supabase did for apps,<br />
            <span className="text-muted-foreground">Synapse does for agents.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {items.map((it) => (
            <div
              key={it.title}
              className="group p-6 rounded-xl border border-border bg-card/40 backdrop-blur card-elevated hover:border-primary/40 transition-all overflow-hidden"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-accent grid place-items-center group-hover:bg-primary/20 transition-colors">
                  <it.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1.5">{it.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{it.desc}</p>
                </div>
              </div>

              <div className="relative h-36 rounded-lg border border-border/60 bg-background/40 overflow-hidden">
                {it.visual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ---------- Visuals ---------- */

function MemoryVisual() {
  const rows = [
    { t: "user prefers cyan accents", tag: "preference", d: "0s" },
    { t: "shipping to EU only", tag: "rule", d: "1.1s" },
    { t: "API key rotated mar 8", tag: "event", d: "2.2s" },
  ];
  return (
    <div className="absolute inset-0 p-3 flex flex-col justify-end gap-1.5 font-mono text-[10px]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-mem-shimmer" />
      {rows.map((r, i) => (
        <div
          key={i}
          style={{ animationDelay: r.d }}
          className="animate-mem-drop flex items-center gap-2 px-2.5 py-1.5 rounded bg-secondary/60 border border-border/60"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          <span className="truncate flex-1 text-foreground/85">{r.t}</span>
          <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[9px]">{r.tag}</span>
        </div>
      ))}
    </div>
  );
}

function ConnectorsVisual() {
  const nodes = ["Gmail", "Drive", "Linear", "Slack", "GitHub"];
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative w-32 h-32">
        {/* hub */}
        <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-gradient-primary grid place-items-center text-[9px] font-mono font-bold text-primary-foreground glow-primary">
          HUB
        </div>
        {/* orbit ring */}
        <div className="absolute inset-0 rounded-full border border-primary/20" />
        {/* orbiting nodes */}
        {nodes.map((n, i) => (
          <div
            key={n}
            className="absolute top-1/2 left-1/2 w-0 h-0"
            style={{ animation: `orbit 14s linear infinite`, animationDelay: `${-i * 2.8}s` }}
          >
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-secondary border border-border text-[9px] font-mono text-foreground/80 whitespace-nowrap"
              style={{ transform: `translate(-50%, -50%) translateX(56px)` }}
            >
              {n}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RealtimeVisual() {
  return (
    <div className="absolute inset-0 px-4 flex items-center justify-between font-mono text-[10px]">
      {/* left agent */}
      <div className="relative">
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/80">claude_code</div>
        <span className="absolute -right-1 top-1/2 w-2 h-2 rounded-full bg-primary -translate-y-1/2" />
      </div>

      {/* wire */}
      <div className="relative flex-1 mx-3 h-px bg-border">
        <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary glow-primary animate-packet" />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary-glow animate-packet"
          style={{ animationDelay: "1.3s", animationDirection: "reverse" }}
        />
      </div>

      {/* right agent */}
      <div className="relative">
        <span className="absolute -left-1 top-1/2 w-2 h-2 rounded-full bg-primary -translate-y-1/2" />
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/80">chatgpt_web</div>
      </div>

      {/* wave pulses behind */}
      <span className="absolute left-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave" />
      <span className="absolute right-6 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave" style={{ animationDelay: "1.3s" }} />
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
      {/* log stream */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 px-3 py-2 flex flex-col gap-1 font-mono text-[10px]">
          {logs.map((l, i) => (
            <div
              key={i}
              className="animate-log-stream flex items-center gap-2 whitespace-nowrap"
              style={{ animationDelay: l.d }}
            >
              <span className="text-muted-foreground">›</span>
              <span className="text-foreground/80">{l.c}</span>
              <span className={l.err ? "text-destructive" : "text-primary"}>{l.s}</span>
            </div>
          ))}
        </div>
      </div>
      {/* bars */}
      <div className="w-20 border-l border-border/60 px-2 flex items-end justify-between gap-0.5 py-3">
        {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5].map((h, i) => (
          <span
            key={i}
            className="flex-1 bg-primary/70 rounded-sm animate-tick"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
