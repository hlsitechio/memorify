import type { CSSProperties } from "react";
import { useStaggeredReveal } from "@/hooks/useScrollReveal";

const groups = [
  {
    id: "memory",
    index: "01",
    label: "Memory",
    title: "Persistent state across sessions.",
    description: "Agents can remember, recall, update, list, and remove durable context through five focused memory operations.",
    tools: ["memory_remember", "memory_recall", "memory_update", "memory_list", "memory_delete"],
    detail: ["remember / recall / update", "list / delete", "namespace + scope metadata"],
    color: "cyan",
    accentClass: "text-cyan-200",
  },
  {
    id: "knowledge",
    index: "02",
    label: "Knowledge",
    title: "Files become searchable context.",
    description: "Import documents from URLs, extract and chunk their content, then search across documents and memories using hybrid retrieval.",
    tools: ["documents_add_from_url", "documents_search", "documents_view", "documents_list", "vector_search"],
    detail: ["full-text + pgvector", "hybrid semantic search", "source + chunk metadata"],
    color: "blue",
    accentClass: "text-blue-200",
  },
  {
    id: "extension",
    index: "03",
    label: "Extension",
    title: "One doorway to more tools.",
    description: "Load workspace skills or discover and call tools on connected MCP servers through Memorify's transparent proxy.",
    tools: ["skills_list", "skills_get", "skills_run", "mcp_servers", "mcp_tools", "mcp_call"],
    detail: ["dynamic tool discovery", "external MCP proxy", "workspace skill registry"],
    color: "violet",
    accentClass: "text-violet-200",
  },
  {
    id: "control",
    index: "04",
    label: "Control",
    title: "Know which agent did what.",
    description: "Identity, access levels, agent-bound tokens, event logging, and health visibility turn agent activity into an inspectable system.",
    tools: ["whoami", "agents_bootstrap", "events_log", "events_list", "agent_token_create", "agent_token_revoke", "agent_token_list"],
    detail: ["mem_live_ agent tokens", "read / write / both / full", "token revocation"],
    color: "amber",
    accentClass: "text-amber-200",
  },
];

export const Primitives = () => {
  const { containerRef, visibleIndices } = useStaggeredReveal(groups.length, { threshold: 0.12 });

  return (
    <section id="primitives" className="relative overflow-hidden border-b border-white/10 bg-[#06070c] py-20 lg:py-28">
      <div className="mem-section-spectrum mem-section-spectrum-center" aria-hidden />
      <div className="container relative">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-end lg:gap-20">
          <div>
            <p className="mem-kicker">Built-in capabilities</p>
            <h2 className="mem-heading mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              Core agent infrastructure, <span className="mem-gradient-text">behind one endpoint.</span>
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-slate-400 lg:pb-1">
            Memorify gives agents durable context, searchable knowledge, extensible tools, and accountable access through one coherent surface.
          </p>
        </div>

        <div ref={containerRef} className="mem-capability-field mt-16">
          {groups.map((group, groupIndex) => (
            <article
              key={group.id}
              className={`mem-capability-column mem-capability-column-${group.color} ${visibleIndices.has(groupIndex) ? "is-visible" : ""}`}
              style={{ "--capability-index": groupIndex } as CSSProperties}
            >
              <span className="mem-capability-ghost" aria-hidden>{group.index}</span>
              <div className="mem-capability-column-head">
                <span>{group.index}</span>
                <p className={group.accentClass}>{group.label}</p>
              </div>
              <h3>{group.title}</h3>
              <p className="mem-capability-description">{group.description}</p>
              <div className="mem-capability-tools" aria-label={`${group.label} tools`}>
                {group.tools.map((tool) => <code key={tool}>{tool}</code>)}
              </div>
              <div className="mem-capability-details">
                {group.detail.map((item) => <span key={item}>{item}</span>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export const PrimitivesSection = () => <Primitives />;
