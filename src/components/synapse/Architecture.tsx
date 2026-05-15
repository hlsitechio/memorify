import { Brain, Database, FolderTree, Plug, Workflow, Wrench } from "lucide-react";

const services = [
  { icon: Brain, name: "memory", desc: "remember · recall · link" },
  { icon: FolderTree, name: "files", desc: "documents · voices · images" },
  { icon: Wrench, name: "skills", desc: "prompt · run · share" },
  { icon: Plug, name: "mcp", desc: "server + client · oauth 2.1" },
  { icon: Database, name: "vault", desc: "encrypted · scoped · audited" },
  { icon: Workflow, name: "agents", desc: "tokens · scopes · gateway" },
];

const agents = ["Claude Code", "Cursor", "ChatGPT", "Custom"];

export const Architecture = () => {
  return (
    <section className="py-24 border-t border-border/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh opacity-60" aria-hidden />
      <div className="container relative">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider">ARCHITECTURE</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            One gateway. Every agent.<br />
            <span className="text-muted-foreground">Every tool.</span>
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Agents row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
            {agents.map((a) => (
              <div
                key={a}
                className="px-4 py-4 rounded-lg border border-border bg-card/60 backdrop-blur text-center text-sm font-medium card-elevated"
              >
                {a}
              </div>
            ))}
          </div>

          {/* Connector lines */}
          <div className="flex justify-center my-2">
            <div className="relative h-16 w-px bg-gradient-to-b from-border via-primary to-border overflow-hidden">
              <div className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-primary to-transparent animate-scan" />
            </div>
          </div>

          {/* Gateway */}
          <div className="relative mb-2">
            <div className="absolute inset-0 bg-gradient-primary blur-2xl opacity-30" aria-hidden />
            <div className="relative px-6 py-5 rounded-xl border border-primary/40 bg-card backdrop-blur ring-primary-soft">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                  <span className="font-semibold">Memorify Gateway</span>
                  <span className="font-mono text-xs text-muted-foreground">{`{ agent, action, input }`}</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span className="px-2 py-0.5 rounded bg-secondary border border-border">MCP</span>
                  <span className="px-2 py-0.5 rounded bg-secondary border border-border">HTTP</span>
                  <span className="px-2 py-0.5 rounded bg-secondary border border-border">WS</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center my-2">
            <div className="h-10 w-px bg-gradient-to-b from-primary to-border" />
          </div>

          {/* Services */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {services.map((s) => (
              <div
                key={s.name}
                className="group p-4 rounded-lg border border-border bg-card/60 backdrop-blur card-elevated hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className="w-4 h-4 text-primary" />
                  <span className="font-mono text-sm">/{s.name}</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
