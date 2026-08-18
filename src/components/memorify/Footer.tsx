import { ArrowUpRight, Mail, Radio } from "lucide-react";

const productLinks = [
  { href: "/#protocol", label: "MCP endpoint" },
  { href: "/#architecture", label: "Platform" },
  { href: "/#primitives", label: "Built-in tools" },
  { href: "/#control-plane", label: "Control plane" },
  { href: "/#pricing", label: "Pricing" },
];

export const Footer = () => {
  return (
    <footer className="border-t border-white/10 bg-[#040509]">
      <div className="container py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
          <div>
            <a href="/#" className="mem-focus inline-flex items-center gap-3 rounded-md" aria-label="Memorify home">
              <span className="mem-brand-mark h-10 w-10">
                <img src="/brand/logo/logo-gateway-mark.svg" alt="" className="h-full w-full" />
              </span>
              <span className="mem-brand-word text-lg font-semibold">Memorify</span>
            </a>
            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-400">
              Shared memory, searchable knowledge, connected tools, and production control for AI agents.
            </p>
            <div className="mt-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-cyan-200/70">
              <span className="mem-status-dot" />
              production endpoint · memorify.dev/mcp
            </div>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Product</p>
            <nav className="mt-4 grid gap-3 text-sm text-slate-400">
              {productLinks.map((link) => (
                <a key={link.href} href={link.href} className="mem-focus w-fit rounded-sm transition-colors hover:text-white">{link.label}</a>
              ))}
            </nav>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Connect</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-400">
              <a href="https://memorify.dev/mcp" target="_blank" rel="noreferrer" className="mem-focus inline-flex w-fit items-center gap-2 rounded-sm transition-colors hover:text-white">
                <Radio className="h-4 w-4" /> Live MCP endpoint <ArrowUpRight className="h-3 w-3 text-white/30" />
              </a>
              <a href="mailto:memorify-ops@agentmail.to" className="mem-focus inline-flex w-fit items-center gap-2 rounded-sm transition-colors hover:text-white">
                <Mail className="h-4 w-4" /> memorify-ops@agentmail.to
              </a>
              <a href="/auth" className="mem-focus inline-flex w-fit items-center gap-2 rounded-sm text-cyan-100 transition-colors hover:text-white">
                Open app <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Memorify</span>
          <span>Production MCP gateway · workspace control plane</span>
        </div>
      </div>
    </footer>
  );
};
