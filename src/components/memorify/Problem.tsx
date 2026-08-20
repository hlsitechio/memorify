import { useState } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const clients = [
  { name: "Claude Code", src: "/logos/claude-ai-icon.svg" },
  { name: "GitHub Copilot", src: "/logos/copilot_dark.svg" },
  { name: "Codex", src: "/logos/codex.svg" },
  { name: "Cline", src: "/logos/cline.svg" },
  { name: "Kilo Code", src: "/logos/kilocode-dark.svg" },
  { name: "OpenCode", src: "/logos/opencode-dark.svg" },
  { name: "Cursor", src: "/logos/cursor_dark.svg" },
  { name: "Windsurf", src: "/logos/windsurf-dark.svg" },
  { name: "Grok", src: "/logos/grok-dark.svg" },
  { name: "OpenClaw", src: "/logos/openclaw.svg" },
  { name: "Hermes", src: "/logos/hermes.png" },
  { name: "PI", src: "/logos/pi-dev.png" },
];

const bootstrapSignals = [
  { label: "Identity", value: "agent + workspace + access", tone: "cyan" },
  { label: "Memory", value: "current agent memories", tone: "violet" },
  { label: "Skills", value: "workspace skill registry", tone: "blue" },
  { label: "Events", value: "recent workspace activity", tone: "amber" },
];

export const Problem = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.18 });
  const [activeSignal, setActiveSignal] = useState(0);
  const activePayload = bootstrapSignals[activeSignal];

  return (
    <section id="product" ref={ref} className="relative overflow-hidden border-b border-white/[0.06] bg-[#07080d] py-20 lg:py-28">
      <div className="mem-section-spectrum mem-section-spectrum-left" aria-hidden />

      <div className="mem-client-marquee overflow-hidden py-5">
        <div className="mem-logo-track" aria-label="Examples of AI clients">
          {[...clients, ...clients].map((client, index) => (
            <div key={`${client.name}-${index}`} className="flex min-w-[150px] items-center justify-center gap-2.5 px-5 text-sm text-slate-400">
              <img src={client.src} alt="" className="h-5 w-5 object-contain opacity-80" />
              <span>{client.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`container mt-20 ${isVisible ? "mem-reveal is-visible" : "mem-reveal"}`}>
        <div className="grid gap-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-20">
          <div>
            <p className="mem-kicker">Session continuity</p>
            <h2 className="mem-heading mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
              A new session does not have to mean <span className="mem-gradient-text-alt">starting over.</span>
            </h2>
          </div>
          <div className="lg:pb-1">
            <p className="max-w-xl text-lg leading-8 text-slate-400">
              One bootstrap call returns the agent's identity, current-agent memories, workspace skills, and recent workspace events.
            </p>
            <div className="mt-7 grid max-w-xl grid-cols-2 gap-8 border-t border-white/[0.08] pt-5">
              <div>
                <p className="font-mono text-xs text-cyan-100">remember</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Capture decisions while work happens.</p>
              </div>
              <div>
                <p className="font-mono text-xs text-violet-100">rehydrate</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Continue from the same agent context.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mem-handoff-stage mt-14">
          <div className="mem-handoff-meta">
            <span className="flex items-center gap-2"><span className="mem-status-dot is-online" /> new agent session</span>
            <span>agents_bootstrap</span>
            <span className="text-emerald-300">ready · context returned</span>
          </div>

          <div className="mem-handoff-flow">
            <div className="mem-handoff-source">
              <span className="mem-handoff-source-mark"><img src="/logos/claude-ai-icon.svg" alt="" /></span>
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-slate-600">session / 001</span>
              <strong>awaiting context</strong>
            </div>

            <div className="mem-handoff-bridge" aria-hidden>
              <span className="mem-handoff-beam"><i /></span>
              <div className="mem-handoff-core">
                <span />
                <img src="/brand/logo/logo-gateway-mark.svg" alt="" />
              </div>
              <span className="mem-handoff-beam mem-handoff-beam-out"><i /></span>
            </div>

            <div className="mem-handoff-payloads" role="group" aria-label="Bootstrap payload">
              {bootstrapSignals.map((signal, index) => (
                <button
                  key={signal.label}
                  type="button"
                  onClick={() => setActiveSignal(index)}
                  aria-pressed={activeSignal === index}
                  className={`mem-handoff-payload mem-handoff-payload-${signal.tone} ${activeSignal === index ? "is-active" : ""}`}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{signal.label}</strong><small>{signal.value}</small></div>
                </button>
              ))}
            </div>
          </div>

          <div className="mem-handoff-readout">
            <span>{String(activeSignal + 1).padStart(2, "0")} / 04</span>
            <strong>{activePayload.label}</strong>
            <p>{activePayload.value}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
