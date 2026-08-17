import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Show,
  SignIn,
  SignUp,
  UserButton,
} from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Seo } from "@/components/Seo";
import { Zap } from "lucide-react";
import authVideo from "@/assets/auth-bg.mp4.asset.json";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const wsHandle = searchParams.get("ws");
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);

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
      card: "bg-transparent border-0 shadow-none p-0 w-full",
      header: "hidden", // We provide our own branded header
      footer: "hidden", // We provide our own custom footer
      socialButtonsBlockButton: "border border-border bg-card hover:bg-accent text-foreground text-sm rounded-lg py-2.5 transition-colors",
      socialButtonsBlockButtonText: "text-foreground font-medium",
      dividerLine: "bg-border",
      dividerText: "text-muted-foreground text-xs",
      formFieldLabel: "text-foreground text-xs font-medium",
      formFieldInput: "bg-card border border-input text-foreground text-sm rounded-lg focus:ring-1 focus:ring-primary h-10 px-3",
      formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg py-2.5 font-medium shadow-sm transition-opacity",
      footerAction: "hidden",
      identityPreviewText: "text-foreground",
      identityPreviewEditButton: "text-primary hover:underline",
      formFieldAction: "text-xs text-muted-foreground hover:text-foreground",
      formFieldErrorText: "text-destructive text-xs mt-1",
      alert: "bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg p-3",
    },
    variables: {
      colorBackground: "transparent",
      colorPrimary: "hsl(var(--primary))",
      colorText: "hsl(var(--foreground))",
      colorTextSecondary: "hsl(var(--muted-foreground))",
      colorInputBackground: "hsl(var(--card))",
      colorInputText: "hsl(var(--foreground))",
      borderRadius: "0.5rem",
    },
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <Seo
        title="Sign in or create your Memorify account"
        description="Sign in to your Memorify workspace or create a new account to connect AI agents to your memory, tools, and files."
        path="/auth"
      />

      {/* Left Column: Hero Video & Branding (Original Memorify Design) */}
      <section className="hidden lg:flex flex-col justify-between p-12 bg-card border-r border-border relative overflow-hidden">
        {authVideo?.url ? (
          <video
            src={authVideo.url}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-br from-background/40 via-background/60 to-background/90 pointer-events-none" />
        <div className="absolute inset-0 bg-mesh opacity-30 pointer-events-none" />

        <Link to="/" className="flex items-center gap-2 relative z-10 w-fit">
          <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Memorify</span>
        </Link>

        <div className="relative z-10 space-y-3 max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">
            The memory layer for AI agents
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Sign in to manage memories, connectors, real-time events, and observability — all in one place.
          </p>
        </div>

        <p className="text-xs text-muted-foreground relative z-10">© Memorify</p>
      </section>

      {/* Right Column: Auth Card */}
      <section className="flex items-center justify-center p-6 glass-animated">
        <div className="w-full max-w-sm space-y-6 bg-background rounded-2xl p-8 border border-border shadow-xl">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-semibold tracking-tight">Memorify</span>
            </Link>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin"
                ? "Sign in to your Memorify workspace"
                : "Start building with the agent memory layer"}
            </p>
            {wsHandle && (
              <div className="mt-3 rounded-md border border-border bg-card/50 px-3 py-2 text-xs">
                <div className="text-muted-foreground">Opening workspace</div>
                <div className="font-mono text-foreground">memorify.dev/ws/{wsHandle}</div>
              </div>
            )}
          </div>

          <Show when="signed-out">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-0">
                <SignIn
                  routing="hash"
                  forceRedirectUrl={redirectUrl}
                  appearance={clerkAppearance}
                />
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <SignUp
                  routing="hash"
                  forceRedirectUrl={redirectUrl}
                  appearance={clerkAppearance}
                />
              </TabsContent>
            </Tabs>
          </Show>

          <Show when="signed-in">
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-sm text-muted-foreground">You are currently signed in</p>
              <UserButton afterSignOutUrl="/" />
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to dashboard
              </Button>
            </div>
          </Show>

          <p className="text-xs text-muted-foreground text-center">
            By continuing you agree to our terms of service and privacy policy.
          </p>
        </div>
      </section>
    </main>
  );
}
