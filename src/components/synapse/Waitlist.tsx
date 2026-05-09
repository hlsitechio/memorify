import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Waitlist = () => {
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return toast.error("Valid email required");
    setLoading(true);
    const { error } = await supabase.from("waitlist").insert({ email, use_case: useCase || null });
    setLoading(false);
    if (error) {
      if (error.code === "23505") {
        setDone(true);
        toast.success("You're already on the list");
      } else {
        toast.error(error.message);
      }
      return;
    }
    setDone(true);
    toast.success("You're in. We'll be in touch.");
  };

  return (
    <section id="waitlist" className="py-24 border-t border-border/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-radial opacity-60" aria-hidden />
      <div className="container relative">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider">EARLY ACCESS</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Get a gateway URL.
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Private alpha. We're onboarding teams building serious agent systems first. Tell us what you're building.
          </p>

          {done ? (
            <div className="mt-10 p-6 rounded-xl border border-primary/30 bg-card/60 backdrop-blur ring-primary-soft inline-flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <span className="font-medium">You're on the list.</span>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-10 space-y-3 text-left">
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
              />
              <textarea
                placeholder="What are you building? (optional)"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                rows={3}
                className="w-full bg-card border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-gradient-primary text-primary-foreground font-medium glow-primary hover:scale-[1.01] transition-transform disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Request access <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
