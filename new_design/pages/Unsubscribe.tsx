import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, MailX } from "lucide-react";

type State = "loading" | "valid" | "already" | "invalid" | "confirming" | "done" | "error";

const MEMORIFY_API_URL = import.meta.env.VITE_MEMORIFY_API_URL || "";
const MEMORIFY_PUBLIC_KEY = import.meta.env.VITE_MEMORIFY_PUBLISHABLE_KEY || "";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${MEMORIFY_API_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: MEMORIFY_PUBLIC_KEY ? { apikey: MEMORIFY_PUBLIC_KEY } : {} },
        );
        const data = await res.json();
        if (data?.valid) setState("valid");
        else if (data?.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState("confirming");
    const res = await fetch(
      `/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    const data = await res.json();
    if (data?.success) setState("done");
    else if (data?.reason === "already_unsubscribed") setState("already");
    else { setError(data?.error ?? "Please try again."); setState("error"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Validating link…</p>
          </>
        )}
        {state === "valid" && (
          <>
            <MailX className="mx-auto h-10 w-10 text-primary" />
            <h1 className="mt-4 text-xl font-semibold">Unsubscribe from Memorify emails?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You'll stop receiving notifications at this address.
            </p>
            <Button onClick={confirm} className="mt-6 w-full">Confirm unsubscribe</Button>
          </>
        )}
        {state === "confirming" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Processing…</p>
          </>
        )}
        {state === "done" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We won't send notifications to this address anymore.
            </p>
          </>
        )}
        {state === "already" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold">Already unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">This address is already opted out.</p>
          </>
        )}
        {state === "invalid" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Invalid or expired link</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This unsubscribe link is no longer valid.
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || "Please try again."}</p>
          </>
        )}
      </div>
    </div>
  );
}
