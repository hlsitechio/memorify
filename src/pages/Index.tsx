import { useEffect } from "react";
import { Seo } from "@/components/Seo";
import { Nav } from "@/components/memorify/Nav";
import { Hero } from "@/components/memorify/Hero";
import { DashboardPreview } from "@/components/memorify/DashboardPreview";
import { Problem } from "@/components/memorify/Problem";
import { Architecture } from "@/components/memorify/Architecture";
import { Protocol } from "@/components/memorify/Protocol";
import { Primitives } from "@/components/memorify/Primitives";
import { LiveDemo } from "@/components/memorify/LiveDemo";
import { Pricing } from "@/components/memorify/Pricing";
import { Waitlist } from "@/components/memorify/Waitlist";
import { Footer } from "@/components/memorify/Footer";

const Index = () => {
  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ block: "start" });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return (
    <main className="mem-site min-h-screen bg-[#05060a] text-white">
      <Seo
        title="Memorify.dev"
        description="A live MCP gateway and control plane for AI agents: shared memory, searchable documents, skills, external tools, agent tokens, and workspace visibility."
        path="/"
      />
      <Nav />
      <Hero />
      <DashboardPreview />
      <Problem />
      <Protocol />
      <Architecture />
      <Primitives />
      <LiveDemo />
      <Pricing />
      <Waitlist />
      <Footer />
    </main>
  );
};

export default Index;
