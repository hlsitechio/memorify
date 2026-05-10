import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("h-14 border-b border-border px-6 flex items-center justify-between bg-background/80 backdrop-blur sticky top-0 z-10", className)}>
      <div className="min-w-0">
        <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>
        {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
