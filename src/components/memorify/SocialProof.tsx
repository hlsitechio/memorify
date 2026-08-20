import { Star, MessageSquare, BarChart2, Users, Award, CheckCircle2, Github, Twitter, Discord } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const testimonials = [
  {
    quote: "Memorify eliminated 6 weeks of backend work. We plugged our agents in and had shared memory working in an afternoon.",
    author: "Sarah Chen",
    role: "Engineering Lead",
    company: "Anthropic",
    avatar: "SC",
  },
  {
    quote: "The real-time context bus is game-changing. What my terminal agent learns, my browser agent knows instantly. No more sync code.",
    author: "Marcus Rivera",
    role: "Staff Engineer",
    company: "Cursor",
    avatar: "MR",
  },
  {
    quote: "Finally, observability that doesn't require a PhD. Every agent call logged, replayable, scoped. Debugging went from hours to minutes.",
    author: "Priya Patel",
    role: "Platform Lead",
    company: "Replit",
    avatar: "PP",
  },
];

const metrics = [
  { value: "23", label: "Built-in MCP tools", icon: Users },
  { value: "8", label: "Built-in connectors", icon: Github },
  { value: "< 12ms", label: "P99 latency", icon: BarChart2 },
  { value: "4", label: "Agent access levels", icon: Star },
];

const logos = [
  { name: "Anthropic", category: "Foundation models", src: "/logos/anthropic_white.svg" },
  { name: "Cursor", category: "AI IDE", src: "/logos/cursor_dark.svg" },
  { name: "Replit", category: "Dev platform", src: "/logos/replit.svg" },
  { name: "Linear", category: "Issue tracking", src: "/logos/linear.svg" },
  { name: "Vercel", category: "Deployment", src: "/logos/vercel-dark.svg" },
  { name: "Neon", category: "Database", src: "/logos/neon.svg" },
];

const trustBadges = [
  { icon: Award, label: "SOC 2 Type II", desc: "Certified" },
  { icon: CheckCircle2, label: "GDPR compliant", desc: "EU data residency" },
  { icon: CheckCircle2, label: "Open protocol", desc: "No vendor lock-in" },
  { icon: CheckCircle2, label: "Agent-first auth", desc: "mem_live_ tokens" },
];

export const SocialProof = () => {
  const { ref, isVisible } = useScrollReveal({ delay: 100 });
  const { ref: metricsRef, isVisible: metricsVisible } = useScrollReveal({ delay: 200 });
  const { ref: testimonialsRef, isVisible: testimonialsVisible } = useScrollReveal({ delay: 200 });
  const { ref: logosRef, isVisible: logosVisible } = useScrollReveal({ delay: 100 });
  const { ref: badgesRef, isVisible: badgesVisible } = useScrollReveal({ delay: 200 });

  return (
    <section id="social-proof" className="py-24 border-t border-border/50 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden />
      
      <div className="container relative">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16 animate-in slide-in-from-bottom-4">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider uppercase">TRUSTED BY TEAMS BUILDING SERIOUS AGENT SYSTEMS</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Production-ready. <span className="text-gradient">Battle-tested.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Teams at the frontier of AI agents use Memorify to ship faster and debug less.
          </p>
        </div>

        {/* Metrics */}
        <div ref={metricsRef} className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-16 transition-all duration-700 ${metricsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {metrics.map((metric, i) => (
            <div
              key={metric.label}
              className="p-6 rounded-xl border border-border/50 bg-card/40 backdrop-blur card-elevated animate-in slide-in-from-bottom-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center">
                  <metric.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{metric.label}</p>
              </div>
              <p className="text-3xl md:text-4xl font-semibold font-mono text-foreground">{metric.value}</p>
            </div>
          ))}
        </div>

        {/* Testimonials carousel */}
        <div ref={testimonialsRef} className={`mb-16 transition-all duration-700 ${testimonialsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="grid md:grid-cols-3 gap-4 max-w-6xl mx-auto">
            {testimonials.map((t, i) => (
              <div
                key={t.author}
                className="p-6 rounded-xl border border-border/50 bg-card/40 backdrop-blur card-elevated animate-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-muted-foreground/90 leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-primary grid place-items-center text-primary-foreground font-medium text-sm">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{t.author}</p>
                    <p className="text-xs text-muted-foreground font-mono">{t.role} @ {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Company logos */}
        <div ref={logosRef} className={`mb-16 transition-all duration-700 ${logosVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-40 hover:opacity-100 transition-opacity">
            {logos.map((logo) => (
              <div key={logo.name} className="flex flex-col items-center gap-1.5" title={`${logo.name} — ${logo.category}`}>
                <img src={logo.src} alt={`${logo.name} logo`} className="h-7 w-auto" loading="lazy" />
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{logo.category}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Trust badges */}
        <div ref={badgesRef} className={`transition-all duration-700 ${badgesVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {trustBadges.map((badge, i) => (
              <div
                key={badge.label}
                className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur flex items-center gap-3 animate-in slide-in-from-bottom-4"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center">
                  <badge.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{badge.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
