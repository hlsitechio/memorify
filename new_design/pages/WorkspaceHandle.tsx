import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Zap, Loader2 } from "lucide-react";

/**
 * Public route: /ws/:handle
 * Resolves the handle to an email + workspace_code and redirects to /auth
 * with the sign-in form pre-filled for that workspace.
 */
export default function WorkspaceHandle() {
  const { handle = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workspace/resolve?handle=${encodeURIComponent(handle)}`);
        const row = await res.json();
        if (cancelled) return;
        if (!res.ok || !row?.email) {
          setError(`No workspace found for "${handle}"`);
          return;
        }
        const qs = new URLSearchParams({
          email: row.email,
          ws: handle,
          code: row.workspace_code ?? "",
        });
        navigate(`/auth?${qs.toString()}`, { replace: true });
      } catch {
        if (!cancelled) setError(`No workspace found for "${handle}"`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, navigate]);

  return (
    <main className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="h-9 w-9 mx-auto rounded-md bg-gradient-primary flex items-center justify-center">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Workspace not found</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate("/auth")}
              className="text-sm underline text-foreground"
            >
              Go to sign in
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Opening <span className="font-mono">memorify.dev/ws/{handle}</span>…
            </div>
          </>
        )}
      </div>
    </main>
  );
}