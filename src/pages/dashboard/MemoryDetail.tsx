import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Archive, ArchiveRestore, History, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type MemoryRow = {
  id: string;
  mem_id: string | null;
  namespace: string;
  category: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  version: number;
  namespace: string;
  category: string;
  content: string;
  tags: string[] | null;
  metadata: any;
  created_at: string;
};

export default function MemoryDetail() {
  const { memId } = useParams<{ memId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<MemoryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ namespace: "", category: "general", content: "", tags: "", metadata: "{}" });
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user || !memId) return;
      setLoading(true);
      // Try by mem_id first, then by uuid id
      let { data } = await supabase
        .from("memories")
        .select("*")
        .eq("user_id", user.id)
        .eq("mem_id", memId)
        .maybeSingle();
      if (!data) {
        const r2 = await supabase
          .from("memories")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", memId)
          .maybeSingle();
        data = r2.data as any;
      }
      if (!data) {
        toast.error("Memory not found");
        setLoading(false);
        return;
      }
      const r = data as any as MemoryRow;
      setRow(r);
      setForm({
        namespace: r.namespace,
        category: r.category || "general",
        content: r.content,
        tags: (r.tags ?? []).join(", "),
        metadata: JSON.stringify(r.metadata ?? {}, null, 2),
      });
      const { data: vs } = await supabase
        .from("memory_versions" as any)
        .select("*")
        .eq("memory_id", r.id)
        .order("version", { ascending: false });
      setVersions((vs as any) ?? []);
      setLoading(false);
    };
    load();
  }, [user, memId]);

  const save = async () => {
    if (!row) return;
    let metadata: any = {};
    try { metadata = JSON.parse(form.metadata || "{}"); } catch { return toast.error("Invalid JSON metadata"); }
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase.from("memories")
      .update({
        namespace: form.namespace,
        category: form.category || "general",
        content: form.content,
        tags,
        metadata,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Saved — version recorded");
  };

  const archive = async (value: boolean) => {
    if (!row) return;
    const { error } = await supabase.from("memories")
      .update({ archived: value, archived_at: value ? new Date().toISOString() : null } as any)
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(value ? "Archived" : "Restored");
    navigate("/dashboard/memory");
  };

  const del = async () => {
    if (!row) return;
    if (!confirm("Delete this memory permanently?")) return;
    const { error } = await supabase.from("memories").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate("/dashboard/memory");
  };

  const restoreVersion = (v: VersionRow) => {
    setForm({
      namespace: v.namespace,
      category: v.category || "general",
      content: v.content,
      tags: (v.tags ?? []).join(", "),
      metadata: JSON.stringify(v.metadata ?? {}, null, 2),
    });
    toast.info(`Loaded v${v.version} — click Save to restore`);
  };

  return (
    <>
      <PageHeader
        title="Memory"
        description={row?.mem_id ?? memId ?? "Detail"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/memory")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
            </Button>
            {row && (row.archived ? (
              <Button variant="outline" size="sm" onClick={() => archive(false)}>
                <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" /> Restore
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => archive(true)}>
                <Archive className="h-3.5 w-3.5 mr-1.5" /> Archive
              </Button>
            ))}
            <Button variant="destructive" size="sm" onClick={del} disabled={!row}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
            <Button size="sm" onClick={save} disabled={!row}>Save</Button>
          </>
        }
      />

      <div className="p-6 overflow-y-auto scrollbar-thin h-[calc(100vh-3.5rem)]">
        {loading ? (
          <div className="text-center py-20 text-sm text-muted-foreground">Loading…</div>
        ) : !row ? (
          <div className="text-center py-20 text-sm text-muted-foreground">Memory not found.</div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {row.mem_id && (
                <span className="font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
                  {row.mem_id}
                </span>
              )}
              <span>Created {format(new Date(row.created_at), "PP p")}</span>
              <span>·</span>
              <span>Updated {format(new Date(row.updated_at), "PP p")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Namespace</Label>
                <Input value={form.namespace} onChange={(e) => setForm({ ...form, namespace: e.target.value })} className="font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Content</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="min-h-[50vh] resize-y"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tags (comma separated)</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Metadata (JSON)</Label>
                <Textarea
                  rows={6}
                  className="font-mono text-xs"
                  value={form.metadata}
                  onChange={(e) => setForm({ ...form, metadata: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/30">
              <button
                onClick={() => setShowVersions((s) => !s)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5" /> Versions ({versions.length})
                </span>
                <span className="text-[10px]">{showVersions ? "Hide" : "Show"}</span>
              </button>
              {showVersions && (
                <div className="border-t border-border divide-y divide-border max-h-96 overflow-y-auto scrollbar-thin">
                  {versions.length === 0 ? (
                    <div className="p-4 text-xs text-muted-foreground">No previous versions yet.</div>
                  ) : versions.map((v) => (
                    <div key={v.id} className="p-3 text-xs space-y-1 hover:bg-secondary/30">
                      <div className="flex items-center justify-between">
                        <span className="font-mono">v{v.version}</span>
                        <span className="text-muted-foreground">{format(new Date(v.created_at), "PP p")}</span>
                      </div>
                      <div className="text-muted-foreground">{v.category} · {v.namespace}</div>
                      <div className="line-clamp-3">{v.content}</div>
                      <div className="pt-1">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => restoreVersion(v)}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Load into editor
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
