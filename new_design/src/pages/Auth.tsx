import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { Zap } from "lucide-react";
import authVideo from "@/assets/auth-bg.mp4.asset.json";

/**
 * Auth page — Clerk Account Portal / modal buttons.
 * Clerk email+password / Google OAuth UI.
 */
export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const wsHandle = searchParams.get("ws");

  useEffect(() => {
    if (!loading && user) {
      if (wsHandle) {
        navigate(`/ws/${wsHandle}${window.location.search}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    }
  }, [user, loading, navigate, wsHandle]);

  return (
    <>
      <Seo title="Sign in — Memorify" description="Sign in to Memorify" />
      <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
        {authVideo?.url ? (
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            autoPlay
            muted
            loop
            playsInline
            src={authVideo.url}
          />
        ) : null}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

        <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Memorify</h1>
              <p className="text-sm text-muted-foreground">Agent motherboard</p>
            </div>
          </div>

          <Show when="signed-out">
            <p className="text-sm text-muted-foreground mb-6">
              Sign in or create an account to open your workspace.
              {wsHandle ? (
                <span className="block mt-1 text-foreground">
                  Invite workspace: <code className="text-xs">{wsHandle}</code>
                </span>
              ) : null}
            </p>
            <div className="flex flex-col gap-3">
              <SignInButton mode="modal" forceRedirectUrl="/dashboard">
                <Button className="w-full" size="lg">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
                <Button className="w-full" size="lg" variant="outline">
                  Create account
                </Button>
              </SignUpButton>
            </div>
          </Show>

          <Show when="signed-in">
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-sm text-muted-foreground">You are signed in</p>
              <UserButton afterSignOutUrl="/" />
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to dashboard
              </Button>
            </div>
          </Show>
        </div>
      </div>
    </>
  );
}
