import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile and workspace" />
      <div className="p-6 max-w-2xl space-y-6">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-4">Profile</h2>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <Button onClick={save} disabled={busy} size="sm">{busy ? "Saving…" : "Save"}</Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-4">Workspace</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs">{user?.id}</dd></div>
          </dl>
        </section>

        <section className="rounded-lg border border-destructive/40 bg-card p-6">
          <h2 className="text-sm font-semibold mb-2">Danger zone</h2>
          <p className="text-xs text-muted-foreground mb-4">Sign out of your Synapse workspace.</p>
          <Button variant="destructive" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>Sign out</Button>
        </section>
      </div>
    </>
  );
}
