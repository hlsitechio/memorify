import heroVideo from "@/assets/hero-bg.mp4.asset.json";
import { ArrowRight, Terminal } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative pt-32 pb-24 overflow-hidden">
      <video
        src={heroVideo.url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        // @ts-expect-error - fetchPriority is valid HTML
        fetchpriority="low"
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_30%,transparent_80%)]"
      />
      <div className="absolute inset-0 bg-grid" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" aria-hidden />

      <div className="container relative">
        <div className="max-w-3xl mx-auto text-center animate-float-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/40 backdrop-blur text-xs font-mono text-muted-foreground mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
            Now in private alpha — gateway live below
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight leading-[1.05]">
            The <span className="text-gradient">motherboard</span><br />for AI agents.
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            One backend that every agent plugs into. Memory, tools, files, and connectors behind a single endpoint —
            so Claude, Cursor, ChatGPT and your custom agents share the same brain.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <a
              href="/auth"
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-md bg-gradient-primary text-primary-foreground font-medium glow-primary hover:scale-[1.02] transition-transform"
            >
              Start for free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-secondary/60 hover:bg-secondary border border-border font-medium"
            >
              <Terminal className="w-4 h-4" />
              See it in action
            </a>
          </div>

          <p className="mt-6 text-xs font-mono text-muted-foreground">
            MCP-compatible · HTTP/WS · No SQL required
          </p>
        </div>
      </div>
    </section>
  );
};
