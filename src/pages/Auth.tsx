import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SignIn, SignUp, UserButton } from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { cn } from "@/lib/utils";
import { Zap, LogIn, UserPlus, Layers, ShieldCheck, Loader2 } from "lucide-react";

export const authLocalization = {
  signIn: {
    start: {
      title: "Sign in to Memorify.dev",
      subtitle: "Welcome back! Please sign in to continue",
    },
  },
  signUp: {
    start: {
      title: "Sign up for Memorify.dev",
      subtitle: "Get started with AI agent memory & zero-trust guardrails",
    },
  },
};

export const authAppearance = {
  layout: {
    socialButtonsVariant: "blockButton" as const,
    socialButtonsPlacement: "top" as const,
    showOptionalFields: false,
  },
  variables: {
    colorBackground: "#0b0f19",
    colorText: "#f8fafc",
    colorTextSecondary: "#cbd5e1",
    colorInputBackground: "#131b2e",
    colorInputText: "#ffffff",
    colorPrimary: "#06b6d4",
    colorTextOnPrimaryBackground: "#000000",
    colorDanger: "#ef4444",
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",
    colorNeutral: "#ffffff",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "w-full shadow-none border-0 bg-transparent",
    card: "w-full bg-[#0b0f19]/95 border border-slate-800/90 shadow-2xl backdrop-blur-xl rounded-2xl p-6 overflow-hidden",
    headerTitle: "text-lg font-bold text-white tracking-tight text-center",
    headerSubtitle: "text-xs text-slate-300 font-normal mt-1 text-center",
    socialButtonsBlockButton:
      "bg-[#131b2e] hover:bg-[#1e293b] border border-slate-700/80 text-slate-200 font-medium transition-all shadow-sm rounded-xl py-2.5 relative",
    socialButtonsBlockButtonText: "text-slate-200 font-medium text-xs",
    socialButtonsProviderIcon: "w-4 h-4",
    socialButtonsBadge:
      "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm",
    socialButtonsBlockButtonBadge:
      "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm",
    badge:
      "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm",
    tag: "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 text-[10px] font-bold px-2 py-0.5 rounded-full",
    dividerLine: "bg-slate-800",
    dividerText: "text-slate-400 text-[11px] font-mono",
    formFieldLabel: "text-xs font-medium text-slate-200 mb-1",
    formFieldInput:
      "bg-[#131b2e] border border-slate-700/80 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 text-xs rounded-lg transition-all h-10 px-3",
    formButtonPrimary:
      "bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 py-2.5 rounded-xl transition-all h-10 mt-2",
    footerActionText: "text-slate-300 text-xs font-medium",
    footerActionLink:
      "text-cyan-400 hover:text-cyan-300 font-bold text-xs transition-colors",
    footer:
      "bg-[#0f172a] border-t border-slate-800/80 rounded-b-2xl py-3.5 mt-4 text-center",
    footerPages: "text-slate-300 text-xs",
    footerPagesLink: "text-slate-300 hover:text-white text-xs font-medium",
    clerkBranding:
      "opacity-100 hover:opacity-100 transition-opacity text-slate-300 font-medium",
    clerkBrandingText: "text-slate-300 text-[11px] font-medium opacity-100",
    clerkBrandingIcon: "text-slate-300 opacity-100",
    identityPreview:
      "bg-[#131b2e] border border-slate-700/80 text-white rounded-xl p-2.5",
    identityPreviewText: "text-slate-200 text-xs font-mono",
    identityPreviewEditButton:
      "text-cyan-400 hover:text-cyan-300 text-xs font-semibold",
    formFieldSuccessText: "text-emerald-400 text-xs mt-1",
    formFieldErrorText: "text-rose-400 text-xs mt-1",
    alert:
      "bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3",
    alertText: "text-rose-300 text-xs",
    formHeaderTitle: "text-lg font-bold text-white",
    formHeaderSubtitle: "text-xs text-slate-300",
  },
};

export default function Auth({
  defaultMode = "signin",
}: {
  defaultMode?: "signin" | "signup";
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const wsHandle = searchParams.get("ws");
  const modeParam = searchParams.get("mode");
  const [mode, setMode] = useState<"signin" | "signup">(
    modeParam === "signup" || defaultMode === "signup" ? "signup" : "signin"
  );

  useEffect(() => {
    if (modeParam === "signup") setMode("signup");
    else if (modeParam === "signin") setMode("signin");
  }, [modeParam]);

  const handleModeChange = (newMode: "signin" | "signup") => {
    setMode(newMode);
    const params = new URLSearchParams(searchParams);
    params.set("mode", newMode);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    if (!loading && user) {
      if (wsHandle) {
        navigate(`/ws/${wsHandle}${window.location.search || ""}`, {
          replace: true,
        });
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, loading, navigate, wsHandle]);

  return (
    <>
      <Seo
        title={
          mode === "signup"
            ? "Create Account — Memorify.dev"
            : "Sign in — Memorify.dev"
        }
        description="Unified Authentication for AI Agents and Developers on Memorify.dev"
        path="/auth"
      />
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#070a13] py-10 px-4">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[110px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md flex flex-col items-center">
          <div
            className="flex items-center gap-3 mb-5 cursor-pointer group transition-transform hover:scale-105"
            onClick={() => navigate("/")}
          >
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-cyan-500/20 border border-primary/40 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:border-primary transition-all">
              <Zap className="h-5 w-5 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                Memorify.dev
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-primary/20 text-primary border border-primary/30 font-semibold">
                  Cloud
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                The motherboard for AI agents
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs text-slate-400 font-mono">
                Authenticating secure session…
              </span>
            </div>
          ) : user ? (
            <div className="w-full rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl flex flex-col items-center gap-4 py-6">
              <p className="text-sm text-muted-foreground">You are signed in</p>
              <UserButton />
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full mt-2"
              >
                Go to dashboard
              </Button>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              {wsHandle && (
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-xs text-primary mb-4 text-center w-full flex items-center justify-center gap-2 shadow-sm">
                  <Layers className="h-3.5 w-3.5" />
                  <span>
                    Joining Workspace:{" "}
                    <code className="font-bold font-mono">{wsHandle}</code>
                  </span>
                </div>
              )}

              <div className="w-full mb-3.5 grid grid-cols-2 p-1 rounded-xl bg-[#0f172a]/90 border border-slate-800 shadow-md">
                <button
                  type="button"
                  onClick={() => handleModeChange("signin")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all",
                    mode === "signin"
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("signup")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all",
                    mode === "signup"
                      ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20 font-bold"
                      : "text-slate-400 hover:text-white"
                  )}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Create Account</span>
                </button>
              </div>

              <div className="w-full flex justify-center">
                {mode === "signin" ? (
                  <SignIn
                    routing="hash"
                    fallbackRedirectUrl="/dashboard"
                    signUpUrl="/auth?mode=signup"
                    appearance={authAppearance}
                    localization={authLocalization}
                  />
                ) : (
                  <SignUp
                    routing="hash"
                    fallbackRedirectUrl="/dashboard"
                    signInUrl="/auth?mode=signin"
                    appearance={authAppearance}
                    localization={authLocalization}
                  />
                )}
              </div>

              <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Zero-Trust Guardrails & Bitwarden Passkey Protected
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
