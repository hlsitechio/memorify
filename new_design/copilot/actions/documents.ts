// Documents commands — let agents add/remove user documents.
// Supports notepad-style text notes and binary files (PDF/DOC/DOCX) via base64
// or remote URL. All handlers live in copilot-action edge fn (server scope).

import type { CommandDef } from "../types";

const ROUTES = ["/dashboard/documents", "/dashboard"];

export const documentCommands: CommandDef[] = [
  {
    name: "documents.list",
    description: "List the user's documents (id, name, mime, size, created_at).",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Optional name search filter." },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "documents.view",
    description: "View a document's metadata and text content by id.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "documents.search",
    description: "Search documents by name or text content.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { q: { type: "string" }, limit: { type: "number" } },
      required: ["q"],
    },
  },
  {
    name: "documents.add_note",
    description:
      "Create a notepad note as a document. Stores plain text, markdown, or JSON content under the user's documents. Use 'json' format to save structured data (object or JSON string) — it will be pretty-printed.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Filename without extension, e.g. 'meeting-notes'." },
        content: { description: "Note body. String for md/txt; object or JSON string for json." },
        format: { type: "string", enum: ["md", "txt", "json"], description: "Defaults to 'md'." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "documents.add_from_base64",
    description:
      "Upload a local file from the user's computer (PDF, DOC, DOCX, images, etc.). The agent reads the file from disk, base64-encodes the bytes, and sends them here — no URL required. Detects MIME from the extension if not provided.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filename including extension, e.g. 'report.pdf'." },
        base64: { type: "string", description: "Base64-encoded file bytes (no data: prefix needed)." },
        mime: { type: "string", description: "Optional MIME type override." },
      },
      required: ["name", "base64"],
    },
  },
  {
    name: "documents.add_from_file",
    description:
      "Alias of documents.add_from_base64. Use this when uploading a file from the local computer / filesystem: the agent reads the file at the given path, base64-encodes its bytes, and sends them as `base64`. The server stores it under the user's documents.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Filename including extension, e.g. 'report.pdf'. If omitted, basename of `path` is used." },
        path: { type: "string", description: "Local file path the agent read from (informational, for logging)." },
        base64: { type: "string", description: "Base64-encoded file bytes the agent produced by reading `path`." },
        mime: { type: "string", description: "Optional MIME type override." },
      },
      required: ["base64"],
    },
  },
  {
    name: "documents.add_from_url",
    description:
      "Download a document from a public URL and store it. Useful for fetching PDFs, DOCX, etc. from the web.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Direct https URL to the file." },
        name: { type: "string", description: "Optional filename; inferred from URL if omitted." },
      },
      required: ["url"],
    },
  },
  {
    name: "documents.delete",
    description: "Permanently delete a document and its stored file. Destructive — confirm first.",
    scope: "server",
    destructive: true,
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "documents.signed_url",
    description: "Generate a short-lived signed URL to download a document.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        ttl: { type: "number", description: "Seconds, default 300, max 3600." },
      },
      required: ["id"],
    },
  },
  {
    name: "web.search",
    description:
      "Search the web (DuckDuckGo) and return top results with titles, URLs, and snippets. No API key needed.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query." },
        limit: { type: "number", description: "Max results (default 5, max 10)." },
      },
      required: ["q"],
    },
  },
  {
    name: "web.fetch",
    description:
      "Fetch a URL and extract clean text content (HTML stripped). Returns the page title and text body up to 15000 chars.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "https URL to fetch." },
        limit: { type: "number", description: "Max chars to return (default 15000)." },
      },
      required: ["url"],
    },
  },
  {
    name: "web.search_and_save",
    description:
      "Search the web, fetch the top result's content, and save it as a document in Memorify. Returns the document id. Great for 'find something about X and store it'.",
    scope: "server",
    routes: ROUTES,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query." },
        name: { type: "string", description: "Optional document name; inferred from page title if omitted." },
        save_all: { type: "boolean", description: "If true, save top 3 results as separate documents. Default false (only top 1)." },
      },
      required: ["q"],
    },
  },
];
