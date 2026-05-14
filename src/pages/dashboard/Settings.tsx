import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  ACCENT_PRESETS,
  type HSL,
  applyAccent,
  getStoredAccent,
  hexToHsl,
  hslToHex,
  resetAccent,
  setStoredAccent,
} from "@/lib/theme";
import { Check, RotateCcw, Palette, User, Briefcase, ShieldAlert, Bot } from "lucide-react";
import { AgentsManager } from "./Agents";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const [accent, setAccent] = useState<HSL>(
    () => getStoredAccent() ?? { h: 174, s: 85, l: 55 }
  );
  const accentHex = useMemo(() => hslToHex(accent), [accent]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name ?? ""));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: user.id, display_name: displayName }, { onConflict: "user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  const pick = (hsl: HSL) => {
    setAccent(hsl);
    applyAccent(hsl);
  };

  const persist = () => {
    setStoredAccent(accent);
    toast.success("Accent saved");
  };

  const reset = () => {
    resetAccent();
    setAccent({ h: 174, s: 85, l: 55 });
    toast.success("Accent reset");
  };

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, workspace, and appearance" />
      <div className="p-6 max-w-3xl">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl">
            <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" />Profile</TabsTrigger>
            <TabsTrigger value="design" className="gap-1.5"><Palette className="h-3.5 w-3.5" />Design</TabsTrigger>
            <TabsTrigger value="agents" className="gap-1.5"><Bot className="h-3.5 w-3.5" />Agents</TabsTrigger>
            <TabsTrigger value="workspace" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />Workspace</TabsTrigger>
            <TabsTrigger value="danger" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
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
          </TabsContent>

          <TabsContent value="design" className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold">Accent color</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Changes the primary color used across buttons, links, gradients, and rings.
                  </p>
                </div>
                <div
                  className="h-10 w-10 rounded-lg border border-border shadow-inner"
                  style={{ background: `hsl(${accent.h} ${accent.s}% ${accent.l}%)` }}
                />
              </div>

              {/* Presets */}
              <div className="space-y-2 mb-6">
                <Label className="text-xs text-muted-foreground">Presets</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((p) => {
                    const active = p.hsl.h === accent.h && p.hsl.s === accent.s && p.hsl.l === accent.l;
                    return (
                      <button
                        key={p.name}
                        onClick={() => pick(p.hsl)}
                        className={cn(
                          "h-9 w-9 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center",
                          active ? "border-foreground" : "border-border"
                        )}
                        style={{ background: `hsl(${p.hsl.h} ${p.hsl.s}% ${p.hsl.l}%)` }}
                        title={p.name}
                        aria-label={p.name}
                      >
                        {active && <Check className="h-4 w-4 text-background" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom picker */}
              <div className="space-y-3 mb-6">
                <Label className="text-xs text-muted-foreground">Custom</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentHex}
                    onChange={(e) => pick(hexToHsl(e.target.value))}
                    className="h-10 w-14 rounded-md border border-border bg-transparent cursor-pointer"
                  />
                  <Input
                    value={accentHex.toUpperCase()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) pick(hexToHsl(v));
                    }}
                    className="w-32 font-mono text-xs"
                  />
                  <span className="text-xs text-muted-foreground font-mono">
                    hsl({accent.h}, {accent.s}%, {accent.l}%)
                  </span>
                </div>
              </div>

              {/* Fine controls */}
              <div className="space-y-4 mb-6">
                {[
                  { key: "h" as const, label: "Hue", max: 360 },
                  { key: "s" as const, label: "Saturation", max: 100 },
                  { key: "l" as const, label: "Lightness", max: 100 },
                ].map(({ key, label, max }) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono">{accent[key]}{key === "h" ? "°" : "%"}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={max}
                      value={accent[key]}
                      onChange={(e) => pick({ ...accent, [key]: Number(e.target.value) })}
                      className="w-full accent-primary"
                    />
                  </div>
                ))}
              </div>

              {/* Preview */}
              <div className="rounded-md border border-border p-4 space-y-3 bg-background">
                <div className="flex items-center gap-2">
                  <Button size="sm">Primary action</Button>
                  <Button size="sm" variant="secondary">Secondary</Button>
                  <Button size="sm" variant="outline">Outline</Button>
                </div>
                <div className="h-2 rounded-full bg-gradient-primary" />
                <p className="text-xs text-muted-foreground">
                  Link looks like <a className="text-primary underline-offset-2 hover:underline">this</a>.
                </p>
              </div>

              <div className="flex gap-2 mt-6">
                <Button size="sm" onClick={persist}>Save accent</Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reset to default
                </Button>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="workspace">
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-sm font-semibold mb-4">Workspace</h2>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">User ID</dt><dd className="font-mono text-xs">{user?.id}</dd></div>
              </dl>
            </section>
          </TabsContent>

          <TabsContent value="danger">
            <section className="rounded-lg border border-destructive/40 bg-card p-6">
              <h2 className="text-sm font-semibold mb-2">Danger zone</h2>
              <p className="text-xs text-muted-foreground mb-4">Sign out of your Synapse workspace.</p>
              <Button variant="destructive" size="sm" onClick={async () => { await signOut(); navigate("/"); }}>Sign out</Button>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
