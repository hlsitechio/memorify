import { ArrowUpRight, Database, Mail } from "lucide-react";

const packs = [
  {
    id: "starter",
    index: "01",
    name: "Starter",
    price: "1.99",
    memories: "100",
    unit: "~2.0¢ / memory",
    tone: "cyan",
    note: "A small one-time memory pack for focused agent workflows.",
  },
  {
    id: "popular",
    index: "02",
    name: "Popular",
    price: "4.99",
    memories: "500",
    unit: "~1.0¢ / memory",
    tone: "violet",
    note: "Five hundred memory credits in one purchase.",
  },
  {
    id: "value",
    index: "03",
    name: "Value",
    price: "9.99",
    memories: "1,200",
    unit: "~0.8¢ / memory",
    tone: "blue",
    note: "The lowest unit price in the planned pack table.",
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
            Planned one-time memory packs with no recurring subscription shown. Online checkout remains unavailable until billing and memory-credit enforcement are active.
          </p>
          <p className="mt-4 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-200/70">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" /> billing activation pending
          </p>
        </div>
      </div>

      <div className="mem-pack-grid mt-16" aria-label="One-time memory pack prices">
        {packs.map((pack) => (
          <article key={pack.id} className={`mem-pack mem-pack-${pack.tone}`}>
            <div className="mem-pack-meta">
              <span>{pack.index}</span>
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
              <span>Online checkout</span>
              <strong>Not active</strong>
            </div>
            <a
              href={`mailto:memorify-ops@agentmail.to?subject=${encodeURIComponent(`Memorify ${pack.name} memory pack`)}`}
              className="mem-pack-link mem-focus"
            >
              <Mail className="h-3.5 w-3.5" />
              Ask about this pack
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </article>
        ))}
      </div>

      <div className="mem-pricing-disclosure">
        <span>Price status</span>
        <p>Prices are displayed for transparency. No purchase action is presented as live until the corresponding checkout and credit ledger exist.</p>
      </div>
    </div>
  </section>
);
