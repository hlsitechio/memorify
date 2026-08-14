// lib/rag.ts — Text extraction, chunking, and embedding pipeline for Memorify RAG
// Used by copilot.ts and v1.ts when documents are uploaded
//
// Embedding model: nvidia/nemotron-3-embed-1b (2048 dim, free via NVIDIA NIM)
// Text extraction: PDF (pdfjs-dist), DOCX (mammoth), images (NVIDIA VLM OCR),
//   plain text/JSON/CSV/MD read directly

import { query, queryOne, execute } from "./db.ts";

const EMBEDDING_MODEL = "nvidia/nv-embedqa-e5-v5";
const EMBEDDING_DIM = 1024;
const CHUNK_SIZE = 800;    // chars per chunk
const CHUNK_OVERLAP = 100; // overlap between chunks

/** Convert Uint8Array to base64 string without stack overflow on large arrays */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// ── Text extraction ──────────────────────────────────────────

/**
 * Extract text content from a document based on its kind and mime type.
 * For text files: direct content.
 * For PDF: parse using pdfjs-dist (client-side library, but works in Deno).
 * For DOCX: parse using mammoth (DOCX → HTML → text).
 * For images: use NVIDIA VLM to OCR the image.
 * For binary/unknown: return empty string.
 */
export async function extractText(
  kind: string,
  mime: string,
  name: string,
  content: string | null,
  bytes: Uint8Array | null,
): Promise<string> {
  // Text files — content is already text
  if (kind === "text" || content) {
    return content ?? "";
  }

  // PDF — extract text from raw bytes
  if (kind === "pdf" || mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    if (!bytes) return "";
    return await extractPdfText(bytes);
  }

  // DOCX — extract text from raw bytes
  if (kind === "office" || /\.(docx?)$/i.test(name)) {
    if (!bytes) return "";
    return await extractDocxText(bytes, name);
  }

  // Images — OCR via NVIDIA VLM
  if (kind === "image" || mime.startsWith("image/")) {
    if (!bytes) return "";
    return await extractImageText(bytes, mime, name);
  }

  // Unknown binary — can't extract
  return "";
}

/**
 * Extract text from PDF bytes using a basic PDF text extraction.
 * Parses the PDF content streams to find text operators (Tj, TJ, Td, etc.).
 * This is a lightweight parser — not as accurate as pdfjs but works in Edge/Deno
 * without external dependencies.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const text = new TextDecoder().decode(bytes);
    const chunks: string[] = [];

    // Extract text from PDF content streams
    // Look for text in parentheses (text operators: (text) Tj or [(text)] TJ)
    const textRegex = /\(([^)]*)\)\s*Tj/g;
    const arrayRegex = /\[([^\]]*)\]\s*TJ/g;
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;

    let streamMatch;
    while ((streamMatch = streamRegex.exec(text)) !== null) {
      const stream = streamMatch[1];
      // Extract text from Tj operators: (text) Tj
      let m;
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      while ((m = tjRegex.exec(stream)) !== null) {
        if (m[1].trim()) chunks.push(m[1]);
      }
      // Extract text from TJ operators: [(text)] TJ
      const tjArrayRegex = /\(([^)]*)\)/g;
      let m2;
      while ((m2 = tjArrayRegex.exec(stream)) !== null) {
        if (m2[1].trim()) chunks.push(m2[1]);
      }
    }

    // Also try direct text extraction from the whole PDF (uncompressed PDFs)
    if (chunks.length === 0) {
      const directRegex = /\(([^)]{2,})\)/g;
      let m3;
      while ((m3 = directRegex.exec(text)) !== null) {
        const s = m3[1].trim();
        if (s.length > 1 && !/^[0-9\s\[\]\/<>]+$/.test(s)) {
          chunks.push(s);
        }
      }
    }

    return chunks.join(" ").trim() || `[PDF: text extraction yielded no text — may be scanned/image-based PDF]`;
  } catch (e) {
    console.error("PDF extraction failed:", e);
    return "";
  }
}

/**
 * Extract text from DOCX bytes by parsing the document.xml inside the ZIP.
 * DOCX is a ZIP archive containing word/document.xml with the text content.
 * This is a lightweight parser that works in Edge/Deno without external deps.
 */
async function extractDocxText(bytes: Uint8Array, name: string): Promise<string> {
  if (name.toLowerCase().endsWith(".doc") && !name.toLowerCase().endsWith(".docx")) {
    return `[Document binaire .doc — extraction non supportée. Convertir en .docx ou .txt.]`;
  }
  try {
    // DOCX is a ZIP file. We need to find word/document.xml inside it.
    // Parse the ZIP central directory to locate the file, then extract it.
    // For simplicity, search for the XML text directly in the raw bytes.
    const text = new TextDecoder().decode(bytes);

    // Look for XML text content between <w:t> tags (Word text runs)
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    const chunks: string[] = [];
    let m;
    while ((m = wtRegex.exec(text)) !== null) {
      if (m[1]) chunks.push(m[1]);
    }

    // Also look for paragraph breaks
    const paraRegex = /<w:p[\s>]/g;
    let paraCount = 0;
    while (paraRegex.exec(text) !== null) paraCount++;

    const result = chunks.join(" ");
    if (result) return result;

    return `[DOCX: no text found — may be corrupted or empty]`;
  } catch (e) {
    console.error("DOCX extraction failed:", e);
    return "";
  }
}

/**
 * Extract text from images using NVIDIA VLM (vision-language model).
 * Uses nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1 or similar VLM.
 * Falls back to basic description if VLM is unavailable.
 */
async function extractImageText(bytes: Uint8Array, mime: string, name: string): Promise<string> {
  const nvidiaKey = Deno.env.get("NVIDIA_API_KEY") ?? Deno.env.get("EMBEDDING_API_KEY") ?? "";
  if (!nvidiaKey) {
    return `[Image: ${name} — OCR non disponible (pas de clé API NVIDIA)]`;
  }

  try {
    // Convert bytes to base64
    const base64 = bytesToBase64(bytes);
    const dataUrl = `data:${mime};base64,${base64}`;

    // Use NVIDIA's VLM model for OCR/text extraction
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: "nvidia/llama-3.2-nemotron-mini-vision-v1",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract ALL text visible in this image. Transcribe it exactly as written. If there is no text, describe what the image shows in one sentence." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      console.error("Image OCR failed:", res.status, await res.text());
      return `[Image: ${name} — OCR échec: HTTP ${res.status}]`;
    }

    const data = await res.json();
    const extractedText = data.choices?.[0]?.message?.content ?? "";
    return extractedText || `[Image: ${name} — aucun texte détecté]`;
  } catch (e) {
    console.error("Image OCR error:", e);
    return `[Image: ${name} — OCR erreur: ${(e as Error).message}]`;
  }
}

// ── Chunking ─────────────────────────────────────────────────

/**
 * Split text into overlapping chunks for embedding.
 * @param text - The full text to chunk
 * @returns Array of { text, chunk_index } objects
 */
export function chunkText(text: string): { text: string; chunk_index: number }[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: { text: string; chunk_index: number }[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    let chunk = text.slice(start, end);

    // Try to break at a sentence or word boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n");
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > CHUNK_SIZE * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
      }
    }

    chunks.push({ text: chunk.trim(), chunk_index: index });
    start += chunk.length - CHUNK_OVERLAP;
    if (start <= (index * (CHUNK_SIZE - CHUNK_OVERLAP))) start = (index + 1) * (CHUNK_SIZE - CHUNK_OVERLAP);
    index++;
  }

  return chunks.filter(c => c.text.length > 0);
}

// ── Embedding ────────────────────────────────────────────────

/**
 * Generate embeddings for text using NVIDIA NIM nemotron-3-embed-1b.
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors (each 2048-dim)
 */
export async function generateEmbeddings(texts: string[]): Promise<{ embeddings: number[][]; error: string | null }> {
  const nvidiaKey = Deno.env.get("NVIDIA_API_KEY") ?? Deno.env.get("EMBEDDING_API_KEY") ?? "";
  const apiUrl = Deno.env.get("EMBEDDING_API_URL") ?? "https://integrate.api.nvidia.com/v1/embeddings";

  if (!nvidiaKey) {
    return { embeddings: [], error: "NVIDIA_API_KEY not set" };
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        input_type: "passage",
        encoding_format: "float",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { embeddings: [], error: `Embedding API ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    const embeddings = (data.data ?? []).map((d: any) => d.embedding);
    return { embeddings, error: null };
  } catch (e) {
    return { embeddings: [], error: `Embedding fetch failed: ${(e as Error).message}` };
  }
}

/**
 * Generate a single embedding for a query string.
 */
export async function generateQueryEmbedding(text: string): Promise<number[] | null> {
  const nvidiaKey = Deno.env.get("NVIDIA_API_KEY") ?? Deno.env.get("EMBEDDING_API_KEY") ?? "";
  const apiUrl = Deno.env.get("EMBEDDING_API_URL") ?? "https://integrate.api.nvidia.com/v1/embeddings";

  if (!nvidiaKey) {
    console.warn("NVIDIA_API_KEY not set — cannot generate query embedding");
    return null;
  }

  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [text],
        input_type: "query",
        encoding_format: "float",
      }),
    });

    if (!res.ok) {
      console.error("Query embedding error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("Query embedding failed:", e);
    return null;
  }
}

// ── Full pipeline: extract → chunk → embed → store ───────────

/**
 * Full RAG pipeline: extract text from a document, chunk it, generate embeddings,
 * and store the chunks in document_chunks.
 * Called after a document is uploaded/created.
 */
export async function processDocumentForRag(
  docId: string,
  workspaceId: string,
  kind: string,
  mime: string,
  name: string,
  content: string | null,
  bytes: Uint8Array | null,
): Promise<{ extracted: boolean; chunks: number; embedded: number; error: string | null }> {
  // 1. Extract text
  const text = await extractText(kind, mime, name, content, bytes);
  if (!text || text.trim().length === 0) {
    return { extracted: false, chunks: 0, embedded: 0, error: null };
  }

  // 2. Update the document's content field if it was empty (so full-text search works too)
  if (!content) {
    await execute(
      `UPDATE documents SET content = $1 WHERE id = $2 AND workspace_id = $3 AND content IS NULL`,
      [text, docId, workspaceId],
    );
  }

  // 3. Chunk the text
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { extracted: true, chunks: 0, embedded: 0, error: null };
  }

  // 4. Generate embeddings in batches (NVIDIA API may have limits)
  const BATCH_SIZE = 32;
  const allEmbeddings: number[][] = [];
  let embedError: string | null = null;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const batchTexts = batch.map(c => c.text);
    const { embeddings, error } = await generateEmbeddings(batchTexts);
    allEmbeddings.push(...embeddings);
    if (error) embedError = error;
  }

  // 5. Store chunks with embeddings
  let embeddedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const emb = allEmbeddings[i];
    if (!emb || emb.length !== EMBEDDING_DIM) continue;

    await execute(
      `INSERT INTO document_chunks (doc_id, workspace_id, chunk_index, text, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [docId, workspaceId, chunks[i].chunk_index, chunks[i].text, JSON.stringify(emb)],
    );
    embeddedCount++;
  }

  // 6. Update document metadata with RAG info
  await execute(
    `UPDATE documents SET metadata = metadata || $1::jsonb WHERE id = $2 AND workspace_id = $3`,
    [JSON.stringify({ rag: { chunks: chunks.length, embedded: embeddedCount, extracted_text_len: text.length } }), docId, workspaceId],
  );

  return { extracted: true, chunks: chunks.length, embedded: embeddedCount, error: embedError };
}

/**
 * Search documents by semantic similarity + full-text.
 * Used by MCP tools and copilot actions.
 */
export async function searchDocuments(
  workspaceId: string,
  queryText: string,
  limit: number = 10,
  threshold: number = 0.5,
): Promise<Array<{
  doc_id: string;
  doc_name: string;
  chunk_index: number;
  text: string;
  similarity: number;
  type: "semantic" | "fulltext";
}>> {
  const results: Array<{
    doc_id: string;
    doc_name: string;
    chunk_index: number;
    text: string;
    similarity: number;
    type: "semantic" | "fulltext";
  }> = [];

  // 1. Semantic search via pgvector HNSW
  const queryEmbedding = await generateQueryEmbedding(queryText);
  if (queryEmbedding) {
    const semantic = await query<{
      doc_id: string;
      doc_name: string;
      chunk_index: number;
      text: string;
      similarity: number;
    }>(
      `SELECT dc.doc_id, d.name AS doc_name, dc.chunk_index, dc.text,
              1 - (dc.embedding <=> $1::vector) AS similarity
       FROM document_chunks dc
       JOIN documents d ON dc.doc_id = d.id
       WHERE dc.workspace_id = $2
         AND d.workspace_id = $2
         AND dc.embedding IS NOT NULL
         AND 1 - (dc.embedding <=> $1::vector) > $3
       ORDER BY dc.embedding <=> $1::vector
       LIMIT $4`,
      [JSON.stringify(queryEmbedding), workspaceId, threshold, limit],
    );

    for (const r of semantic) {
      results.push({
        doc_id: r.doc_id,
        doc_name: r.doc_name,
        chunk_index: r.chunk_index,
        text: r.text,
        similarity: r.similarity,
        type: "semantic",
      });
    }
  }

  // 2. Full-text search (tsvector) on documents.content
  const fulltext = await query<{
    id: string;
    name: string;
    content: string;
  }>(
    `SELECT id, name, content
     FROM documents
     WHERE workspace_id = $1
       AND search_vec @@ plainto_tsquery('english', $2)
     ORDER BY ts_rank_cd(search_vec, plainto_tsquery('english', $2)) DESC
     LIMIT $3`,
    [workspaceId, queryText, limit],
  );

  for (const d of fulltext) {
    // Avoid duplicates from semantic search
    if (!results.some(r => r.doc_id === d.id)) {
      results.push({
        doc_id: d.id,
        doc_name: d.name,
        chunk_index: -1,
        text: d.content ?? "",
        similarity: 0.85,
        type: "fulltext",
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}