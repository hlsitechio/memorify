import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const links = [
  { href: "/#protocol", label: "MCP" },
  { href: "/#architecture", label: "Platform" },
  { href: "/#primitives", label: "Tools" },
  { href: "/#control-plane", label: "Control plane" },
  { href: "/#pricing", label: "Pricing" },
];

export const Nav = () => {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY;
      const delta = current - lastScrollY.current;

      if (current < 32 || open) setHidden(false);
      else if (delta > 7 && current > 120) setHidden(true);
      else if (delta < -7) setHidden(false);

      lastScrollY.current = current;
    };

    lastScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <header
      className={`fixed inset-x-0 top-3 z-50 transition-transform duration-300 ease-decelerate ${
        hidden ? "-translate-y-24" : "translate-y-0"
      }`}
    >
      <nav className="mem-nav-shell mx-auto flex h-14 w-[calc(100%-1.5rem)] max-w-[1376px] items-center justify-between px-3 sm:px-4">
        <a href="/#" className="mem-focus flex min-w-0 items-center gap-2.5 rounded-md" aria-label="Memorify home">
          <span className="mem-brand-mark">
            <img src="/brand/logo/logo-gateway-mark.svg" alt="" className="h-full w-full" />
          </span>
          <span className="flex items-baseline gap-1.5">
            <span className="mem-brand-word text-[15px] font-semibold">Memorify</span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-200/55 xs:inline">dev</span>
          </span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="mem-nav-link mem-focus rounded-sm text-sm">
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Link to="/auth" className="mem-focus hidden rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:text-white sm:inline-flex">
            Sign in
          </Link>
          <Link to="/auth" className="mem-primary-button mem-focus h-9 px-3.5 text-sm">
            Open app
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mem-icon-button mem-focus md:hidden"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] grid gap-1 rounded-lg border border-white/10 bg-[#070a11]/95 p-2 shadow-2xl backdrop-blur-xl md:hidden">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="mem-focus rounded-md px-3 py-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
};
