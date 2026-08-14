import { ClerkProvider, Show, useUser, useOrganization } from "@clerk/chrome-extension";
import { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { checkAuth, apiAction } from "../lib/memorify-api";

const PUBLISHABLE_KEY = "pk_live_Y2xlcmsubWVtb3JpZnkuZGV2JA";
const SYNC_HOST = "https://memorify.dev";

function PopupContent() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [pageInfo, setPageInfo] = useState<{ url: string; title: string } | null>(null);
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Get current tab info
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      if (tab) {
        setPageInfo({ url: tab.url ?? "", title: tab.title ?? "" });
        const siteKey = getSiteKey(tab.url ?? "");
        chrome.storage.sync.get([`agent_${siteKey}`, `tags_${siteKey}`]).then((r) => {
          if (r[`agent_${siteKey}`]) setSelectedAgent(r[`agent_${siteKey}`]);
          if (r[`tags_${siteKey}`]) setTags(r[`tags_${siteKey}`]);
          else setTags(siteKey);
        });
      }
    });
  }, []);

  // Check auth + load agents
  const refreshAuth = useCallback(async () => {
    const auth = await checkAuth();
    setAuthInfo(auth);
    if (auth.authenticated) {
      const { data } = await apiAction("agents.list", {});
      setAgents(data ?? []);
    }
  }, []);

  useEffect(() => { refreshAuth(); }, [refreshAuth]);

  const getSiteKey = (url: string) => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("notebook.google")) return "notebooklm";
      if (u.hostname.includes("chatgpt.com") || u.hostname.includes("chat.openai.com")) return "chatgpt";
      if (u.hostname.includes("claude.ai")) return "claude";
      if (u.hostname.includes("gemini.google")) return "gemini";
      return u.hostname;
    } catch { return "unknown"; }
  };

  const showStatus = (msg: string, type: "success" | "error" = "success") => {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  };

  const capture = async () => {
    if (!pageInfo) return showStatus("No active tab", "error");
    setCapturing(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No tab");

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (window as any).__memorifyExtract?.() ?? null,
      });

      if (!result?.content) {
        showStatus("Could not extract content from this page", "error");
        return;
      }

      const siteKey = getSiteKey(pageInfo.url);
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const { data, error } = await apiAction("memory.add", {
        content: result.content,
        category: siteKey,
        tags: tagList.length ? tagList : [siteKey],
        namespace: selectedAgent ? `agent:${selectedAgent}` : "default",
      });

      if (error) throw new Error(error);

      // Also save as document if substantial
      if (result.content.length > 200) {
        await apiAction("documents.add_note", {
          title: result.title || pageInfo.title || "Captured page",
          content: result.content,
          format: "md",
        });
      }

      showStatus("Saved to Memorify ✓", "success");
    } catch (e: any) {
      showStatus(e.message ?? "Capture failed", "error");
    } finally {
      setCapturing(false);
    }
  };

  const siteKey = pageInfo ? getSiteKey(pageInfo.url) : "";

  return (
    <div className="popup-root">
      <Show when="signed-out">
        <div className="auth-state">
          <div className="logo">M</div>
          <h1>Memorify Clipper</h1>
          <p className="sub">Sign in to capture web content directly to your memory.</p>
          <p className="hint">Sign in at <a href="https://memorify.dev/auth" target="_blank" rel="noreferrer">memorify.dev</a> first, then reopen this popup.</p>
        </div>
      </Show>

      <Show when="signed-in">
        <header>
          <div className="user-info">
            <div className="avatar">{(user?.firstName ?? user?.username ?? "U").charAt(0)}</div>
            <div>
              <div className="user-name">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "User"}</div>
              <div className="user-org">{organization?.name ?? "Personal workspace"}</div>
            </div>
          </div>
        </header>

        <section className="agents-section">
          <label>Agent for this site</label>
          <select className="select" value={selectedAgent} onChange={(e) => {
            setSelectedAgent(e.target.value);
            chrome.storage.sync.set({ [`agent_${siteKey}`]: e.target.value });
          }}>
            {agents.length === 0 ? (
              <option value="">No agents — create one in dashboard</option>
            ) : (
              agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)
            )}
          </select>
        </section>

        <section className="page-info">
          <label>Current page</label>
          <div className="page-url">{pageInfo?.url ?? "—"}</div>
          <div className="page-title">{pageInfo?.title ?? "—"}</div>
        </section>

        <section className="tags-section">
          <label>Tags (comma separated)</label>
          <input type="text" className="input" value={tags} placeholder="notebooklm, research, notes"
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => chrome.storage.sync.set({ [`tags_${siteKey}`]: tags })}
          />
        </section>

        <div className="actions">
          <button className="btn-primary" onClick={capture} disabled={capturing}>
            {capturing ? "Capturing…" : "📥 Save to Memorify"}
          </button>
        </div>

        {status && <div className={`status ${status.type}`}>{status.msg}</div>}

        <footer>
          <a href="https://memorify.dev/dashboard/memory" target="_blank" rel="noreferrer">View in dashboard →</a>
        </footer>
      </Show>
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    syncHost={SYNC_HOST}
    afterSignOutUrl={chrome.runtime.getURL("popup/popup.html")}
    signInForceRedirectUrl={chrome.runtime.getURL("popup/popup.html")}
    signUpForceRedirectUrl={chrome.runtime.getURL("popup/popup.html")}
    allowedRedirectProtocols={["chrome-extension:"]}
  >
    <PopupContent />
  </ClerkProvider>
);