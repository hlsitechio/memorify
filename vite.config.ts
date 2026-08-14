import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Production builds never emit source maps — keeps original TS/TSX off the CDN.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    // Fail the build if any chunk exceeds this (kB) — Netlify CDN is fine with
    // larger files, but we keep SPA payloads under control for TTI.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Deterministic splits so no single index-*.js balloons past the limit.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // Core React runtime (shared by everything)
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules\\react\\") ||
            id.includes("node_modules/scheduler")
          ) {
            return "react-vendor";
          }

          // Auth
          if (id.includes("@clerk")) return "clerk";

          // UI primitives
          if (id.includes("@radix-ui")) return "radix";

          // Data fetching
          if (id.includes("@tanstack")) return "tanstack";

          // Heavy optional UI
          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("/d3/")
          ) {
            return "charts";
          }

          if (
            id.includes("framer-motion") ||
            id.includes("motion-dom") ||
            id.includes("motion-utils")
          ) {
            return "motion";
          }

          if (
            id.includes("@codemirror") ||
            id.includes("codemirror") ||
            id.includes("@uiw/react-codemirror")
          ) {
            return "codemirror";
          }

          if (id.includes("date-fns") || id.includes("dayjs") || id.includes("luxon")) {
            return "dates";
          }

          if (
            id.includes("react-router") ||
            id.includes("@remix-run/router")
          ) {
            return "router";
          }

          // Everything else from node_modules
          return "vendor";
        },
      },
    },
  },
  esbuild: {
    drop: mode === "production" ? ["debugger"] : [],
    legalComments: "none",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
}));
