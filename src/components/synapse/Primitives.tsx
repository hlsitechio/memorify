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

              <div className="relative h-40 rounded-lg border border-border/60 bg-background/40 overflow-hidden">
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
  // left: live "input" being typed; right: vector embedding grid pulsing;
  // bottom: stack of stored rows dropping in.
  const stored = [
    { t: "user prefers cyan accents", tag: "pref", d: "0s" },
    { t: "ships to EU only", tag: "rule", d: "1.1s" },
    { t: "API key rotated mar 8", tag: "event", d: "2.2s" },
  ];
  return (
    <div className="absolute inset-0 flex">
      {/* shimmer scan */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent animate-mem-shimmer" />

      {/* left: input + stack */}
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

      {/* right: vector embedding grid */}
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
        {/* dashed rings */}
        <div className="absolute inset-0 rounded-full border border-dashed border-primary/25" />
        <div className="absolute inset-3 rounded-full border border-dashed border-primary/15" />

        {/* hub */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-gradient-primary grid place-items-center text-[9px] font-mono font-bold text-primary-foreground glow-primary z-10">
          HUB
        </div>

        {/* spoke pulses converging into hub */}
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

        {/* static node labels positioned around */}
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
      {/* left agent */}
      <div className="flex flex-col items-center gap-1.5 z-10">
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/90 animate-sync-left">
          claude_code
        </div>
        <span className="text-[9px] text-muted-foreground">terminal</span>
      </div>

      {/* wire + packets */}
      <div className="relative flex-1 mx-3 h-10">
        {/* main wire */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        {/* packets both directions */}
        <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary glow-primary animate-packet" />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary-glow animate-packet"
          style={{ animationDelay: "0.8s" }}
        />
        <span
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary animate-packet"
          style={{ animationDelay: "1.6s", animationDirection: "reverse" }}
        />
        {/* state label */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-0.5 px-1.5 rounded bg-background border border-border text-[8.5px] text-primary">
          state.sync
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 text-[8.5px] text-muted-foreground animate-count-flicker">
          ~12ms
        </div>
      </div>

      {/* right agent */}
      <div className="flex flex-col items-center gap-1.5 z-10">
        <div className="px-2 py-1 rounded bg-secondary border border-border text-foreground/90 animate-sync-right">
          chatgpt_web
        </div>
        <span className="text-[9px] text-muted-foreground">browser</span>
      </div>

      {/* wave pulses behind */}
      <span className="absolute left-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave pointer-events-none" />
      <span
        className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-primary/60 animate-wave pointer-events-none"
        style={{ animationDelay: "1.3s" }}
      />
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
        {/* sweep highlight */}
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
      {/* metrics column */}
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
