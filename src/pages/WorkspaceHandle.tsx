import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
      const { data, error } = await supabase.rpc("resolve_workspace_handle", {
        _handle: handle,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.email) {
        setError(`No workspace found for "${handle}"`);
        return;
      }
      const qs = new URLSearchParams({
        email: row.email,
        ws: handle,
        code: row.workspace_code ?? "",
      });
      navigate(`/auth?${qs.toString()}`, { replace: true });
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
