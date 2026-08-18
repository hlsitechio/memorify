import { useEffect, useRef, useState } from "react";

export const DashboardPreview = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative overflow-hidden bg-[#05060a] py-20 lg:py-32">
      <div className="container relative z-10 max-w-6xl">
        <div className="text-center mb-16">
          <p className="mem-kicker">Unified Interface</p>
          <h2 className="mt-5 text-4xl font-semibold text-white sm:text-5xl">
            Everything in <span className="mem-gradient-text">one place.</span>
          </h2>
        </div>

        <div 
          ref={containerRef} 
          className={`mem-dashboard-preview ${isVisible ? "is-visible" : ""} relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-[#1e293b] bg-[#0d111a] shadow-2xl`}
          style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px rgba(16, 185, 129, 0.15)" }}
        >
          {/* Mac-style Window Header */}
          <div className="flex h-12 items-center border-b border-[#1e293b] bg-[#090b10] px-4">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-[#ef4444] opacity-80" />
              <div className="h-3 w-3 rounded-full bg-[#eab308] opacity-80" />
              <div className="h-3 w-3 rounded-full bg-[#22c55e] opacity-80" />
            </div>
            <div className="mx-auto flex h-6 items-center rounded bg-[#1e293b] px-4 text-[11px] font-medium text-slate-400">
              memorify.dev / hlsitechio / memorify
            </div>
          </div>

          {/* 3-Column Dashboard Layout */}
          <div className="grid grid-cols-[220px_1fr_300px] text-sm text-slate-300 h-[600px] relative">
            
            {/* Sidebar */}
            <div className="border-r border-[#1e293b] bg-[#090b10]/50 p-4">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-500/20 text-emerald-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-semibold text-white">hlsitechio</span>
              </div>
              
              <div className="space-y-1">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workspace</p>
                <div className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                  <div className="h-4 w-4 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/50"><span className="block w-1.5 h-1.5 rounded-full bg-cyan-500"></span></div>
                  Overview
                </div>
                <div className="flex cursor-default items-center gap-2 rounded bg-white/10 px-2 py-1.5 text-white">
                  <div className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/50"><span className="block w-1.5 h-1.5 rounded-full bg-amber-500"></span></div>
                  Memory Vault
                </div>
                <div className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                  <div className="h-4 w-4 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/50"><span className="block w-1.5 h-1.5 rounded-full bg-blue-500"></span></div>
                  Documents
                </div>
                <div className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                  <div className="h-4 w-4 rounded-full bg-violet-500/20 flex items-center justify-center border border-violet-500/50"><span className="block w-1.5 h-1.5 rounded-full bg-violet-500"></span></div>
                  Skills
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-[#0d111a] p-8">
              <div className="mb-2 text-xs font-medium text-emerald-400">MEMORY RETRIEVAL</div>
              <h1 className="mb-6 text-2xl font-semibold text-white">Architecture Context: JSON-RPC 2.0 implementation</h1>
              
              <p className="mb-6 text-slate-400">
                Found robust matches connecting recent agent activity to the MCP 2024-11-05 spec upgrade. 
                The gateway perfectly routes batch payloads via parallel edge functions.
              </p>

              <div className="rounded-xl border border-[#1e293b] bg-[#090b10]/50 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#1e293b] px-2 py-1 text-xs text-white">mcp.ts</span>
                    <span className="text-xs text-slate-500">Updated 2 hours ago</span>
                  </div>
                  <span className="text-xs text-emerald-500">98% Match</span>
                </div>
                <div className="font-mono text-xs text-[#38bdf8] whitespace-pre bg-[#05060a] p-4 rounded border border-[#1e293b]">
                  {`"jsonrpc": "2.0",\n"method": "initialize",\n"params": {\n  "protocolVersion": "2024-11-05"\n}`}
                </div>
              </div>
            </div>

            {/* Right Sidebar (Agent Activity) */}
            <div className="border-l border-[#1e293b] bg-[#090b10]/50 p-6 relative">
              <h3 className="mb-6 text-sm font-semibold text-white">Agent Intelligence</h3>
              
              <div className="space-y-6">
                <div className="relative pl-4 border-l border-[#1e293b]">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-[#0d111a]" />
                  <p className="text-xs text-slate-400"><span className="font-medium text-white">Claude Code</span> ran skill <span className="text-violet-400">docs_sync</span></p>
                  <p className="mt-1 text-[10px] text-slate-600">2 mins ago</p>
                </div>
                <div className="relative pl-4 border-l border-[#1e293b]">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-amber-500 ring-4 ring-[#0d111a]" />
                  <p className="text-xs text-slate-400"><span className="font-medium text-white">Cursor</span> queried <span className="text-amber-400">Memory Vault</span></p>
                  <p className="mt-1 text-[10px] text-slate-600">14 mins ago</p>
                </div>
                <div className="relative pl-4 border-l border-transparent">
                  <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-4 ring-[#0d111a]" />
                  <p className="text-xs text-slate-400"><span className="font-medium text-white">Gateway</span> validated token</p>
                  <p className="mt-1 text-[10px] text-slate-600">1 hour ago</p>
                </div>
              </div>

              <div className="absolute bottom-6 left-6 right-6 pt-4 border-t border-[#1e293b]">
                <div className="flex items-center gap-2 rounded-full bg-[#1e293b] px-3 py-2">
                  <span className="text-xs text-slate-500">@Cursor analyze memory...</span>
                  <div className="ml-auto h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
};
