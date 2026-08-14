import { Seo } from "@/components/Seo";
import { Nav } from "@/components/memorify/Nav";
import { Hero } from "@/components/memorify/Hero";
import { Problem } from "@/components/memorify/Problem";
import { Architecture } from "@/components/memorify/Architecture";
import { Protocol } from "@/components/memorify/Protocol";
import { Primitives } from "@/components/memorify/Primitives";
import { LiveDemo } from "@/components/memorify/LiveDemo";
import { SocialProof } from "@/components/memorify/SocialProof";
import { Waitlist } from "@/components/memorify/Waitlist";
import { Footer } from "@/components/memorify/Footer";

const Index = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Seo
        title="Memorify — One gateway. One connection."
        description="Replace 10+ backend integrations with one HTTP/WS/MCP endpoint. Native memory, 15+ connectors, real-time context bus, and full observability for AI agents."
        path="/"
      />
      <Nav />
      <Hero />
      <Problem />
      <Architecture />
      <Protocol />
      <Primitives />
      <LiveDemo />
      <SocialProof />
      <Waitlist />
      <Footer />
    </main>
  );
};

export default Index;
