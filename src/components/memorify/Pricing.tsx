import { ArrowUpRight, Database, Sparkles } from "lucide-react";

// Live one-time Stripe payment links (LIVE mode, acct_1U3xt6RldxEycfsH)
const packs = [
  {
    id: "starter",
    index: "01",
    name: "Starter",
    price: "1.99",
    memories: "500",
    unit: "~0.4¢ / memory",
    tone: "cyan",
    popular: false,
    note: "Five hundred persistent memories for focused agent workflows.",
    href: "https://buy.stripe.com/cNiaEZez1gbp48ybVfbEA00",
  },
  {
    id: "popular",
    index: "02",
    name: "Popular",
    price: "4.99",
    memories: "2,500",
    unit: "~0.2¢ / memory",
    tone: "popular",
    popular: true,
    note: "Two thousand five hundred memory credits for active multi-agent use.",
    href: "https://buy.stripe.com/cNi14p76zf7leNcf7rbEA01",
  },
  {
    id: "value",
    index: "03",
    name: "Value",
    price: "9.99",
    memories: "10,000",
    unit: "~0.1¢ / memory",
    tone: "blue",
    popular: false,
    note: "Ten thousand memory credits — power capacity for your entire fleet.",
    href: "https://buy.stripe.com/00w3cxbmP1gv20q8J3bEA02",
  },
];

export const Pricing = () => (
  <section id="pricing" className="mem-pricing-section relative overflow-hidden border-b border-white/10 py-20 lg:py-28">
    <div className="mem-section-spectrum mem-section-spectrum-right" aria-hidden />
    <div className="container relative">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
        <div>
          <p className="mem-kicker">Memory pack pricing</p>
          <h2 className="mem-heading mt-5 max-w-2xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
            One-time capacity, <span className="mem-gradient-text">priced simply.</span>
          </h2>
        </div>
        <div className="lg:pb-1">
          <p className="max-w-2xl text-lg leading-8 text-slate-400">
            Simple, transparent one-time memory packs with no recurring lock-in. Scale your agent memory as your workflow grows.
          </p>
        </div>
      </div>

      <div className="mem-pack-grid mt-16" aria-label="One-time memory pack prices">
        {packs.map((pack) => (
          <article key={pack.id} className={`mem-pack mem-pack-${pack.tone}`}>
            <div className="mem-pack-meta">
              <div className="flex items-center gap-2">
                <span>{pack.index}</span>
                {pack.popular && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                    <Sparkles className="h-2.5 w-2.5 text-emerald-300 animate-pulse" />
                    Most Popular
                  </span>
                )}
              </div>
              <span>one-time pack</span>
            </div>
            <div className="mem-pack-name">
              <Database className="h-4 w-4" />
              <h3>{pack.name}</h3>
            </div>
            <div className="mem-pack-price"><sup>$</sup><strong>{pack.price}</strong></div>
            <p className="mem-pack-note">{pack.note}</p>
            <div className="mem-pack-capacity">
              <span>Memory credits</span>
              <strong>{pack.memories}</strong>
              <small>{pack.unit}</small>
            </div>
            <div className="mem-pack-status">
              <span>Billing model</span>
              <strong className="text-cyan-200">Pay as you go</strong>
            </div>
            <a
              href={pack.href}
              className="mem-pack-link mem-focus"
            >
              Get started
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </article>
        ))}
      </div>

      <div className="mem-pricing-disclosure">
        <span>Transparent pricing</span>
        <p>All memory packs include full access to the hosted MCP gateway, AES-256 Vault, and multi-agent sync across all connected clients.</p>
      </div>
    </div>
  </section>
);
