// content/extractor.js — Per-site DOM extractors.
// Injects window.__memorifyExtract() that the popup calls via chrome.scripting.executeScript.
// Returns { title, content, source, url } or null.

(function () {
  const url = window.location.href;
  const hostname = window.location.hostname;

  // ── Helper: convert an element to readable markdown-ish text ──
  function toText(el) {
    if (!el) return "";
    // Clone to avoid modifying the page
    const clone = el.cloneNode(true);
    // Remove scripts, styles, hidden elements
    clone.querySelectorAll("script, style, noscript, [aria-hidden='true'], .hidden, [style*='display:none'], [style*='display: none']").forEach((e) => e.remove());
    // Convert to text with line breaks
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
        const tag = node.tagName.toLowerCase();
        if (["br", "p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "blockquote", "pre"].includes(tag)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });
    const lines = [];
    let currentLine = "";
    let prevWasBlock = false;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          currentLine += (currentLine ? " " : "") + text;
          prevWasBlock = false;
        }
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        if (!prevWasBlock) lines.push("");
        prevWasBlock = true;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.join("\n").trim();
  }

  // ── NotebookLM extractor ──
  function extractNotebookLM() {
    // NotebookLM renders notes in the main content area
    // The notes are typically in a rich text editor or markdown area
    const notes = document.querySelectorAll("[role='textbox'], [contenteditable='true'], .note-card, .note-content, .doc-content, .prose");
    if (notes.length === 0) {
      // Fallback: grab the main content area
      const main = document.querySelector("main, [role='main'], .main-content");
      if (main) return { title: document.title, content: toText(main) };
      return null;
    }
    const content = Array.from(notes).map((n) => toText(n)).filter(Boolean).join("\n\n---\n\n");
    if (!content) return null;
    return {
      title: document.title.replace(/ - NotebookLM$/, "").trim() || "NotebookLM capture",
      content,
    };
  }

  // ── ChatGPT extractor ──
  function extractChatGPT() {
    // ChatGPT conversations are in [data-testid^="conversation-turn-"] elements
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    if (turns.length === 0) {
      // Fallback: grab all message-like elements
      const messages = document.querySelectorAll("[class*='message'], [class*='prose'], [role='article']");
      if (messages.length === 0) return null;
      const content = Array.from(messages).map((m) => toText(m)).filter(Boolean).join("\n\n---\n\n");
      return content ? { title: "ChatGPT conversation", content } : null;
    }
    const lines = [];
    turns.forEach((turn, i) => {
      const isUser = turn.querySelector('[data-testid^="conversation-turn-"]')?.getAttribute("data-testid")?.includes("user");
      const role = i % 2 === 0 ? "**User:**" : "**Assistant:**";
      const text = toText(turn);
      if (text) lines.push(`${role}\n${text}`);
    });
    if (lines.length === 0) return null;
    return {
      title: "ChatGPT conversation",
      content: lines.join("\n\n---\n\n"),
    };
  }

  // ── Claude.ai extractor ──
  function extractClaude() {
    // Claude.ai conversations have [data-testid="user-message"] and assistant responses
    const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
    const assistantMsgs = document.querySelectorAll('[class*="prose"]');
    if (userMsgs.length === 0 && assistantMsgs.length === 0) return null;
    const lines = [];
    userMsgs.forEach((msg) => {
      const text = toText(msg);
      if (text) lines.push(`**User:**\n${text}`);
    });
    assistantMsgs.forEach((msg) => {
      const text = toText(msg);
      if (text && !lines.some((l) => l.includes(text.substring(0, 50)))) {
        lines.push(`**Assistant:**\n${text}`);
      }
    });
    if (lines.length === 0) return null;
    return {
      title: "Claude conversation",
      content: lines.join("\n\n---\n\n"),
    };
  }

  // ── Gemini extractor ──
  function extractGemini() {
    // Gemini web chat
    const turns = document.querySelectorAll('[class*="conversation-container"] [class*="model-response"], [class*="user-query"]');
    if (turns.length === 0) {
      // Fallback: main content
      const main = document.querySelector("main, [role='main']");
      if (main) return { title: "Gemini conversation", content: toText(main) };
      return null;
    }
    const content = Array.from(turns).map((t) => toText(t)).filter(Boolean).join("\n\n---\n\n");
    return content ? { title: "Gemini conversation", content } : null;
  }

  // ── Generic page extractor ──
  function extractGeneric() {
    // Try article tag first, then main, then body
    const article = document.querySelector("article, main, [role='main'], .post-content, .article-content, .entry-content, .prose");
    if (article && article.textContent.trim().length > 200) {
      return { title: document.title, content: toText(article) };
    }
    // Fallback: grab everything but nav/footer/sidebar
    const body = document.body.cloneNode(true);
    body.querySelectorAll("nav, footer, header, aside, script, style, noscript, [aria-hidden='true']").forEach((e) => e.remove());
    const content = toText(body);
    if (content && content.length > 100) {
      return { title: document.title, content };
    }
    return null;
  }

  // ── Route to the right extractor ──
  function extract() {
    let result = null;
    if (hostname.includes("notebook.google")) {
      result = extractNotebookLM();
    } else if (hostname.includes("chatgpt.com") || hostname.includes("chat.openai.com")) {
      result = extractChatGPT();
    } else if (hostname.includes("claude.ai")) {
      result = extractClaude();
    } else if (hostname.includes("gemini.google")) {
      result = extractGemini();
    } else {
      result = extractGeneric();
    }

    if (!result) return null;
    return {
      title: result.title || document.title || "Untitled",
      content: result.content || "",
      source: url,
      extractedAt: new Date().toISOString(),
    };
  }

  // Expose for popup to call via chrome.scripting.executeScript
  window.__memorifyExtract = extract;
})();

export {};