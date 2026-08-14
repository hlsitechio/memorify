// background/service-worker.ts — Memorify Clipper background service worker.
// Uses createClerkClient({ background: true }) for token refresh.
import { createClerkClient } from "@clerk/chrome-extension/client";
import { apiAction } from "../lib/memorify-api";

const PUBLISHABLE_KEY = "pk_live_Y2xlcmsubWVtb3JpZnkuZGV2JA";
const SYNC_HOST = "https://memorify.dev";

// ── Context menu setup ──
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "memorify-save",
    title: "Save to Memorify",
    contexts: ["page", "selection", "link"],
  });
  console.log("[memorify] Extension installed — context menu created");
});

// ── Context menu handler ──
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "memorify-save" || !tab?.id) return;

  let content = info.selectionText || "";
  if (!content) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (window as any).__memorifyExtract?.() ?? null,
      });
      if (result?.content) content = result.content;
    } catch (e) {
      console.error("[memorify] Extract failed:", e);
    }
  }

  if (!content) return;

  const hostname = (() => { try { return new URL(tab.url ?? "").hostname; } catch { return "unknown"; } })();
  const { error } = await apiAction("memory.add", {
    content: info.selectionText
      ? `**Selection from ${tab.title}**\n\n${info.selectionText}\n\nSource: ${tab.url}`
      : content,
    category: hostname,
    tags: [hostname, "context-menu"],
    namespace: "default",
  });

  if (error) console.error("[memorify] Save failed:", error);
  else console.log("[memorify] Saved via context menu");
});

// ── Auto-capture on known AI sites ──
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const hostname = (() => { try { return new URL(tab.url).hostname; } catch { return null; } })();
  if (!hostname) return;

  const knownSites = ["notebook.google.com", "chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com"];
  if (!knownSites.some((s) => hostname.includes(s))) return;

  const siteKey = hostname.includes("notebook.google") ? "notebooklm"
    : hostname.includes("chatgpt") || hostname.includes("chat.openai") ? "chatgpt"
    : hostname.includes("claude.ai") ? "claude"
    : hostname.includes("gemini.google") ? "gemini"
    : hostname;

  const autoEnabled = await chrome.storage.sync.get(`auto_${siteKey}`).then((r) => r[`auto_${siteKey}`]);
  if (autoEnabled === false) return;

  setTimeout(async () => {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => (window as any).__memorifyExtract?.() ?? null,
      });

      if (!result?.content || result.content.length < 100) return;

      const savedAgentKey = await chrome.storage.sync.get(`agent_${siteKey}`).then((r) => r[`agent_${siteKey}`]);
      const savedTags = await chrome.storage.sync.get(`tags_${siteKey}`).then((r) => r[`tags_${siteKey}`]);
      const tagList = savedTags ? savedTags.split(",").map((t: string) => t.trim()).filter(Boolean) : [siteKey];

      const { error } = await apiAction("memory.add", {
        content: result.content,
        category: siteKey,
        tags: [...tagList, "auto-capture"],
        namespace: savedAgentKey ? `agent:${savedAgentKey}` : "default",
      });

      if (!error) {
        console.log(`[memorify] Auto-captured ${siteKey}`);
        await apiAction("events.log", {
          kind: "extension.auto_capture",
          message: `Auto-captured ${siteKey}: ${result.title}`,
        });
      }
    } catch (e) {
      console.error("[memorify] Auto-capture failed:", e);
    }
  }, 3000);
});

// ── Message handler (popup → background) ──
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "checkAuth") {
    import("../lib/memorify-api").then(async ({ checkAuth }) => {
      sendResponse(await checkAuth());
    });
    return true;
  }
  if (msg.type === "apiAction") {
    import("../lib/memorify-api").then(async ({ apiAction }) => {
      sendResponse(await apiAction(msg.name, msg.args ?? {}, msg.workspaceId));
    });
    return true;
  }
});