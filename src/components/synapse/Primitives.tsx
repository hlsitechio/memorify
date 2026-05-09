import { Brain, GitBranch, Radio, Shield } from "lucide-react";

const items = [
  {
    icon: Brain,
    title: "Native memory",
    desc: "Long-term, episodic, and semantic memory queryable in natural language. Replaces Notion, Obsidian, and your half-broken vector DB.",
  },
  {
    icon: GitBranch,
    title: "Universal connectors",
    desc: "Link Gmail, Drive, Linear, Slack, GitHub once — every agent connected to your gateway can use them. Auth handled.",
  },
  {
    icon: Radio,
    title: "Real-time context bus",
    desc: "Same state, every agent. What Claude Code learns in your terminal, ChatGPT sees in your browser. Live.",
  },
  {
    icon: Shield,
    title: "Built-in observability",
    desc: "Every call logged, replayable, scoped. Inspect what your agents read, wrote, and did — not a black box.",
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
              className="group p-6 rounded-xl border border-border bg-card/40 backdrop-blur card-elevated hover:border-primary/30 transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center mb-4 group-hover:bg-primary/20 transition-colors">
                <it.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{it.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
