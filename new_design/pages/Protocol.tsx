import { Seo } from "@/components/Seo";
import { Nav } from "@/components/memorify/Nav";
import { Protocol } from "@/components/memorify/Protocol";
import { Footer } from "@/components/memorify/Footer";

const ProtocolPage = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Seo
        title="Protocol — Memorify"
        description="The Memorify protocol: one verb-based API for memory, tools, files, connectors, and automation. POST {agent, action, input} to gateway.memorify.dev/v1"
        path="/protocol"
      />
      <Nav />
      <Protocol />
      <Footer />
    </main>
  );
};

export default ProtocolPage;