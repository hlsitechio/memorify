import { LucideIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "@/components/ui/button";

export function ComingSoon({
  title,
  description,
  icon: Icon,
  blurb,
  bullets,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  blurb: string;
  bullets: string[];
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="flex-1 p-6">
        <div className="max-w-2xl mx-auto mt-8 rounded-lg border border-border bg-card p-8">
          <div className="h-12 w-12 rounded-md bg-gradient-primary flex items-center justify-center mb-5">
            <Icon className="h-6 w-6 text-primary-foreground" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{blurb}</p>
          <ul className="mt-5 space-y-2">
            {bullets.map((b) => (
              <li key={b} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-primary">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled>
              Coming soon
            </Button>
            <span className="text-xs text-muted-foreground">
              Currently in design — wiring up next.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
