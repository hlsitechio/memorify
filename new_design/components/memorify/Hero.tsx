import heroVideo from "@/assets/hero-bg.mp4.asset.json";
import { ArrowRight, Terminal, MousePointer2, CheckCircle2 } from "lucide-react";
import { useRef, useEffect, useState } from "react";

const HERO_BANNER = "/brand/hero-banner-memorify-metal-text.png";

export const Hero = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showScroll, setShowScroll] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleLoad = () => setVideoLoaded(true);
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowScroll(scrollY < 100);
    };
    
    video.addEventListener("loadeddata", handleLoad);
    window.addEventListener("scroll", handleScroll, { passive: true });
    
    return () => {
      video.removeEventListener("loadeddata", handleLoad);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" aria-labelledby="hero-title">
      {/* Video background - lazy loaded, with poster fallback */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <img
          src={HERO_BANNER}
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover opacity-80 [mask-image:radial-gradient(ellipse_78%_66%_at_52%_38%,black_30%,transparent_84%)]"
        />
        <video
          ref={videoRef}
          src={heroVideo.url}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          // @ts-expect-error - fetchPriority is valid HTML
          fetchPriority="low"
          poster={HERO_BANNER}
          className={`w-full h-full object-cover transition-opacity duration-1000 ${
            videoLoaded ? "opacity-40" : "opacity-0"
          } [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black_30%,transparent_80%)]`}
        />
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      </div>

      <div className="container relative pt-32 pb-24">
        <div className="max-w-4xl mx-auto text-center animate-float-up">
          {/* Trust indicator */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/50 bg-card/40 backdrop-blur text-xs font-mono text-muted-foreground mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
            Private alpha — gateway live at <code className="text-foreground font-mono">gateway.memorify.dev/v1</code>
          </div>

          {/* Main headline - concrete value prop */}
          <h1 id="hero-title" className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tight leading-[1.02] text-balance">
            One gateway. <span className="text-gradient">One connection.</span><br />
            Every agent. Every tool.<br />
            <span className="text-muted-foreground/60 text-4xl md:text-5xl lg:text-6xl font-normal">Once and for all.</span>
          </h1>

          {/* Sub-headline with specific promise */}
          <p className="mt-8 text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed text-balance">
            Give every AI agent the same secure memory, tools, files, and connectors through
            <strong className="text-foreground"> one private MCP gateway</strong>. Simple to connect,
            scoped by design, and built so context finally follows the work.
          </p>

          {/* Key metrics / proof points */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-8 text-sm font-mono text-muted-foreground opacity-80">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>1 endpoint</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>15+ built-in connectors</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>Native memory (not vector-only)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>Real-time context bus</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span>Full observability</span>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="/auth"
              className="group inline-flex items-center gap-2 px-6 py-4 rounded-lg bg-gradient-primary text-primary-foreground font-medium glow-primary hover:scale-[1.02] transition-transform shadow-lg"
              aria-label="Start building with Memorify"
            >
              Start for free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#demo"
              className="inline-flex items-center gap-2 px-6 py-4 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/50 font-medium transition-colors"
            >
              <Terminal className="w-5 h-5" />
              Try the live demo
            </a>
          </div>

          {/* Protocol preview */}
          <div className="mt-10 p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur text-left max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Protocol: POST https://gateway.memorify.dev/v1</p>
            <pre className="text-xs md:text-sm font-mono text-foreground/90 overflow-x-auto rounded-lg p-3 bg-background/60"><code>{`{
  "agent": "memory",
  "action": "remember",
  "input": {
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"]
  }
}`}</code></pre>
          </div>

          {/* Scroll indicator */}
          {showScroll && (
            <div 
              className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-slow animate-in fade-in delay-1000"
              aria-hidden
            >
              <MousePointer2 className="w-6 h-6 text-muted-foreground/60 mx-auto" />
              <p className="text-[10px] font-mono text-muted-foreground/50 mt-1 text-center">Scroll to explore</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
