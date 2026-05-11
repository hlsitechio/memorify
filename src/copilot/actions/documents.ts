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
      "Upload a binary document (PDF, DOC, DOCX, etc.) provided as base64. Detects MIME from the extension if not given.",
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
];
