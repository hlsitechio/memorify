import { Check, Copy, ExternalLink, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

const stages = [
  {
    label: "Initialize",
    method: "initialize",
    request: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize"
}`,
    resultLabel: "Connection ready",
    resultItems: ["memorify", "JSON-RPC 2.0", "tool discovery enabled"],
    tone: "cyan",
  },
  {
    label: "Discover",
    method: "tools/list",
    request: `{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}`,
    resultLabel: "23 built-in tools",
    resultItems: ["memory_remember", "documents_search", "skills_run", "mcp_call"],
    tone: "blue",
  },
  {
    label: "Bootstrap",
    method: "agents_bootstrap",
    request: `{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "agents_bootstrap"
  }
}`,
    resultLabel: "Agent context returned",
    resultItems: ["identity ready", "memory ready", "skills ready", "events ready"],
    tone: "violet",
  },
  {
    label: "Search",
    method: "documents_search",
    request: `{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "documents_search",
    "arguments": {
      "query": "launch decisions"
    }
  }
}`,
    resultLabel: "Context found",
    resultItems: ["document results", "hybrid retrieval", "source + chunk metadata"],
    tone: "amber",
  },
];

export const Protocol = () => {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const stage = stages[active];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % stages.length), 4300);
    return () => window.clearInterval(timer);
  }, []);

  const copyRequest = async () => {
    await navigator.clipboard.writeText(stage.request);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section id="protocol" className="relative overflow-hidden border-b border-white/[0.06] bg-[#080912] py-20 lg:py-28">
      <div className="mem-protocol-glow" aria-hidden />
      <div className="container relative">
        <div className="grid gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:items-center">
          <div>
            <p className="mem-kicker">Production MCP endpoint</p>
            <h2 className="mem-heading mt-5 text-4xl font-semibold leading-[1.08] sm:text-5xl">
              One endpoint from an agent to <span className="mem-gradient-text-alt">useful context.</span>
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
              One Streamable HTTP endpoint accepts discovery, context recovery, search, and tool calls.
            </p>

            <a href="https://memorify.dev/mcp" target="_blank" rel="noreferrer" className="mem-endpoint-link mem-focus mt-8">
              <span className="mem-status-dot" />
              <span className="font-mono text-xs text-cyan-100">memorify.dev/mcp</span>
              <ExternalLink className="h-3.5 w-3.5 text-white/35" />
            </a>

            <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
              <div><p className="mem-detail-heading">Streamable HTTP</p><p className="mt-1 text-slate-600">standard transport</p></div>
              <div><p className="mem-detail-heading">Agent tokens</p><p className="mt-1 text-slate-600">identity + access levels</p></div>
              <div><p className="mem-detail-heading">Tool discovery</p><p className="mt-1 text-slate-600">native + connected</p></div>
              <div><p className="mem-detail-heading">Workspaces</p><p className="mt-1 text-slate-600">context carried with identity</p></div>
            </div>
          </div>

          <div className="mem-terminal mem-terminal-refined">
            <div className="mem-terminal-head">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#ff6b6b]/80" />
                <span className="h-2 w-2 rounded-full bg-[#ffd166]/80" />
                <span className="h-2 w-2 rounded-full bg-[#4fe3c1]" />
              </div>
              <span className="font-mono text-[10px] text-slate-500">POST /mcp</span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
                <LockKeyhole className="h-3 w-3 text-violet-300/70" /> bearer required
              </span>
            </div>

            <div className="mem-protocol-rail" role="tablist" aria-label="MCP exchange stages">
              <span className="mem-protocol-progress" style={{ transform: `translateX(${active * 100}%)` }} />
              {stages.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActive(index)}
                  role="tab"
                  aria-selected={active === index}
                  className={`mem-protocol-tab mem-focus ${active === index ? "is-active" : ""}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div key={active} className="mem-terminal-swap mem-exchange">
              <div className="mem-exchange-request">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-violet-300">Request shape</span>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="mem-method-badge">{stage.method}</span>
                    <button type="button" onClick={copyRequest} className="mem-icon-button mem-focus h-7 w-7" aria-label="Copy current request">
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-7 text-slate-300 sm:text-sm"><code>{stage.request}</code></pre>
              </div>

              <div className="mem-exchange-route" aria-hidden>
                <span />
                <i />
              </div>

              <div className={`mem-exchange-result mem-exchange-result-${stage.tone}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-300">Response shape</span>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] text-slate-500"><LockKeyhole className="h-3 w-3" /> with valid auth</span>
                </div>
                <h3 className="mem-panel-heading mt-5 text-xl font-semibold">{stage.resultLabel}</h3>
                <div className="mt-5 grid gap-2">
                  {stage.resultItems.map((item, index) => (
                    <div key={item} className="mem-result-item" style={{ animationDelay: `${index * 90}ms` }}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{item}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const ProtocolSection = () => <Protocol />;
