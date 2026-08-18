import { ArrowDown, ArrowRight, Radio } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemorifyStatus } from "@/hooks/useMemorifyStatus";

const agents = [
  { name: "Claude", src: "/logos/claude-ai-icon.svg", position: "mem-agent-node-0" },
  { name: "Cursor", src: "/logos/cursor_dark.svg", position: "mem-agent-node-1" },
  { name: "OpenAI", src: "/logos/openai_dark.svg", position: "mem-agent-node-2" },
  { name: "Copilot", src: "/logos/microsoft-copilot.svg", position: "mem-agent-node-3" },
  { name: "Hermes", src: "/logos/hermes.png", position: "mem-agent-node-4" },
  { name: "OpenCode", src: "/logos/opencode-dark.svg", position: "mem-agent-node-5" },
];

const agentStyle = (index: number) => ({
  "--agent-index": index,
  "--agent-angle": `${index * 60}deg`,
  "--agent-delay": `${index * -0.55}s`,
} as CSSProperties);

export const Hero = () => {
  const status = useMemorifyStatus();
  const toolCount = status.tools.length > 0 ? status.tools.length : "--";

  return (
    <section id="hero" className="mem-hero relative flex min-h-[92svh] overflow-hidden border-b border-white/10" aria-labelledby="hero-title">
      <img src="/brand/hero-banner-memorify-front-gate.png" alt="Memorify Hero Banner" className="mem-hero-image" fetchPriority="high" />
      <div className="mem-hero-wash" aria-hidden />
      <div className="mem-spectrum-field" aria-hidden />
      <div className="mem-site-grid absolute inset-0 opacity-35" aria-hidden />

      <div className="container relative z-10 flex flex-1 flex-col pb-10 pt-28 lg:pb-8 lg:pt-24">
        <div className="grid flex-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-4">
          <div className="max-w-[700px]">
            <a href="https://memorify.dev/api/health" target="_blank" rel="noreferrer" className="mem-live-badge mem-focus">
              <span className={`mem-status-dot ${status.state === "online" ? "is-online" : ""}`} />
              <span>{status.state === "online" ? "Production online" : status.state === "loading" ? "Checking production" : "Production endpoint"}</span>
              {status.latencyMs !== null && <span className="text-white/35">{status.latencyMs} ms</span>}
            </a>

            <h1 id="hero-title" className="mem-heading mt-7 max-w-[680px] text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
              Shared <span className="mem-gradient-text">memory and tools</span> for MCP-capable agents.
            </h1>
            <p className="mt-6 max-w-[610px] text-lg leading-8 text-slate-300 sm:text-xl">
              Memorify is a live MCP gateway and control plane. Agents connect once, recover workspace context, search knowledge, load skills, and call tools on connected external servers with enforced access levels.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/auth" className="mem-primary-button mem-focus h-12 px-5">
                Open Memorify
                <ArrowRight className="h-4 w-4" />
              </a>
              <a href="#protocol" className="mem-secondary-button mem-focus h-12 px-5">
                <Radio className="h-4 w-4 text-cyan-200" />
                View MCP endpoint
              </a>
            </div>

            <div className="mt-10 grid max-w-[620px] grid-cols-1 gap-4 border-y border-white/10 py-4 xs:grid-cols-3 xs:gap-0">
              <div>
                <p className="font-mono text-lg font-semibold text-white">{toolCount}</p>
                <p className="mt-1 text-xs text-slate-500">built-in MCP tools</p>
              </div>
              <div className="xs:border-l xs:border-white/10 xs:pl-5">
                <p className="font-mono text-sm font-semibold text-white">HTTP + MCP</p>
                <p className="mt-1 text-xs text-slate-500">one production origin</p>
              </div>
              <div className="xs:border-l xs:border-white/10 xs:pl-5">
                <p className="font-mono text-sm font-semibold text-white">mem_live_</p>
                <p className="mt-1 text-xs text-slate-500">agent-bound tokens</p>
              </div>
            </div>
          </div>

          <div className="mem-agent-network" aria-label="Examples of AI clients around the Memorify MCP gateway">
            <div className="mem-network-halo" aria-hidden />
            <div className="mem-network-ring mem-network-ring-one" aria-hidden />
            <div className="mem-network-ring mem-network-ring-two" aria-hidden />
            <div className="mem-network-spokes" aria-hidden>
              {agents.map((agent, index) => <span key={agent.name} style={agentStyle(index)} />)}
            </div>

            <div className="mem-network-core">
              <div className="mem-network-core-glow" aria-hidden />
              <span className="mem-hero-mark relative"><img src="/brand/logo/logo-gateway-mark.svg" alt="Memorify" loading="lazy" width="64" height="64" /></span>
              <div className="relative mt-3 text-center">
                <p className="text-sm font-semibold text-white">memorify.dev/mcp</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-cyan-200/65">streamable HTTP</p>
              </div>
            </div>

            {agents.map((agent, index) => (
              <div key={agent.name} className={`mem-agent-node ${agent.position}`} style={agentStyle(index)}>
                <span className="mem-agent-logo"><img src={agent.src} alt={agent.name} loading="lazy" width="32" height="32" /></span>
                <span>{agent.name}</span>
              </div>
            ))}
          </div>
        </div>

        <a href="#product" className="mem-focus mt-5 inline-flex w-fit items-center gap-2 rounded-sm font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-cyan-100">
          See the live platform
          <ArrowDown className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
};
