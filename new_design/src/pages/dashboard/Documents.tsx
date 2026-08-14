import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileText, Trash2, Download, RefreshCcw, Search, Eye, ExternalLink, Copy, Bot, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Doc = { id: string; name: string; kind: string; size: number | null; source_url: string | null; metadata: any; created_at: string; updated_at: string };
type AgentLite = { id: string; name: string };

export default function Documents() {
  const { user } = useAuth();
  const { action } = useApi();
  const [rows, setRows] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [viewer, setViewer] = useState<{ doc: Doc; text?: string; isImage?: boolean; isPdf?: boolean; docData?: any } | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [agents, setAgents] = useState<AgentLite[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await action("documents.list", {});
    if (error) toast.error(error);
    setRows((data as Doc[]) ?? []);
    setLoading(false);
  }, [user, action]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    action("agents.list", {}).then(({ data }) => setAgents((data as AgentLite[]) ?? []));
  }, [user, action]);

  const upload = useCallback(async (files: FileList | File[]) => {
    if (!user) return;
    const list = Array.from(files);
    setUploading(list.length);
    for (const f of list) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        const { error } = await action("documents.add_from_base64", {
          name: f.name,
          base64,
          mime: f.type || "application/octet-stream",
        });
        if (error) throw new Error(error);
      } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
      setUploading((n) => n - 1);
    }
    toast.success(`Uploaded ${list.length} file${list.length > 1 ? "s" : ""}`);
    load();
  }, [user, action]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  const del = async (d: Doc) => {
    const { error } = await action("documents.delete", { id: d.id });
    if (error) return toast.error(error);
    toast.success("Deleted");
    load();
  };

  const view = async (d: Doc) => {
    setViewerLoading(true);
    try {
      const { data, error } = await action("documents.view", { id: d.id });
      if (error) throw new Error(error);
      const doc = data as any;
      const isText = doc?.kind === "text" || /\.(md|txt|json|csv|log)$/i.test(d.name);
      const isImage = doc?.kind === "image" || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(d.name);
      const isPdf = doc?.kind === "pdf" || /\.pdf$/i.test(d.name);
      setViewer({ doc: d, text: isText ? doc?.content : undefined, isImage, isPdf, docData: doc });
    } catch (e: any) { toast.error(e.message); }
    finally { setViewerLoading(false); }
  };

  const filtered = useMemo(() => rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, q]);

  const agentName = (id: string | null) => id ? (agents.find((a) => a.id === id)?.name ?? "Agent") : null;

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
          className={cn(
            "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors",
            drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 bg-card"
          )}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">Files are stored in your workspace on Neon.</p>
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
            <div key={d.id} className="grid grid-cols-[1fr_150px_120px_100px_130px_110px] items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <button onClick={() => view(d)} className="text-sm truncate text-left hover:underline">{d.name}</button>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(d.id); toast.success("ID copied"); }}
                title={d.id}
                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground truncate group"
              >
                <span className="truncate">{d.id.slice(0, 8)}…{d.id.slice(-4)}</span>
                <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0" />
              </button>
              <div className="text-xs text-muted-foreground font-mono truncate">{d.kind ?? "—"}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{d.size ? `${(d.size / 1024).toFixed(1)} KB` : "—"}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {d.metadata?.rag?.embedded > 0 && <span className="text-green-500" title={`${d.metadata.rag.embedded} chunks embedded`}>●</span>}
                {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
              </div>
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => view(d)} title="View" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><Eye className="h-3.5 w-3.5" /></button>
                {d.source_url && (
                  <a href={d.source_url} target="_blank" rel="noreferrer" title="Open source" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>
                )}
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
              <p className="text-xs text-muted-foreground font-mono truncate">{viewer?.doc.kind ?? "—"}</p>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            {viewerLoading || !viewer ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : viewer.isImage ? (
              <div className="h-full flex items-center justify-center p-4">
                <img
                  src={`data:${viewer.docData?.metadata?.mime ?? "image/png"};base64,${btoa(String.fromCharCode(...new Uint8Array(viewer.docData?.bytes?.data ?? viewer.docData?.bytes ?? [])))}`}
                  alt={viewer.doc.name}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            ) : viewer.isPdf ? (
              <div className="h-full flex flex-col items-center justify-center p-4 gap-3">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm font-medium">{viewer.doc.name}</p>
                <p className="text-xs text-muted-foreground">PDF preview not available in browser. Text has been extracted for RAG search.</p>
                {viewer.docData?.content && (
                  <pre className="w-full max-h-[60vh] overflow-auto scrollbar-thin p-3 text-xs font-mono whitespace-pre-wrap break-words bg-secondary/30 rounded border border-border">{viewer.docData.content.slice(0, 2000)}{viewer.docData.content.length > 2000 ? "\n\n[... truncated ...]" : ""}</pre>
                )}
              </div>
            ) : viewer.text !== undefined ? (
              <pre className="h-full overflow-auto scrollbar-thin p-5 text-xs font-mono whitespace-pre-wrap break-words">{viewer.text}</pre>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Preview not available for this file type.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}