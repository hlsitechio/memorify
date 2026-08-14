import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, Sparkles, Trash2, Upload, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Img = { id: string; name: string | null; url: string; size: number | null; metadata: any; created_at: string };

export default function Images() {
  const { user } = useAuth();
  const { action } = useApi();
  const [rows, setRows] = useState<Img[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await action("images.list", {});
    if (error) toast.error(error);
    setRows((data as Img[]) ?? []);
    setLoading(false);
  }, [user, action]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const { error } = await action("images.generate", { prompt });
      if (error) throw new Error(error);
      toast.success("Image generated");
      setPrompt("");
      load();
    } catch (e: any) { toast.error(e.message ?? "Generation failed"); }
    finally { setBusy(false); }
  };

  const upload = async (files: FileList) => {
    if (!user) return;
    for (const f of Array.from(files)) {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });
      const { error } = await action("images.upload", { name: f.name, base64, mime: f.type });
      if (error) toast.error(`${f.name}: ${error}`);
    }
    toast.success("Uploaded");
    load();
  };

  const del = async (i: Img) => {
    const { error } = await action("images.delete", { id: i.id });
    if (error) return toast.error(error);
    load();
  };

  return (
    <>
      <PageHeader
        title="Images"
        description="Generate or upload — images your agents can read and reuse."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            <label>
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
              <Button variant="outline" size="sm" asChild><span><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</span></Button>
            </label>
          </>
        }
      />
      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Generate with AI</div>
          <Textarea rows={2} placeholder="A serene mountain lake at golden hour, photorealistic" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" onClick={generate} disabled={busy || !prompt.trim()}>{busy ? "Generating…" : "Generate"}</Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center rounded-lg border border-border bg-card">
            <ImageIcon className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-sm font-medium">No images yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {rows.map((i) => (
              <div key={i.id} className="group relative rounded-lg border border-border bg-card overflow-hidden">
                {i.url ? (
                  <img src={i.url} alt={i.name ?? ""} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center bg-secondary/30">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs line-clamp-2">{i.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}</span>
                    <button onClick={() => del(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}