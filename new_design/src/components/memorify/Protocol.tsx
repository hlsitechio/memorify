import { Code2, Copy, Check, Loader2, Sparkles, Terminal, SquareCode, FileText, Search, Link2, Shield, Users, Brain, GitBranch, Radio } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useScrollReveal } from "@/hooks/useScrollReveal";

const codeRequest = `POST https://gateway.memorify.dev/v1
Content-Type: application/json
Authorization: Bearer mem_live_...

{
  "agent": "memory",
  "action": "remember",
  "input": {
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"],
    "namespace": "user:prefs"
  }
}`;

const codeResponse = `{
  "ok": true,
  "action": "memory.remember",
  "result": {
    "id": "mem_8f3a2b1c...",
    "mem_id": "mem_8f3a2b1c9d4e",
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"],
    "namespace": "user:prefs",
    "created_at": "2026-08-08T14:22:11Z"
  },
  "agent": {
    "id": "agent_abc123",
    "name": "my-claude-agent",
    "access_level": "both"
  }
}`;

// All protocol actions for the live editor
const protocolActions = {
  memory: {
    remember: {
      description: "Store a memory with content, tags, and optional metadata",
      example: `{
  "agent": "memory",
  "action": "remember",
  "input": {
    "content": "User prefers dark mode and cyan accents",
    "tags": ["preference", "ui"],
    "namespace": "user:prefs",
    "category": "preference",
    "metadata": { "source": "chat" }
  }
}`,
    },
    recall: {
      description: "Search memories by query, with namespace scoping",
      example: `{
  "agent": "memory",
  "action": "recall",
  "input": {
    "query": "dark mode",
    "limit": 20,
    "scope": "shared",
    "namespace": "user:prefs"
  }
}`,
    },
    list: {
      description: "List recent memories in a namespace",
      example: `{
  "agent": "memory",
  "action": "list",
  "input": {
    "limit": 50,
    "namespace": "user:prefs"
  }
}`,
    },
    update: {
      description: "Update a memory (creates version history)",
      example: `{
  "agent": "memory",
  "action": "update",
  "input": {
    "id": "mem_8f3a2b1c...",
    "content": "User prefers dark mode, cyan accents, and reduced motion"
  }
}`,
    },
    delete: {
      description: "Delete a memory (soft delete, recoverable)",
      example: `{
  "agent": "memory",
  "action": "delete",
  "input": {
    "id": "mem_8f3a2b1c..."
  }
}`,
    },
    link: {
      description: "Create a typed relation between two memories",
      example: `{
  "agent": "memory",
  "action": "link",
  "input": {
    "from_mem_id": "mem_8f3a2b1c...",
    "to_mem_id": "mem_9e4b3c2d...",
    "relation": "supports",
    "weight": 0.9
  }
}`,
    },
    neighbors: {
      description: "Get connected memories (graph traversal)",
      example: `{
  "agent": "memory",
  "action": "neighbors",
  "input": {
    "mem_id": "mem_8f3a2b1c...",
    "direction": "both",
    "depth": 2,
    "limit": 50
  }
}`,
    },
    subgraph: {
      description: "Get a subgraph around a memory for agent reasoning",
      example: `{
  "agent": "memory",
  "action": "subgraph",
  "input": {
    "mem_id": "mem_8f3a2b1c...",
    "depth": 3,
    "limit_nodes": 100
  }
}`,
    },
  },
  gateway: {
    ping: {
      description: "Health check - returns pong + agent info",
      example: `{
  "agent": "gateway",
  "action": "ping",
  "input": {}
}`,
    },
    manifest: {
      description: "Get full capability manifest",
      example: `{
  "agent": "gateway",
  "action": "manifest",
  "input": {}
}`,
    },
  },
  skills: {
    list: {
      description: "List available skills in workspace",
      example: `{
  "agent": "skills",
  "action": "list",
  "input": {}
}`,
    },
    run: {
      description: "Execute a skill by ID or slug",
      example: `{
  "agent": "skills",
  "action": "run",
  "input": {
    "slug": "code-review",
    "input": "Review this PR for security issues..."
  }
}`,
    },
  },
  connectors: {
    list: {
      description: "List configured connectors",
      example: `{
  "agent": "connectors",
  "action": "list",
  "input": {}
}`,
    },
    invoke: {
      description: "Invoke a connector action",
      example: `{
  "agent": "connectors",
  "action": "invoke",
  "input": {
    "connector": "gmail",
    "action": "search",
    "params": { "query": "from:github subject:security" }
  }
}`,
    },
  },
  documents: {
    list: {
      description: "List documents in workspace",
      example: `{
  "agent": "documents",
  "action": "list",
  "input": { "limit": 20 }
}`,
    },
    add_from_url: {
      description: "Fetch and index a document from URL",
      example: `{
  "agent": "documents",
  "action": "add_from_url",
  "input": {
    "url": "https://example.com/spec.pdf",
    "name": "API Specification"
  }
}`,
    },
    vector_search: {
      description: "Semantic search across documents",
      example: `{
  "agent": "documents",
  "action": "vector_search",
  "input": {
    "query": "authentication flow",
    "limit": 10,
    "threshold": 0.75
  }
}`,
    },
  },
  agents: {
    list: {
      description: "List agents in workspace",
      example: `{
  "agent": "agents",
  "action": "list",
  "input": {}
}`,
    },
    new: {
      description: "Create a new agent token",
      example: `{
  "agent": "agents",
  "action": "new",
  "input": {
    "name": "production-claude",
    "access_level": "both"
  }
}`,
    },
    bootstrap: {
      description: "Bootstrap agent with context",
      example: `{
  "agent": "agents",
  "action": "bootstrap",
  "input": {
    "include_recent_memories": 10,
    "include_skills": true
  }
}`,
    },
  },
  mcp: {
    servers: {
      description: "List configured MCP servers",
      example: `{
  "agent": "mcp",
  "action": "servers",
  "input": {}
}`,
    },
    tools: {
      description: "List tools from all MCP servers",
      example: `{
  "agent": "mcp",
  "action": "tools",
  "input": {}
}`,
    },
    call: {
      description: "Call an MCP tool via gateway proxy",
      example: `{
  "agent": "mcp",
  "action": "call",
  "input": {
    "server": "github",
    "tool": "create_issue",
    "arguments": { "title": "Bug", "body": "..." }
  }
}`,
    },
  },
};

export const Protocol = () => {
  const [activeAgent, setActiveAgent] = useState<keyof typeof protocolActions>("memory");
  const [activeAction, setActiveAction] = useState<string>("remember");
  const [requestJson, setRequestJson] = useState("");
  const [responseJson, setResponseJson] = useState("");
  const [copied, setCopied] = useState(false);
  const [executing, setExecuting] = useState(false);
  const { ref, isVisible } = useScrollReveal({ delay: 100 });

  // Update example when agent/action changes
  useEffect(() => {
    const action = protocolActions[activeAgent]?.[activeAction as keyof typeof protocolActions[typeof activeAgent]];
    if (action) {
      setRequestJson(action.example);
    }
  }, [activeAgent, activeAction]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executeRequest = async () => {
    setExecuting(true);
    try {
      // In production, this would hit the real gateway
      // For demo, simulate response
      await new Promise(r => setTimeout(r, 800));
      
      // Mock response based on action
      const mockResponses: Record<string, string> = {
        remember: codeResponse,
        recall: `{
  "ok": true,
  "action": "memory.recall",
  "result": [
    {
      "id": "mem_8f3a2b1c...",
      "mem_id": "mem_8f3a2b1c9d4e",
      "content": "User prefers dark mode and cyan accents",
      "tags": ["preference", "ui"],
      "namespace": "user:prefs",
      "updated_at": "2026-08-08T14:22:11Z"
    }
  ],
  "agent": { "id": "agent_abc123", "name": "my-claude-agent" }
}`,
        list: `{
  "ok": true,
  "action": "memory.list",
  "result": [
    {
      "id": "mem_8f3a2b1c...",
      "mem_id": "mem_8f3a2b1c9d4e",
      "content": "User prefers dark mode and cyan accents",
      "tags": ["preference", "ui"],
      "namespace": "user:prefs",
      "updated_at": "2026-08-08T14:22:11Z"
    },
    {
      "id": "mem_9e4b3c2d...",
      "mem_id": "mem_9e4b3c2d5e6f",
      "content": "Ships to EU only - GDPR compliance",
      "tags": ["rule", "compliance"],
      "namespace": "shared",
      "updated_at": "2026-08-07T09:15:00Z"
    }
  ],
  "agent": { "id": "agent_abc123", "name": "my-claude-agent" }
}`,
        ping: `{
  "ok": true,
  "action": "gateway.ping",
  "result": { "pong": true, "agent": "agent_abc123", "version": "0.1.1" }
}`,
      };
      
      setResponseJson(mockResponses[activeAction] || JSON.stringify({ ok: true, note: "Demo response - connect your agent token for real execution" }, null, 2));
      toast.success("Executed against demo gateway");
    } catch (e) {
      toast.error("Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  const agents = Object.keys(protocolActions) as Array<keyof typeof protocolActions>;

  return (
    <section id="protocol" className="py-24 border-t border-border/50 relative overflow-hidden" ref={ref}>
      <div className="absolute inset-0 bg-mesh opacity-30" aria-hidden />
      
      <div className="container relative">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-12 animate-in slide-in-from-bottom-4">
          <p className="text-xs font-mono text-primary mb-3 tracking-wider uppercase">PROTOCOL</p>
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Three keys. <span className="text-gradient">Any capability.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            No SQL. No schemas to memorize. Agents speak in verbs they already know —{" "}
            <span className="font-mono text-foreground">remember</span>,{" "}
            <span className="font-mono text-foreground">recall</span>,{" "}
            <span className="font-mono text-foreground">link</span>,{" "}
            <span className="font-mono text-foreground">act</span>.
          </p>
        </div>

        {/* Live Editor */}
        <div className="max-w-5xl mx-auto mb-16 animate-in slide-in-from-bottom-4 delay-200">
          <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur card-elevated overflow-hidden">
            {/* Tabs for agent categories */}
            <div className="border-b border-border/50">
              <nav className="flex gap-1 p-1" aria-label="Protocol agents">
                {agents.map((agent) => (
                  <button
                    key={agent}
                    onClick={() => {
                      setActiveAgent(agent);
                      setActiveAction(Object.keys(protocolActions[agent])[0]);
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-mono transition-colors capitalize ${
                      activeAgent === agent
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {agent}
                  </button>
                ))}
              </nav>
            </div>

            {/* Action tabs for current agent */}
            <div className="border-b border-border/50 px-4">
              <div className="flex gap-1 overflow-x-auto pb-2">
                {Object.keys(protocolActions[activeAgent]).map((action) => (
                  <button
                    key={action}
                    onClick={() => setActiveAction(action)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono whitespace-nowrap transition-colors ${
                      activeAction === action
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor panels */}
            <div className="p-4 md:p-6">
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Request panel */}
                <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
                      <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
                      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-glow" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono tracking-wider text-muted-foreground">REQUEST</span>
                      <button
                        onClick={() => copyToClipboard(requestJson)}
                        className="p-1.5 rounded hover:bg-primary/10 transition-colors"
                        aria-label="Copy request"
                      >
                        {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-xs md:text-sm font-mono leading-relaxed overflow-x-auto max-h-96">
                    <code className="text-foreground/90 whitespace-pre">{requestJson}</code>
                  </pre>
                </div>

                {/* Response panel */}
                <div className="rounded-xl border border-border bg-background/60 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-secondary/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
                      <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono tracking-wider text-muted-foreground">RESPONSE</span>
                      <button
                        onClick={executeRequest}
                        disabled={executing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gradient-primary text-primary-foreground font-mono text-xs glow-primary hover:scale-[1.01] transition-transform disabled:opacity-60"
                      >
                        {executing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Run
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 text-xs md:text-sm font-mono leading-relaxed overflow-x-auto max-h-96 text-foreground/90 whitespace-pre-wrap">
                    <code>{responseJson || "// Click \"Run\" to execute against demo gateway"}</code>
                  </pre>
                </div>
              </div>

              {/* Description */}
              <div className="mt-4 p-4 rounded-lg border border-border/50 bg-secondary/30">
                <div className="flex items-center gap-2 text-xs font-mono text-primary mb-2">
                  <SquareCode className="w-3.5 h-3.5" />
                  {protocolActions[activeAgent]?.[activeAction as keyof typeof protocolActions[typeof activeAgent]]?.description || "Select an action to see description"}
                </div>
                <p className="text-sm text-muted-foreground">
                  Endpoint: <code className="font-mono text-foreground bg-background px-1.5 py-0.5 rounded">POST https://gateway.memorify.dev/v1</code>
                  {" | Auth: "}<code className="font-mono text-foreground bg-background px-1.5 py-0.5 rounded">Bearer mem_live_...</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Static reference cards */}
        <div className="grid md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 delay-300">
          <CodeBlock label="REQUEST" code={codeRequest} />
          <CodeBlock label="RESPONSE" code={codeResponse} accent />
        </div>

        {/* Protocol specs */}
        <div className="mt-16 animate-in slide-in-from-bottom-4 delay-400">
          <h3 className="text-xl font-semibold mb-6 text-center">Full Protocol Surface</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent} className="p-4 rounded-xl border border-border/50 bg-card/40 backdrop-blur">
                <h4 className="font-mono text-sm text-primary mb-3 capitalize">{agent}</h4>
                <ul className="space-y-1.5 text-sm">
                  {Object.keys(protocolActions[agent]).map((action) => (
                    <li key={action} className="flex items-center gap-2 text-muted-foreground/80 hover:text-foreground transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                      <span className="font-mono">{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const CodeBlock = ({ label, code, accent }: { label: string; code: string; accent?: boolean }) => (
  <div className="rounded-xl border border-border bg-card/40 backdrop-blur card-elevated overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/70 bg-secondary/40">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
        <span className="w-2.5 h-2.5 rounded-full bg-foreground/10" />
        <span className={`w-2.5 h-2.5 rounded-full ${accent ? "bg-primary animate-pulse-glow" : "bg-foreground/10"}`} />
      </div>
      <span className="text-[10px] font-mono tracking-wider text-muted-foreground">{label}</span>
    </div>
    <pre className="p-5 text-xs md:text-sm font-mono leading-relaxed overflow-x-auto scrollbar-thin">
      <code className="text-foreground/90 whitespace-pre">{code}</code>
    </pre>
  </div>
);

// Export section components for Index page
export const ProtocolSection = () => <Protocol />;