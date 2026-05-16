import { Cpu } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export const Nav = () => {
  const { user } = useAuth();
  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/50">
      <nav className="container flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-2 group">
          <div className="relative w-7 h-7 rounded-md bg-gradient-primary grid place-items-center">
            <Cpu className="w-4 h-4 text-primary-foreground" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-md bg-gradient-primary blur-md opacity-50 group-hover:opacity-80 transition-opacity" />
          </div>
          <span className="font-semibold tracking-tight">Memorify</span>
          <span className="font-mono text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 ml-1">v0.1</span>
        </a>
        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#protocol" className="hover:text-foreground transition-colors">Protocol</a>
          <a href="#primitives" className="hover:text-foreground transition-colors">Primitives</a>
          <a href="#demo" className="hover:text-foreground transition-colors">Live demo</a>
          <a href="#waitlist" className="hover:text-foreground transition-colors">Access</a>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/dashboard" className="text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2">
                Sign in
              </Link>
              <a href="#waitlist" className="text-sm font-medium px-4 py-2 rounded-md bg-foreground/[0.04] hover:bg-foreground/10 border border-border transition-colors">
                Get early access
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};
