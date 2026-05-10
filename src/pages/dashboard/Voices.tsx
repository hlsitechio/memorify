import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Mic, Plus, Trash2, RefreshCcw, Plug } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type Voice = { id: string; name: string; kind: string; sample_url: string | null; params: any; created_at: string };

export default function Voices() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", kind: "tts" });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("voices").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  const create = async () => {
    if (!user || !form.name.trim()) return;
    const { error } = await supabase.from("voices").insert({ user_id: user.id, name: form.name, kind: form.kind });
    if (error) return toast.error(error.message);
    toast.success("Voice added");
    setOpen(false); setForm({ name: "", kind: "tts" }); load();
  };

  const del = async (v: Voice) => {
    await supabase.from("voices").delete().eq("id", v.id);
    load();
  };

  return (
    <>
      <PageHeader
        title="Voices"
        description="Speech in, speech out — register voices for your agents."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> New voice</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New voice</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aria — narrator" /></div>
                  <div className="space-y-1.5">
                    <Label>Kind</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                      <option value="tts">Text-to-speech</option>
                      <option value="stt">Speech-to-text</option>
                      <option value="clone">Clone</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={create}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <Plug className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium mb-1">Voice synthesis requires a provider</p>
            <p className="text-muted-foreground">
              Connect ElevenLabs from <Link to="/dashboard/connectors" className="underline text-foreground">Connectors</Link> to enable real TTS/STT. Until then, voices are saved as configuration only.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center rounded-lg border border-border bg-card">
            <Mic className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No voices yet</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {rows.map((v) => (
              <div key={v.id} className="grid grid-cols-[1fr_120px_140px_80px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
                <div className="flex items-center gap-2"><Mic className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{v.name}</span></div>
                <div className="text-xs text-muted-foreground font-mono uppercase">{v.kind}</div>
                <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</div>
                <div className="flex justify-end"><button onClick={() => del(v)} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
