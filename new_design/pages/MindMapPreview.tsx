import { useEffect } from "react";
import MindMap from "@/pages/dashboard/MindMap";
import { Share2 } from "lucide-react";
import { DashboardUIProvider, useDashboardUI } from "@/components/dashboard/DashboardUIContext";

/**
 * Public UI preview — no auth. Same Mind Map + Memorify design tokens.
 */
function PreviewShell() {
  const { pageMeta } = useDashboardUI();

  useEffect(() => {
    document.title = "Memorify — Mind Map preview";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-12 border-b border-border flex items-center gap-3 px-4 bg-card/60 backdrop-blur-sm sticky top-0 z-20">
        <div className="h-7 w-7 rounded-md bg-gradient-primary flex items-center justify-center shadow-glow">
          <Share2 className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <div className="text-sm font-semibold tracking-tight">Memorify</div>
        <div className="text-xs text-muted-foreground">Mind Map preview</div>
        <div className="ml-auto text-[11px] text-muted-foreground font-mono">/preview/mind-map</div>
      </header>

      <div className="h-14 border-b border-border px-6 flex items-center justify-between bg-background/90 sticky top-12 z-10">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {pageMeta?.title ?? "Mind Map"}
          </div>
          {pageMeta?.description && (
            <div className="text-xs text-muted-foreground truncate">{pageMeta.description}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">{pageMeta?.actions}</div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <MindMap />
      </div>
    </div>
  );
}

export default function MindMapPreview() {
  return (
    <DashboardUIProvider>
      <PreviewShell />
    </DashboardUIProvider>
  );
}
