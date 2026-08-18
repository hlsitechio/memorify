import { Seo } from "@/components/Seo";
import { Nav } from "@/components/memorify/Nav";
import { Protocol } from "@/components/memorify/Protocol";
import { Footer } from "@/components/memorify/Footer";

const ProtocolPage = () => {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Seo
        title="Protocol — Memorify"
        description="Connect AI agents to Memorify over JSON-RPC 2.0 and streamable HTTP at https://memorify.dev/mcp."
        path="/protocol"
      />
      <Nav />
      <Protocol />
      <Footer />
    </main>
  );
};

export default ProtocolPage;
