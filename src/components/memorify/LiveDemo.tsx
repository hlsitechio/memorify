import { ArrowRight, CircleDot, Database, FileSearch, KeyRound, Radio, Workflow } from "lucide-react";
import { useMemorifyStatus } from "@/hooks/useMemorifyStatus";

const modules = [
  { name: "Memory", icon: CircleDot },
  { name: "Documents", icon: FileSearch },
  { name: "MCP servers", icon: Workflow },
  { name: "Agent tokens", icon: KeyRound },
];

const activityPreview = [
  { agent: "claude-code", action: "memory_remember", boundary: "shared memory", toneClass: "text-cyan-200" },
  { agent: "cursor", action: "documents_search", boundary: "workspace", toneClass: "text-blue-200" },
  { agent: "hermes", action: "agents_bootstrap", boundary: "agent + workspace", toneClass: "text-violet-200" },
  { agent: "custom-worker", action: "mcp_call", boundary: "connected server", toneClass: "text-amber-200" },
];

export const LiveDemo = () => {
  const status = useMemorifyStatus();
  const unavailableLabel = status.state === "loading" ? "checking" : "unavailable";
  const endpointSignals = [
    { label: "Health API", value: status.healthStatus || unavailableLabel, online: status.state === "online" },
    { label: "MCP manifest", value: status.tools.length > 0 ? `${status.tools.length} tools` : unavailableLabel, online: status.tools.length > 0 },
    { label: "Transport", value: status.transport || unavailableLabel, online: Boolean(status.transport) },
  ];

  return (
    <section id="control-plane" className="relative overflow-hidden border-b border-white/10 bg-[#08090e] py-20 lg:py-28">
      <div className="mem-control-glow" aria-hidden />
      <div className="container relative">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="mem-kicker">Control plane</p>
            <h2 className="mem-heading mt-5 text-4xl font-semibold leading-[1.08] sm:text-5xl">
              The agent stack is visible, <span className="mem-gradient-text-alt">not a black box.</span>
            </h2>
          </div>
          <div className="lg:justify-self-end">
            <p className="max-w-2xl text-lg leading-8 text-slate-400">
              The workspace UI brings together agents, memory, documents, skills, connectors, MCP servers, tokens, events, logs, and system health.
            </p>
            <a href="/auth" className="mem-inline-link mem-focus mt-5">
              Open your workspace
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="mem-observatory mt-14">
          <div className="mem-observatory-map" aria-label="Live Memorify gateway overview">
            <span className="mem-observatory-ring mem-observatory-ring-one" aria-hidden />
            <span className="mem-observatory-ring mem-observatory-ring-two" aria-hidden />
            {modules.map((module, index) => (
              <div key={module.name} className={`mem-observatory-module mem-observatory-module-${index}`}>
                <module.icon className="h-3.5 w-3.5" />
                <span>{module.name}</span>
              </div>
            ))}
            <div className="mem-observatory-core">
              <span className={`mem-status-dot ${status.state === "online" ? "is-online" : ""}`} />
              <p>{status.state === "online" ? "gateway online" : status.state === "loading" ? "checking gateway" : "gateway unavailable"}</p>
              <strong>{status.tools.length > 0 ? status.tools.length : "--"}</strong>
              <small>built-in MCP tools</small>
            </div>
            <div className="mem-observatory-metric mem-observatory-latency">
              <span>latency</span>
              <strong>{status.latencyMs ?? "--"}{status.latencyMs !== null && <small> ms</small>}</strong>
            </div>
            <div className="mem-observatory-metric mem-observatory-database">
              <span>database</span>
              <strong><Database className="h-3.5 w-3.5" /> {status.databaseProvider || "--"}</strong>
            </div>
          </div>

          <div className="mem-observatory-feed">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200">Representative activity</p>
              <h3 className="mem-panel-heading mt-3 text-2xl font-semibold">Signals an operator can inspect.</h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Example agent calls are separated from the live endpoint readings below.</p>
            </div>
            <div className="mem-signal-grid mt-8">
              {activityPreview.map((row, index) => (
                <article key={row.agent} className="mem-signal-event" style={{ animationDelay: `${index * 110}ms` }}>
                  <div><span>{String(index + 1).padStart(2, "0")}</span><span><Radio className="h-3 w-3" /> example</span></div>
                  <strong className={row.toneClass}>{row.action}</strong>
                  <p><span>{row.agent}</span><i />{row.boundary}</p>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="mem-endpoint-ribbon">
          <div>
            <p>Live endpoint responses</p>
            <span>/api/health + /mcp</span>
          </div>
          {endpointSignals.map((signal) => (
            <div key={signal.label} className="mem-endpoint-signal">
              <span>{signal.label}</span>
              <strong className={signal.online ? "is-online" : ""}><i />{signal.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
