import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Plus, Search, Database as DbIcon, Loader2, Trash2, Wand2, FileJson, Tag } from "lucide-react";

type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  schema: Record<string, any>;
  item_count: number;
  created_at: string;
};

type Item = {
  id: string;
  collection_id: string;
  data: Record<string, any>;
  tags: string[] | null;
  ai_summary: string | null;
  created_at: string;
};

type Filter = { field: string; op: string; value: any };

function applyFilters(items: Item[], filters: Filter[]): Item[] {
  return items.filter((it) => {
    return filters.every((f) => {
      const v = it.data?.[f.field];
      const fv = f.value;
      switch (f.op) {
        case "eq": return v == fv;
        case "neq": return v != fv;
        case "gt": return Number(v) > Number(fv);
        case "gte": return Number(v) >= Number(fv);
        case "lt": return Number(v) < Number(fv);
        case "lte": return Number(v) <= Number(fv);
        case "contains": return String(v ?? "").toLowerCase().includes(String(fv).toLowerCase());
        case "in": return Array.isArray(fv) ? fv.includes(v) : false;
        default: return true;
      }
    });
  });
}

export default function DatabasePage() {
  const { action } = useApi();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importHint, setImportHint] = useState("");
  const [importing, setImporting] = useState(false);
  const [askText, setAskText] = useState("");
  const [asking, setAsking] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [filterExplanation, setFilterExplanation] = useState<string | null>(null);
  const [textSearch, setTextSearch] = useState("");

  const active = collections.find((c) => c.id === activeId) ?? null;

  const loadCollections = useCallback(async () => {
    const { data, error } = await action("collections.list", {});
    if (error) return toast.error(error);
    setCollections((data as Collection[]) ?? []);
    if (!activeId && data && (data as any[])[0]) setActiveId((data as any[])[0].id);
  }, [action, activeId]);

  const loadItems = useCallback(async (cid: string) => {
    setLoading(true);
    const { data, error } = await action("collection_items.list", { collection_id: cid });
    setLoading(false);
    if (error) return toast.error(error);
    setItems((data as Item[]) ?? []);
  }, [action]);

  useEffect(() => { loadCollections(); }, [loadCollections]);
  useEffect(() => {
    setActiveFilters([]); setFilterExplanation(null); setTextSearch("");
    if (activeId) loadItems(activeId);
  }, [activeId, loadItems]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (activeFilters.length) list = applyFilters(list, activeFilters);
    if (textSearch.trim()) {
      const q = textSearch.toLowerCase();
      list = list.filter((it) =>
        JSON.stringify(it.data).toLowerCase().includes(q) ||
        (it.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, activeFilters, textSearch]);

  const fields = useMemo(() => {
    if (active?.schema && Object.keys(active.schema).length) return Object.keys(active.schema);
    const set = new Set<string>();
    items.slice(0, 20).forEach((it) => Object.keys(it.data ?? {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [active, items]);

  const handleSmartImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const { data, error } = await action("collections.import_ai", {
        text: importText,
        hint: importHint,
      });
      if (error) throw new Error(error);
      toast.success(`Imported "${data?.name ?? "collection"}"`);
      setImportOpen(false); setImportText(""); setImportHint("");
      await loadCollections();
      if (data?.id) setActiveId(data.id);
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleAsk = async () => {
    if (!askText.trim() || !active) return;
    setAsking(true);
    try {
      const { data, error } = await action("collections.query_ai", {
        question: askText,
        collection_id: active.id,
      });
      if (error) throw new Error(error);
      setActiveFilters(data?.filters ?? []);
      setFilterExplanation(data?.explanation ?? null);
    } catch (e: any) {
      toast.error(e.message ?? "Query failed");
    } finally { setAsking(false); }
  };

  const handleAddBlank = async () => {
    if (!active) return;
    const blank: Record<string, any> = {};
    fields.forEach((f) => { blank[f] = ""; });
    const { error } = await action("collection_items.add", {
      collection_id: active.id,
      data: blank,
    });
    if (error) return toast.error(error);
    loadItems(active.id);
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await action("collection_items.delete", { id });
    if (error) return toast.error(error);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setCollections((prev) => prev.map((c) => c.id === activeId ? { ...c, item_count: Math.max(c.item_count - 1, 0) } : c));
  };

  const handleDeleteCollection = async () => {
    if (!active) return;
    if (!confirm(`Delete collection "${active.name}" and all its items?`)) return;
    const { error } = await action("collections.delete", { id: active.id });
    if (error) return toast.error(error);
    toast.success("Collection deleted");
    const remaining = collections.filter((c) => c.id !== active.id);
    setCollections(remaining);
    setActiveId(remaining[0]?.id ?? null);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <DbIcon className="h-6 w-6 text-primary" />
            Database
            <Badge variant="secondary" className="ml-2 gap-1"><Sparkles className="h-3 w-3" /> AI-Native</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schemaless collections. Drop anything in. Ask in plain English. No SQL.
          </p>
        </div>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button><Wand2 className="h-4 w-4 mr-2" /> Smart Import</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Smart Import</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Paste anything — CSV, JSON, a list, free-form notes. AI will detect the structure, name the collection, and create items.
            </p>
            <Input placeholder="Optional hint, e.g. 'these are clients'" value={importHint} onChange={(e) => setImportHint(e.target.value)} />
            <Textarea
              placeholder={`name, email, plan\nAcme, hi@acme.com, pro\nGlobex, ops@globex.io, free`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="min-h-[240px] font-mono text-sm"
            />
            <div className="flex justify-end">
              <Button onClick={handleSmartImport} disabled={importing || !importText.trim()}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Import with AI
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        <Card className="col-span-3 p-3 flex flex-col min-h-0">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Collections ({collections.length})
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 pr-2">
              {collections.length === 0 && (
                <p className="text-sm text-muted-foreground px-2 py-4">
                  No collections yet. Click <b>Smart Import</b> to start.
                </p>
              )}
              {collections.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                    activeId === c.id ? "bg-accent" : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{c.name}</span>
                    <Badge variant="outline" className="shrink-0">{c.item_count}</Badge>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{c.description}</p>}
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <Card className="col-span-9 p-4 flex flex-col min-h-0">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <div className="max-w-md">
                <FileJson className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No collection selected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create one with Smart Import — paste a CSV, JSON, or just describe what you want to track.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold">{active.name}</h2>
                  {active.description && <p className="text-sm text-muted-foreground">{active.description}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {fields.map((f) => (
                      <Badge key={f} variant="secondary" className="text-xs gap-1">
                        <Tag className="h-3 w-3" />{f}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleAddBlank}><Plus className="h-4 w-4 mr-1" />Row</Button>
                  <Button variant="ghost" size="sm" onClick={handleDeleteCollection}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 mb-3 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                    <Input
                      placeholder='Ask in plain English — e.g. "show pro plan only" or "newest 10"'
                      value={askText}
                      onChange={(e) => setAskText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={handleAsk} disabled={asking || !askText.trim()}>
                    {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
                  </Button>
                  {(activeFilters.length > 0 || filterExplanation) && (
                    <Button variant="ghost" onClick={() => { setActiveFilters([]); setFilterExplanation(null); setAskText(""); }}>Clear</Button>
                  )}
                </div>
                {filterExplanation && (
                  <p className="text-xs text-muted-foreground">{filterExplanation}</p>
                )}
                {activeFilters.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {activeFilters.map((f, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {f.field} {f.op} {String(Array.isArray(f.value) ? f.value.join(",") : f.value)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Filter visible rows…" value={textSearch} onChange={(e) => setTextSearch(e.target.value)} className="pl-9" />
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                {loading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : visibleItems.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No items match.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card border-b">
                      <tr>
                        {fields.map((f) => (
                          <th key={f} className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">{f}</th>
                        ))}
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((it) => (
                        <tr key={it.id} className="border-b hover:bg-accent/30">
                          {fields.map((f) => (
                            <td key={f} className="px-3 py-2 align-top max-w-xs truncate">
                              {formatCell(it.data?.[f])}
                            </td>
                          ))}
                          <td className="px-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(it.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </ScrollArea>
              <div className="text-xs text-muted-foreground mt-2">
                Showing {visibleItems.length} of {items.length}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatCell(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}