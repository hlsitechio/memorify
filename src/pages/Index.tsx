import { Navigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { Nav } from "@/components/memorify/Nav";
import { Hero } from "@/components/memorify/Hero";
import { Problem } from "@/components/memorify/Problem";
import { Architecture } from "@/components/memorify/Architecture";
import { Protocol } from "@/components/memorify/Protocol";
import { Primitives } from "@/components/memorify/Primitives";
import { LiveDemo } from "@/components/memorify/LiveDemo";
import { Waitlist } from "@/components/memorify/Waitlist";
import { Footer } from "@/components/memorify/Footer";

const Index = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Seo
        title="Memorify — The motherboard for AI agents"
        description="One backend any AI agent can plug into. Memory, tools, files, and connectors behind a single gateway. Replace MCP juggling with one endpoint."
        path="/"
      />
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
