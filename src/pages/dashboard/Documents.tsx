import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileText, Trash2, Download, RefreshCcw, Search, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Doc = { id: string; name: string; mime: string | null; size: number | null; storage_path: string; status: string; created_at: string };

export default function Documents() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [viewer, setViewer] = useState<{ doc: Doc; url: string; text?: string } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("documents").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [user]);

  // Realtime: keep list in sync when agents (or other tabs) add/update/delete documents.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`documents:${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "documents", filter: `user_id=eq.${user.id}` },
        (p) => setRows((prev) => prev.some((r) => r.id === (p.new as any).id) ? prev : [p.new as any, ...prev]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "documents", filter: `user_id=eq.${user.id}` },
        (p) => setRows((prev) => prev.map((r) => r.id === (p.new as any).id ? (p.new as any) : r)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "documents", filter: `user_id=eq.${user.id}` },
        (p) => setRows((prev) => prev.filter((r) => r.id !== (p.old as any).id)))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const upload = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    const list = Array.from(files);
    setUploading(list.length);
    for (const f of list) {
      try {
        const path = `${user.id}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("documents").insert({
          user_id: user.id, name: f.name, mime: f.type, size: f.size, storage_path: path, status: "ready",
        });
        if (insErr) throw insErr;
      } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
      setUploading((n) => n - 1);
    }
    toast.success(`Uploaded ${list.length} file${list.length > 1 ? "s" : ""}`);
    load();
  }, [user]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  const del = async (d: Doc) => {
    await supabase.storage.from("documents").remove([d.storage_path]);
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const open = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const view = async (d: Doc) => {
    setViewerLoading(true);
    try {
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 600);
      if (error) throw error;
      const mime = d.mime || "";
      const isText = mime.startsWith("text/") || mime === "application/json" || /\.(md|txt|json|csv|log)$/i.test(d.name);
      let text: string | undefined;
      if (isText) {
        const res = await fetch(data.signedUrl);
        text = await res.text();
      }
      setViewer({ doc: d, url: data.signedUrl, text });
    } catch (e: any) { toast.error(e.message); }
    finally { setViewerLoading(false); }
  };

  const filtered = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Documents"
        description="Drag, drop, done."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
            <label>
              <input type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
              <Button size="sm" asChild><span><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload</span></Button>
            </label>
          </>
        }
      />
      <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => (document.querySelector<HTMLInputElement>('input[type=file]'))?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-card"}`}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">PDF, Markdown, text, images — anything up to 50MB.</p>
          {uploading > 0 && <p className="text-xs text-primary mt-2">Uploading {uploading}…</p>}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">{filtered.length} files</div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium">No documents yet</p>
            </div>
          ) : filtered.map((d) => (
            <div key={d.id} className="grid grid-cols-[1fr_120px_120px_140px_110px] items-center px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <button onClick={() => view(d)} className="text-sm truncate text-left hover:underline">{d.name}</button>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{d.mime ?? "—"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{d.size ? `${(d.size / 1024).toFixed(1)} KB` : "—"}</div>
              <div className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}</div>
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => view(d)} title="View" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Eye className="h-3.5 w-3.5" /></button>
                <button onClick={() => open(d)} title="Download" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Download className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(d)} title="Delete" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 py-3 border-b border-border flex-row items-center justify-between space-y-0">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm">{viewer?.doc.name}</DialogTitle>
              <p className="text-xs text-muted-foreground font-mono truncate">{viewer?.doc.mime ?? "—"}</p>
            </div>
            {viewer && (
              <a href={viewer.url} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground mr-6" title="Open in new tab">
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            {viewerLoading || !viewer ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : viewer.text !== undefined ? (
              <pre className="h-full overflow-auto scrollbar-thin p-5 text-xs font-mono whitespace-pre-wrap break-words">{viewer.text}</pre>
            ) : (viewer.doc.mime ?? "").startsWith("image/") ? (
              <div className="h-full flex items-center justify-center p-4 overflow-auto">
                <img src={viewer.url} alt={viewer.doc.name} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (viewer.doc.mime ?? "").startsWith("video/") ? (
              <video src={viewer.url} controls className="w-full h-full" />
            ) : (viewer.doc.mime ?? "").startsWith("audio/") ? (
              <div className="h-full flex items-center justify-center p-6"><audio src={viewer.url} controls className="w-full max-w-md" /></div>
            ) : (
              <iframe src={viewer.url} title={viewer.doc.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
