import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  SignIn,
  SignUp,
  UserButton,
  useClerk,
} from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { useMemorifyStatus } from "@/hooks/useMemorifyStatus";
import { Seo } from "@/components/Seo";
import {
  ArrowLeft,
  ArrowRight,
  Shield,
  KeyRound,
  Sparkles,
  Cpu,
  Lock,
  Radio,
  CheckCircle2,
} from "lucide-react";

function AuthVideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoOpacity, setVideoOpacity] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let isFading = false;
    let fadeTimer: any = null;

    const onTimeUpdate = () => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const timeLeft = video.duration - video.currentTime;

      // 2 seconds before the end, smoothly fade to dark
      if (timeLeft <= 2.0 && !isFading) {
        isFading = true;
        setVideoOpacity(0);

        fadeTimer = setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
            setVideoOpacity(1);
            setTimeout(() => {
              isFading = false;
            }, 1200);
          }
        }, 1800);
      }
    };

    const onEnded = () => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
        setVideoOpacity(1);
        isFading = false;
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 bg-[#03050a]">
      {/* High-def Stargate Beam video background */}
      <video
        ref={videoRef}
        src="/brand/stargate-beam-auth.mp4"
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ease-in-out"
        style={{ opacity: videoOpacity * 0.65 }}
      />
    </div>
  );
}

const agents = [
  { name: "Claude", src: "/logos/claude-ai-icon.svg" },
  { name: "Cursor", src: "/logos/cursor_dark.svg" },
  { name: "OpenAI", src: "/logos/openai_dark.svg" },
  { name: "Copilot", src: "/logos/microsoft-copilot.svg" },
  { name: "Codex", src: "/logos/codex.svg" },
  { name: "Hermes", src: "/logos/hermes.png" },
];

const clerkAppearance = {
  variables: {
    colorPrimary: "#2EE6C8",
    colorBackground: "transparent",
    colorText: "#EEF1F5",
    colorTextSecondary: "#8B95A1",
    colorInputBackground: "#0b101a",
    colorInputText: "#EEF1F5",
    colorBorder: "rgba(255, 255, 255, 0.12)",
    borderRadius: "0.5rem",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontSize: "14px",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border-0 bg-transparent p-0 shadow-none",
    headerTitle: "text-white font-semibold text-xl tracking-tight text-left",
    headerSubtitle: "text-slate-400 text-sm text-left mb-2",
    socialButtonsBlockButton:
      "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08] hover:border-white/20 transition-all text-sm font-medium rounded-lg h-10",
    socialButtonsBlockButtonText: "text-slate-200 font-medium text-sm",
    socialButtonsProviderIcon: "w-4 h-4 mr-2",
    dividerRow: "my-4",
    dividerLine: "bg-white/10",
    dividerText: "text-slate-500 text-[11px] font-mono uppercase tracking-widest bg-transparent",
    formFieldLabel: "text-slate-300 text-xs font-medium uppercase tracking-wider mb-1.5 text-left",
    formFieldInput:
      "bg-[#090d16] border border-white/15 text-white placeholder-slate-500 rounded-lg text-sm h-10 focus:border-[#2EE6C8] focus:ring-1 focus:ring-[#2EE6C8] transition-all",
    formButtonPrimary:
      "bg-[#2EE6C8] text-[#050811] font-semibold hover:bg-[#5CF0D8] shadow-[0_0_24px_rgba(46,230,200,0.35)] transition-all rounded-lg text-sm h-10 mt-2 cursor-pointer",
    footerActionText: "text-slate-400 text-xs",
    footerActionLink: "text-[#2EE6C8] hover:text-[#5CF0D8] font-medium transition-colors text-xs ml-1",
    identityPreviewText: "text-slate-200 text-sm",
    identityPreviewEditButton: "text-[#2EE6C8] hover:text-[#5CF0D8] text-xs font-mono ml-2",
    formFieldAction: "text-[#2EE6C8] hover:text-[#5CF0D8] text-xs font-medium",
    footer: "bg-transparent border-0 pt-4",
    alertText: "text-rose-300 text-xs",
    alert: "border border-rose-500/30 bg-rose-500/10 text-rose-300 rounded-lg p-3",
  },
};

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { signOut } = useClerk();
  const status = useMemorifyStatus();

  const wsHandle = searchParams.get("ws");
  const modeParam = searchParams.get("mode");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">(
    modeParam === "sign-up" ? "sign-up" : "sign-in"
  );

  // Sync mode with state
  useEffect(() => {
    if (modeParam === "sign-up" && authMode !== "sign-up") {
      setAuthMode("sign-up");
    } else if (modeParam === "sign-in" && authMode !== "sign-in") {
      setAuthMode("sign-in");
    }
  }, [modeParam, authMode]);

  const handleModeSwitch = (mode: "sign-in" | "sign-up") => {
    setAuthMode(mode);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("mode", mode);
    setSearchParams(newParams, { replace: true });
  };

  // If already logged in, redirect automatically
  useEffect(() => {
    if (!loading && user) {
      if (wsHandle) {
        navigate(`/ws/${wsHandle}${window.location.search}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, loading, navigate, wsHandle]);

  const toolCount = status.tools.length > 0 ? status.tools.length : 23;

  return (
    <>
      <Seo
        title="Sign in — Memorify Control Plane"
        description="Authenticate to your private Memorify MCP gateway. Unified memory, tools, documents, and credentials for every AI agent."
        path="/auth"
      />

      <main className="mem-site min-h-screen bg-[#04060b] text-white flex flex-col lg:grid lg:grid-cols-12 overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
        
        {/* ========================================================= */}
        {/* LEFT COLUMN: Brand, Slogan & Gateway Showcase              */}
        {/* ========================================================= */}
        <section
          aria-label="Memorify platform showcase"
          className="relative lg:col-span-7 flex flex-col justify-between p-6 sm:p-10 lg:p-14 overflow-hidden border-b lg:border-b-0 lg:border-r border-white/10 min-h-[500px] lg:min-h-screen"
        >
          {/* High-def Stargate Beam video background with 2s dark-fade loop */}
          <AuthVideoBackground />
          <div className="mem-hero-wash pointer-events-none z-[1]" aria-hidden />
          <div className="mem-spectrum-field pointer-events-none z-[1]" aria-hidden />
          <div className="mem-site-grid absolute inset-0 opacity-20 pointer-events-none z-[1]" aria-hidden />

          {/* Top Brand & Back navigation */}
          <div className="relative z-10 flex items-center justify-between">
            <Link
              to="/"
              className="mem-focus flex items-center gap-3 rounded-lg group"
              aria-label="Memorify home"
            >
              <span className="mem-brand-mark w-9 h-9 sm:w-10 sm:h-10">
                <img
                  src="/brand/logo/logo-gateway-mark.svg"
                  alt="Memorify"
                  className="h-full w-full"
                />
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tracking-tight text-white group-hover:text-cyan-200 transition-colors">
                  Memorify
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">
                  dev
                </span>
              </span>
            </Link>

            <Link
              to="/"
              className="mem-focus inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs text-slate-300 backdrop-blur-md transition-all hover:bg-white/[0.08] hover:text-white hover:border-white/20"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-cyan-300" />
              <span>memorify.dev</span>
            </Link>
          </div>

          {/* Middle: Slogans & Core Value Proposition */}
          <div className="relative z-10 my-auto py-8 sm:py-12 max-w-[620px]">
            {/* Live Gateway Status Pill */}
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-cyan-400/25 bg-cyan-950/40 px-3.5 py-1 text-xs text-cyan-200 backdrop-blur-md">
              <span
                className={`mem-status-dot ${
                  status.state === "online" ? "is-online" : ""
                }`}
              />
              <span className="font-medium">
                {status.state === "online" ? "Gateway online" : "Connecting gateway"}
              </span>
              {status.latencyMs !== null && (
                <span className="text-white/40 font-mono text-[11px]">
                  {status.latencyMs} ms
                </span>
              )}
              <span className="border-l border-white/15 pl-2 font-mono text-[11px] text-cyan-300/80">
                {toolCount} tools
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="mem-heading text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.08] tracking-tight text-white">
              One gateway. One connection.{" "}
              <span className="mem-gradient-text block mt-1">
                Every agent. Every tool.
              </span>
            </h1>

            {/* North Star Slogan */}
            <p className="mt-4 font-mono text-xs sm:text-sm text-cyan-200/80 tracking-wide">
              &ldquo;Give the next session the context the last one earned.&rdquo;
            </p>

            <p className="mt-4 text-sm sm:text-base leading-relaxed text-slate-300/90 max-w-[560px]">
              Memorify gives every AI agent the same secure memory, tools, documents, and connectors through one private MCP gateway. Context follows the work seamlessly across CLI, IDE, and web agents.
            </p>

            {/* Agent Ecosystem Pills */}
            <div className="mt-8">
              <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-slate-400 mb-3">
                Connected Agent Ecosystem
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {agents.map((agent) => (
                  <div
                    key={agent.name}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm transition-colors hover:border-cyan-400/40 hover:bg-white/[0.06]"
                  >
                    <img src={agent.src} alt="" className="h-4 w-4 object-contain" />
                    <span className="text-xs font-medium text-slate-200">
                      {agent.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3 Core Architecture Pillars */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-white/10 pt-6">
              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
                  <Lock className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Zero-Leak Vault</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Encrypted server-side, never exposed to agents.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
                  <KeyRound className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Scoped Tokens</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    <code className="font-mono text-cyan-300">mem_live_</code> keys with granular access.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
                  <Cpu className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white">Shared Memory</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    Session context synced across all clients.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Endpoint Spec */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-slate-500 font-mono">
            <div className="flex items-center gap-2 text-cyan-200/70">
              <Radio className="h-3.5 w-3.5 text-cyan-300" />
              <span>memorify.dev/mcp</span>
            </div>
            <div className="flex items-center gap-3">
              <span>JSON-RPC 2.0</span>
              <span>•</span>
              <span>Zero Data Retention Ready</span>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Interactive Authentication Panel            */}
        {/* ========================================================= */}
        <section
          aria-label="Account authentication"
          className="lg:col-span-5 relative flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 min-h-[550px] lg:min-h-screen bg-[#050811]"
        >
          {/* Subtle background glow */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(46, 230, 200, 0.09) 0%, rgba(92, 98, 255, 0.04) 45%, transparent 70%)",
            }}
            aria-hidden
          />

          <div className="relative z-10 w-full max-w-[440px]">
            
            {/* Workspace Invitation Badge */}
            {wsHandle && (
              <div className="mb-5 rounded-xl border border-cyan-400/30 bg-cyan-950/40 p-3.5 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-400/20 text-cyan-300">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-cyan-200">
                      Workspace Invitation
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Accept invite for <code className="font-mono text-cyan-300">{wsHandle}</code>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* If Signed In */}
            {user ? (
              <div className="rounded-2xl border border-white/10 bg-[#070b14]/90 p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/15 border border-cyan-400/30">
                  <CheckCircle2 className="h-7 w-7 text-cyan-300" />
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Active Session Detected
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Signed in as <span className="text-white font-medium">{user.email ?? user.id}</span>
                  </p>
                </div>

                <div className="flex justify-center">
                  <UserButton afterSignOutUrl="/" />
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate(wsHandle ? `/ws/${wsHandle}` : "/dashboard")}
                    className="mem-primary-button w-full h-11 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Enter Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => signOut({ redirectUrl: "/auth" })}
                    className="w-full text-xs text-slate-400 hover:text-white transition-colors py-2 cursor-pointer"
                  >
                    Sign in with another account
                  </button>
                </div>
              </div>
            ) : (
              /* Signed Out: Glassmorphic Auth Box */
              <div className="rounded-2xl border border-white/10 bg-[#070b14]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
                
                {/* Mode Switcher Tabs */}
                <div className="flex rounded-lg bg-black/40 p-1 border border-white/10 mb-6">
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("sign-in")}
                    className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer ${
                      authMode === "sign-in"
                        ? "bg-cyan-500/20 text-cyan-200 shadow-sm border border-cyan-400/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch("sign-up")}
                    className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer ${
                      authMode === "sign-up"
                        ? "bg-cyan-500/20 text-cyan-200 shadow-sm border border-cyan-400/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {/* Embedded Clerk Form */}
                <div className="clerk-auth-container min-h-[360px] flex items-center justify-center">
                  {authMode === "sign-in" ? (
                    <SignIn
                      routing="hash"
                      signUpUrl="/auth?mode=sign-up"
                      forceRedirectUrl={wsHandle ? `/ws/${wsHandle}` : "/dashboard"}
                      appearance={clerkAppearance}
                    />
                  ) : (
                    <SignUp
                      routing="hash"
                      signInUrl="/auth?mode=sign-in"
                      forceRedirectUrl={wsHandle ? `/ws/${wsHandle}` : "/dashboard"}
                      appearance={clerkAppearance}
                    />
                  )}
                </div>

                {/* Bottom Trust & Security Note */}
                <div className="mt-6 border-t border-white/10 pt-4 flex items-center justify-center gap-2 text-center text-[11px] text-slate-500">
                  <Shield className="h-3.5 w-3.5 text-cyan-400/70 flex-none" />
                  <span>
                    Secured by Clerk Identity &amp; Memorify Gateway Core.
                  </span>
                </div>
              </div>
            )}

            {/* Legal / Policy links */}
            <div className="mt-5 text-center text-[11px] text-slate-500">
              <span>By continuing, you agree to Memorify&apos;s </span>
              <a href="/#protocol" className="text-slate-400 hover:text-cyan-300 underline underline-offset-2">
                Protocol Terms
              </a>
              <span> and </span>
              <a href="/#control-plane" className="text-slate-400 hover:text-cyan-300 underline underline-offset-2">
                Privacy Policies
              </a>
              .
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
