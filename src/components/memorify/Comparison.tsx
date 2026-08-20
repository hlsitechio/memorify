import { Fragment } from "react";
import { Check, X, Minus, HelpCircle } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const features = [
  {
    category: "Setup & Integration",
    items: [
      { name: "Time to first memory", memorify: "2 min", mcp: "2-4 weeks", custom: "8+ weeks" },
      { name: "Protocols supported", memorify: "HTTP + WS + MCP", mcp: "MCP only", custom: "Custom" },
      { name: "Auth for agents", memorify: "mem_live_ tokens (HMAC)", mcp: "Per-server OAuth", custom: "Build it" },
      { name: "Workspace isolation", memorify: "Native (Clerk orgs)", mcp: "Manual namespace", custom: "Build it" },
    ],
  },
  {
    category: "Memory & Knowledge",
    items: [
      { name: "Native memory (episodic/semantic)", memorify: "Yes", mcp: "Vector only", custom: "Build it" },
      { name: "Long-term persistence", memorify: "Yes (Postgres)", mcp: "Depends on server", custom: "Build it" },
      { name: "Version history", memorify: "Built-in", mcp: "No", custom: "Build it" },
      { name: "Semantic + full-text search", memorify: "Yes (pgvector + tsvector)", mcp: "Semantic only", custom: "Build it" },
      { name: "Cross-agent context bus", memorify: "Real-time (WebSocket)", mcp: "No", custom: "Build it" },
    ],
  },
  {
    category: "Tools & Connectors",
    items: [
      { name: "Built-in connectors", memorify: "8 (Slack, GitHub, Gmail, Notion, Stripe, Postgres, AgentMail, HTTP)", mcp: "0 (bring your own)", custom: "Build each" },
      { name: "OAuth handled", memorify: "Yes (Clerk + token vault)", mcp: "Per-connector", custom: "Per-connector" },
      { name: "Tool registration", memorify: "Dynamic via /v1", mcp: "Static manifest", custom: "Build it" },
      { name: "MCP server proxy", memorify: "Yes (fan-out)", mcp: "N/A", custom: "Build it" },
    ],
  },
  {
    category: "Observability & Ops",
    items: [
      { name: "Request logging", memorify: "Every call", mcp: "Server-dependent", custom: "Build it" },
      { name: "Replay / debug", memorify: "Built-in", mcp: "No", custom: "Build it" },
      { name: "Metrics (RPS, latency, errors)", memorify: "Real-time dashboard", mcp: "No", custom: "Build it" },
      { name: "Agent access control (RBAC)", memorify: "4 levels (read/write/both/full)", mcp: "No", custom: "Build it" },
      { name: "Audit trail", memorify: "Immutable events log", mcp: "No", custom: "Build it" },
    ],
  },
  {
    category: "Cost & Operations",
    items: [
      { name: "Monthly cost (start)", memorify: "$0 (free tier)", mcp: "$500+/mo (infra)", custom: "$2,000+/mo (team)" },
      { name: "Maintenance burden", memorify: "Zero (managed)", mcp: "High (10+ servers)", custom: "Very high" },
      { name: "Scaling", memorify: "Auto (Netlify Edge)", mcp: "Manual per server", custom: "Manual" },
      { name: "Vendor lock-in", memorify: "None (open protocol)", mcp: "MCP ecosystem", custom: "None (but custom)" },
    ],
  },
];

type CellValue = string | { value: string; tooltip?: string };

const Cell = ({ value, variant }: { value: CellValue; variant: "memorify" | "mcp" | "custom" }) => {
  if (typeof value === "object") {
    return (
      <td className="px-4 py-3 text-sm">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded font-mono text-xs ${
          variant === "memorify" ? "bg-primary/10 text-primary border border-primary/20" :
          variant === "mcp" ? "bg-amber/10 text-amber-500 border border-amber-500/20" :
          "bg-muted text-muted-foreground border border-border"
        }`}>
          {value.value}
          {value.tooltip && (
            <span title={value.tooltip}>
              <HelpCircle className="w-3 h-3 opacity-60" />
            </span>
          )}
        </span>
      </td>
    );
  }

  const isPositive = variant === "memorify";
  const isNegative = variant === "mcp" || variant === "custom";
  
  return (
    <td className="px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        {isPositive && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
        {isNegative && value === "No" && <X className="w-4 h-4 text-destructive flex-shrink-0" />}
        {isNegative && value !== "No" && value !== "Yes" && <Minus className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <span className={isPositive ? "text-foreground font-medium" : "text-muted-foreground"}>
          {value}
        </span>
      </div>
    </td>
  );
};

export const Comparison = () => {
  const { ref } = useScrollReveal({ delay: 100 });

  return (
    <section id="comparison" className="py-24 border-t border-border/50 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden />
      
      <div className="container relative">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-12 animate-in slide-in-from-bottom-4">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider uppercase">WHY MEMORIFY</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Replace the duct tape. <span className="text-gradient">Keep the agents.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Compare Memorify against MCP juggling and custom backends across every dimension that matters.
          </p>
        </div>

        {/* Column headers */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-4 py-3 text-left text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Capability
                </th>
                <th className="px-4 py-3 text-center text-xs font-mono uppercase tracking-wider text-primary">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    Memorify
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-mono uppercase tracking-wider text-amber-500">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    MCP Juggling
                  </div>
                </th>
                <th className="px-4 py-3 text-center text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                    Custom Backend
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((section, sectionIndex) => (
                <Fragment key={section.category}>
                  {/* Section header row */}
                  <tr className="bg-card/40 backdrop-blur border-y border-border/30">
                    <th colSpan={4} className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                      {section.category}
                    </th>
                  </tr>
                  {section.items.map((item, itemIndex) => (
                    <tr
                      key={item.name}
                      className={`border-b border-border/30 transition-colors ${
                        itemIndex % 2 === 0 ? "bg-background/30" : "bg-transparent"
                      } hover:bg-primary/5 animate-in slide-in-from-bottom-4`}
                      style={{ animationDelay: `${sectionIndex * 50 + itemIndex * 30}ms` }}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {item.name}
                      </td>
                      <Cell value={item.memorify} variant="memorify" />
                      <Cell value={item.mcp} variant="mcp" />
                      <Cell value={item.custom} variant="custom" />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-12 grid md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-4 delay-300">
          <div className="p-6 rounded-xl border border-primary/30 bg-primary/5 ring-primary-soft">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-5 h-5 text-primary" />
              <h3 className="font-semibold">Memorify</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              One endpoint. 8 connectors. Native memory. Real-time sync. Full observability. Zero maintenance.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-2">
              <X className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">MCP Juggling</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              10+ servers to host. Vector-only memory. No cross-agent sync. Per-connector OAuth. High maintenance.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-border bg-card/40">
            <div className="flex items-center gap-2 mb-2">
              <Minus className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Custom Backend</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              8+ weeks to build. You own everything — infra, auth, scaling, observability. Expensive to maintain.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};