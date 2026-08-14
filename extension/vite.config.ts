import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const EXT_DIR = "G:/memorify/extension";

export default defineConfig({
  root: EXT_DIR,
  plugins: [
    react(),
    {
      name: "copy-extension-files",
      closeBundle() {
        const out = resolve(EXT_DIR, "dist");
        if (!existsSync(out)) mkdirSync(out, { recursive: true });

        // Copy manifest.json
        copyFileSync(resolve(EXT_DIR, "manifest.json"), resolve(out, "manifest.json"));

        // Copy icons
        const iconsDir = resolve(out, "icons");
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
        for (const s of [16, 48, 128]) {
          copyFileSync(resolve(EXT_DIR, `icons/icon${s}.png`), resolve(out, `icons/icon${s}.png`));
        }

        // Copy popup.css
        const popupDir = resolve(out, "popup");
        if (!existsSync(popupDir)) mkdirSync(popupDir, { recursive: true });
        try { copyFileSync(resolve(EXT_DIR, "popup/popup.css"), resolve(out, "popup/popup.css")); } catch {}

        // Content script: copy the SOURCE directly as IIFE (no module wrapping)
        const contentDir = resolve(out, "content");
        if (!existsSync(contentDir)) mkdirSync(contentDir, { recursive: true });
        const extractorSrc = readFileSync(resolve(EXT_DIR, "content/extractor.ts"), "utf-8");
        const cleanJs = extractorSrc.replace(/\nexport \{\};?\s*$/, "");
        writeFileSync(resolve(contentDir, "extractor.js"), cleanJs);
        console.log("[copy] content/extractor.js written as plain IIFE");

        // Fix popup.html: remove modulepreload links (Chrome extensions can't use cross-world preloads)
        const popupHtmlPath = resolve(out, "popup/popup.html");
        let popupHtml = readFileSync(popupHtmlPath, "utf-8");
        popupHtml = popupHtml.replace(/<link rel="modulepreload"[^>]*>/g, "");
        writeFileSync(popupHtmlPath, popupHtml);
        console.log("[fix] Removed modulepreload links from popup.html");
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      // Only build popup + background through Vite. Content script is copied as-is.
      input: {
        popup: resolve(EXT_DIR, "popup/popup.html"),
        background: resolve(EXT_DIR, "background/service-worker.ts"),
      },
      external: [
        /@solana\/.*/,
        "bs58",
        "buffer",
      ],
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background/service-worker.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        format: "es",
      },
    },
  },
  define: {
    "process.env.CLERK_PUBLISHABLE_KEY": JSON.stringify("pk_live_Y2xlcmsubWVtb3JpZnkuZGV2JA"),
    "process.env.CLERK_SYNC_HOST": JSON.stringify("https://memorify.dev"),
  },
});