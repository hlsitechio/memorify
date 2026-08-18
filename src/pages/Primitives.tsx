import { Seo } from "@/components/Seo";
import { Nav } from "@/components/memorify/Nav";
import { Primitives } from "@/components/memorify/Primitives";
import { Footer } from "@/components/memorify/Footer";

const PrimitivesPage = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Seo
        title="Primitives — Memorify"
        description="Memorify primitives: durable memory, searchable documents, workspace skills, connected MCP tools, agent tokens, and event logging through one endpoint."
        path="/primitives"
      />
      <Nav />
      <Primitives />
      <Footer />
    </main>
  );
};

export default PrimitivesPage;
