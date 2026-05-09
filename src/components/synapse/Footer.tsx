import { Cpu } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="border-t border-border/50 py-12">
      <div className="container flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-primary grid place-items-center">
            <Cpu className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-medium">Synapse</span>
          <span className="text-xs text-muted-foreground ml-2">The motherboard for AI agents.</span>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          © 2026 — built in the open.
        </p>
      </div>
    </footer>
  );
};
