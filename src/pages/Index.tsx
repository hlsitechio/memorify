import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Nav } from "@/components/synapse/Nav";
import { Hero } from "@/components/synapse/Hero";
import { Problem } from "@/components/synapse/Problem";
import { Architecture } from "@/components/synapse/Architecture";
import { Protocol } from "@/components/synapse/Protocol";
import { Primitives } from "@/components/synapse/Primitives";
// LiveDemo temporarily hidden — public demo token + endpoint not yet wired to api.memorify.dev.
// import { LiveDemo } from "@/components/synapse/LiveDemo";
import { Waitlist } from "@/components/synapse/Waitlist";
import { Footer } from "@/components/synapse/Footer";

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
      <Nav />
      <Hero />
      <Problem />
      <Architecture />
      <Protocol />
      <Primitives />
      <Waitlist />
      <Footer />
    </main>
  );
};

export default Index;
