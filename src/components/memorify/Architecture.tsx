import { useStaggeredReveal } from "@/hooks/useScrollReveal";

const lanes = [
  {
    number: "01",
    eyebrow: "State",
    title: "Memory that follows the session",
    description: "Remember, recall, update, list, and delete operations keep durable context available across agent sessions.",
    tokens: ["memory_remember", "memory_recall", "memory_update"],
    tone: "cyan",
  },
  {
    number: "02",
    eyebrow: "Knowledge",
    title: "Documents agents can actually search",
    description: "URL ingestion, extracted content, source and chunk metadata, full-text retrieval, and pgvector search.",
    tokens: ["documents_add_from_url", "documents_search", "documents_view"],
    tone: "blue",
  },
  {
    number: "03",
    eyebrow: "Extension",
    title: "Skills and external MCP servers",
    description: "Discover connected servers, inspect their tools, and proxy calls without rebuilding an integration in every client.",
    tokens: ["skills_run", "mcp_tools", "mcp_call"],
    tone: "violet",
  },
  {
    number: "04",
    eyebrow: "Control",
    title: "Identity, access, and an event trail",
    description: "Agent-bound tokens, gateway access levels, health checks, and event logging.",
    tokens: ["whoami", "agent_token_create", "events_log"],
    tone: "amber",
  },
];

export const Architecture = () => {
  const { containerRef, visibleIndices } = useStaggeredReveal(lanes.length, { threshold: 0.12 });

  return (
    <section id="architecture" className="relative overflow-hidden border-b border-white/10 bg-[#05060a] py-20 lg:py-28">
      <div className="mem-site-grid absolute inset-0 opacity-25" aria-hidden />
      <div className="mem-section-spectrum mem-section-spectrum-right" aria-hidden />
      <div className="container relative">
        <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
          <div>
            <p className="mem-kicker">The platform</p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.08] text-white sm:text-5xl">
              One connection. <span className="mem-gradient-text">Four systems</span> behind it.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-slate-400 lg:justify-self-end">
            Memorify keeps the agent-facing surface narrow while the production stack underneath handles state, retrieval, extension, and control.
          </p>
        </div>

        <div ref={containerRef} className="mt-14 border-y border-white/10">
          {lanes.map((lane, index) => (
            <article
              key={lane.number}
              className={`mem-platform-lane mem-platform-lane-${lane.tone} ${visibleIndices.has(index) ? "is-visible" : ""}`}
            >
              <div className="flex items-start gap-4">
                <span className="font-mono text-xs text-white/25">{lane.number}</span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{lane.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-semibold text-white sm:text-2xl">{lane.title}</h3>
                </div>
              </div>
              <p className="text-sm leading-7 text-slate-400 sm:text-base">{lane.description}</p>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {lane.tokens.map((token) => <span key={token} className="mem-tool-token">{token}</span>)}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-600">
          <span>Netlify Edge</span>
          <span>Neon Postgres + pgvector</span>
          <span>Clerk workspaces</span>
          <span>MCP JSON-RPC 2.0</span>
        </div>
      </div>
    </section>
  );
};
