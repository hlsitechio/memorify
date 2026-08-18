import { ArrowRight, Radio } from "lucide-react";
import { useMemorifyStatus } from "@/hooks/useMemorifyStatus";

export const Waitlist = () => {
  const status = useMemorifyStatus();
  const statusLabel = status.state === "online"
    ? "Live in production"
    : status.state === "loading"
      ? "Checking production"
      : "Production endpoint";

  return (
    <section className="relative overflow-hidden bg-[#05060a] py-24 lg:py-32">
      <div className="mem-cta-spectrum" aria-hidden />
      <div className="mem-site-grid absolute inset-0 opacity-25" aria-hidden />
      <div className="container relative text-center">
        <div className={`mx-auto flex w-fit items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] ${status.state === "online" ? "text-emerald-300" : "text-slate-500"}`}>
          <span className={`mem-status-dot ${status.state === "online" ? "is-online" : ""}`} />
          {statusLabel}
        </div>
        <h2 className="mem-heading mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
          Give the next session the context <span className="mem-gradient-text">the last one earned.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
          Open an existing workspace, issue an agent-bound token, and connect through Memorify's live MCP endpoint.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="/auth" className="mem-primary-button mem-focus h-12 px-6">
            Open Memorify
            <ArrowRight className="h-4 w-4" />
          </a>
          <a href="https://memorify.dev/mcp" target="_blank" rel="noreferrer" className="mem-secondary-button mem-focus h-12 px-6">
            <Radio className="h-4 w-4 text-cyan-200" />
            Inspect /mcp
          </a>
        </div>
      </div>
    </section>
  );
};
