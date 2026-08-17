import { useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Show,
  SignIn,
  SignUp,
  UserButton,
} from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { Zap } from "lucide-react";
import authVideo from "@/assets/auth-bg.mp4.asset.json";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const wsHandle = searchParams.get("ws");
  const isSignUp = searchParams.get("mode") === "signup";

  const redirectUrl = wsHandle
    ? `/ws/${wsHandle}${window.location.search}`
    : "/dashboard";

  useEffect(() => {
    if (!loading && user) {
      navigate(redirectUrl, { replace: true });
    }
  }, [user, loading, navigate, redirectUrl]);

  const clerkAppearance = {
    elements: {
      rootBox: "w-full",
      card: "bg-card/95 backdrop-blur-xl border border-blue-500/25 shadow-2xl rounded-2xl p-6 sm:p-8 w-full shadow-blue-500/10",
      headerTitle: "text-foreground text-xl font-semibold tracking-tight",
      headerSubtitle: "text-muted-foreground text-sm",
      socialButtonsBlockButton: "border border-border bg-background/80 hover:bg-accent/80 text-foreground text-sm rounded-lg py-2.5 transition-all hover:border-blue-500/40",
      socialButtonsBlockButtonText: "text-foreground font-medium",
      dividerLine: "bg-border",
      dividerText: "text-muted-foreground text-xs uppercase tracking-wider",
      formFieldLabel: "text-foreground text-xs font-medium",
      formFieldInput: "bg-background/90 border border-input text-foreground text-sm rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 h-10 px-3 transition-colors",
      formButtonPrimary: "bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-lg py-2.5 font-medium shadow-md shadow-blue-500/25 transition-all active:scale-[0.99]",
      footerActionLink: "text-blue-400 hover:text-blue-300 font-medium hover:underline",
      identityPreviewText: "text-foreground font-medium",
      identityPreviewEditButton: "text-blue-400 hover:text-blue-300",
      formFieldAction: "text-xs text-blue-400 hover:text-blue-300",
      formFieldErrorText: "text-red-400 text-xs mt-1",
      alert: "bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg p-3",
    },
    variables: {
      colorBackground: "#0d1117",
      colorPrimary: "#3b82f6",
      colorText: "#f3f4f6",
      colorTextSecondary: "#9ca3af",
      colorInputBackground: "#161b22",
      colorInputText: "#ffffff",
      borderRadius: "0.75rem",
    },
  };

  return (
    <>
      <Seo title="Sign in — Memorify" description="Sign in to your Memorify workspace" />
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
        {/* Ambient video background */}
        {authVideo?.url ? (
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-35"
            autoPlay
            muted
            loop
            playsInline
            src={authVideo.url}
          />
        ) : null}

        {/* Ambient radial glow with blue touch */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-md mx-4 py-8">
          {/* Header branding */}
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">Memorify</h1>
                <p className="text-xs text-muted-foreground">The AI Agent Memory Layer</p>
              </div>
            </Link>
          </div>

          {wsHandle && (
            <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs text-center backdrop-blur-sm">
              <span className="text-muted-foreground">Opening workspace: </span>
              <span className="font-mono font-semibold text-foreground">memorify.dev/ws/{wsHandle}</span>
            </div>
          )}

          <Show when="signed-out">
            <div className="flex justify-center w-full">
              {isSignUp ? (
                <SignUp
                  routing="hash"
                  forceRedirectUrl={redirectUrl}
                  signInUrl="/auth"
                  appearance={clerkAppearance}
                />
              ) : (
                <SignIn
                  routing="hash"
                  forceRedirectUrl={redirectUrl}
                  signUpUrl="/auth?mode=signup"
                  appearance={clerkAppearance}
                />
              )}
            </div>
          </Show>

          <Show when="signed-in">
            <div className="rounded-2xl border border-blue-500/20 bg-card/95 backdrop-blur-md p-8 shadow-xl text-center space-y-4">
              <p className="text-sm text-muted-foreground">You are signed in</p>
              <div className="flex justify-center py-2">
                <UserButton afterSignOutUrl="/" />
              </div>
              <Button
                onClick={() => navigate("/dashboard")}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-medium shadow-md shadow-blue-500/25"
              >
                Go to dashboard
              </Button>
            </div>
          </Show>

          <p className="text-xs text-muted-foreground text-center mt-6">
            © {new Date().getFullYear()} Memorify · All rights reserved.
          </p>
        </div>
      </div>
    </>
  );
}
