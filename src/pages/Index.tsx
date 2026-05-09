import { Nav } from "@/components/synapse/Nav";
import { Hero } from "@/components/synapse/Hero";
import { Problem } from "@/components/synapse/Problem";
import { Architecture } from "@/components/synapse/Architecture";
import { Protocol } from "@/components/synapse/Protocol";
import { Primitives } from "@/components/synapse/Primitives";
import { LiveDemo } from "@/components/synapse/LiveDemo";
import { Waitlist } from "@/components/synapse/Waitlist";
import { Footer } from "@/components/synapse/Footer";

const Index = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Problem />
      <Architecture />
      <Protocol />
      <Primitives />
      <LiveDemo />
      <Waitlist />
      <Footer />
    </main>
  );
};

export default Index;
