import { AlertTriangle, Database, Server, HardDrive, Layers, Link2, Zap, GitBranch, Globe, Key, Code2 } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const backends = [
  { icon: Database, name: "PostgreSQL", pain: "Structured state — wrong dialect for LLMs", color: "border-blue-500/30 bg-blue-500/5" },
  { icon: Server, name: "Pinecone/Weaviate", pain: "Vector search only — no episodic memory", color: "border-green-500/30 bg-green-500/5" },
  { icon: HardDrive, name: "S3 / R2", pain: "File storage — no indexing or search", color: "border-amber-500/30 bg-amber-500/5" },
  { icon: Layers, name: "Notion / Obsidian", pain: "Notes apps — not agent memory", color: "border-purple-500/30 bg-purple-500/5" },
  { icon: Zap, name: "Redis", pain: "Cache layer — ephemeral, not durable", color: "border-red-500/30 bg-red-500/5" },
  { icon: Link2, name: "10+ MCP Servers", pain: "Each with own auth, config, hosting", color: "border-cyan-500/30 bg-cyan-500/5" },
  { icon: GitBranch, name: "Per-app OAuth", pain: "Gmail, Drive, Linear, Slack — repeated", color: "border-pink-500/30 bg-pink-500/5" },
  { icon: Code2, name: "Custom glue code", pain: "Brittle, undocumented, you maintain it", color: "border-orange-500/30 bg-orange-500/5" },
];

export const Problem = () => {
  const { ref, isVisible } = useScrollReveal({ delay: 100 });

  return (
    <section id="problem" className="py-24 border-t border-border/50 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 bg-mesh opacity-40" aria-hidden />
      
      <div className="container relative">
        <div className="grid lg:grid-cols-2 gap-12 items-start max-w-7xl mx-auto">
          {/* Left: Narrative */}
          <div className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8"}`}>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-destructive mb-4 animate-in slide-in-from-bottom-4">
              <AlertTriangle className="w-3.5 h-3.5" />
              The current state of agent infrastructure
            </div>
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
              Every agent today is duct-taped to <span className="text-muted-foreground/60">ten different backends.</span>
            </h2>
            <p className="mt-6 text-muted-foreground text-lg leading-relaxed">
              Cursor, Claude Code, and OpenCode all ship a great agent — then ask you to wire it up to Postgres, vector DBs,
              Notion, Obsidian, Drive, and a dozen MCP servers. SQL is the wrong dialect for an LLM. Notes apps are not memory.
            </p>
            <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
              Memorify replaces all of that with one gateway and one verb-based protocol.
            </p>
            
            {/* Stats */}
            <div className="mt-10 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur">
                <p className="text-3xl font-semibold text-primary font-mono">47</p>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">avg config files per agent setup</p>
              </div>
              <div className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur">
                <p className="text-3xl font-semibold text-primary font-mono">2-4</p>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">weeks to wire a new agent</p>
              </div>
              <div className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur">
                <p className="text-3xl font-semibold text-primary font-mono">10+</p>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">separate services to maintain</p>
              </div>
              <div className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur">
                <p className="text-3xl font-semibold text-primary font-mono">1</p>
                <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">endpoint with Memorify</p>
              </div>
            </div>
          </div>

          {/* Right: Animated diagram */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-radial blur-2xl opacity-30" aria-hidden />
            
            {/* Agent in center */}
            <div className="relative flex justify-center mb-8 animate-in slide-in-from-bottom-4 delay-200">
              <div className="relative z-10">
                <div className="w-20 h-20 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-2xl ring-primary-soft animate-pulse-glow-slow">
                  <Code2 className="w-10 h-10 text-primary-foreground" />
                </div>
                <p className="mt-3 text-center font-mono text-sm text-muted-foreground">Your Agent</p>
                <p className="text-center text-xs text-muted-foreground/60">(Claude Code, Cursor, ChatGPT, Custom)</p>
              </div>
            </div>

            {/* Connections to backends - animated lines */}
            <svg 
              className="w-full h-96" 
              viewBox="0 0 800 600" 
              preserveAspectRatio="none"
              style={{ transformOrigin: "center" }}
              aria-hidden
            >
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                </marker>
                <linearGradient id="grad-conn-1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.6" />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity="0.6" />
                </linearGradient>
              </defs>
              
              {/* Backend positions around agent */}
              {backends.map((backend, i) => {
                const angle = (i / backends.length) * Math.PI * 2 - Math.PI / 2;
                const radius = 260;
                const centerX = 400;
                const centerY = 300;
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                
                return (
                  <g key={backend.name} className={`animate-connection-${i}`} style={{ animationDelay: `${i * 0.15}s` }}>
                    {/* Connection line */}
                    <line
                      x1={centerX}
                      y1={centerY}
                      x2={x}
                      y2={y}
                      stroke="url(#grad-conn-1)"
                      strokeWidth="2"
                      strokeDasharray="8,4"
                      className="animate-dash-flow"
                      markerEnd="url(#arrowhead)"
                    />
                    
                    {/* Backend node */}
                    <g className="backend-node">
                      <circle
                        cx={x}
                        cy={y}
                        r="50"
                        fill="hsl(var(--card))"
                        stroke="hsl(var(--border))"
                        strokeWidth="1.5"
                        className="animate-pop-in"
                      />
                      <text
                        x={x}
                        y={y - 10}
                        textAnchor="middle"
                        className="font-mono text-[10px] text-foreground/80"
                        dominantBaseline="middle"
                      >
                        {backend.name.split(" ")[0]}
                      </text>
                      <text
                        x={x}
                        y={y + 12}
                        textAnchor="middle"
                        className="font-mono text-[9px] text-destructive/70"
                        dominantBaseline="middle"
                      >
                        ✗
                      </text>
                    </g>
                  </g>
                );
              })}
              
              {/* Center agent circle */}
              <circle
                cx={400}
                cy={300}
                r="70"
                fill="hsl(var(--primary) / 0.15)"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                className="animate-pulse-ring"
              />
              <text
                x={400}
                y={295}
                textAnchor="middle"
                className="font-mono text-[11px] text-primary font-semibold"
              >
                AGENT
              </text>
              <text
                            x={400}
                            y={315}
                            textAnchor="middle"
                            className="font-mono text-[9px] text-muted-foreground"
                          >
                            {`{ agent, action, input }`}
              </text>
            </svg>

            {/* Legend */}
            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              {backends.map((backend, i) => (
                <div 
                  key={backend.name}
                  className={`flex items-center gap-2 p-2 rounded-lg border bg-card/40 backdrop-blur transition-all ${backend.color} animate-in slide-in-from-bottom-4`}
                  style={{ animationDelay: `${0.8 + i * 0.05}s` }}
                >
                  <backend.icon className="w-3.5 h-3.5" />
                  <span className="font-mono truncate">{backend.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
