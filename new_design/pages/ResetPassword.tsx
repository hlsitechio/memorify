import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Seo } from "@/components/Seo";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await user?.update({ password });
      toast.success("Password updated");
      navigate("/dashboard");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <Seo
        title="Reset your Memorify password"
        description="Choose a new password for your Memorify account."
        path="/reset-password"
      />
      <form onSubmit={handle} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
      </form>
    </main>
  );
}