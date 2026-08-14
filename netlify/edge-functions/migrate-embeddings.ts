// Migration: change document_chunks.embedding from vector(1536) to vector(2048)
// for NVIDIA nemotron-3-embed-1b model
// Run: curl https://memorify.dev/api/migrate-embeddings?confirm=yes
import { query, execute } from "../../backend/lib/db.ts";

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "yes") {
    return new Response(JSON.stringify({
      error: "confirm required",
      message: "This migration changes document_chunks.embedding from vector(1536) to vector(2048). Add ?confirm=yes to run.",
    }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const steps: string[] = [];

  try {
    // 1. Drop the HNSW index
    await execute(`DROP INDEX IF EXISTS document_chunks_embedding_hnsw_idx`);
    steps.push("Dropped HNSW index");

    // 2. Alter the column type
    await execute(`ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024) USING embedding::vector(1024)`);
    steps.push("Changed embedding column to vector(1024)");

    // 3. Recreate HNSW index
    await execute(`CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx ON document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
    steps.push("Recreated HNSW index");

    // 4. Delete any old chunks with wrong-dimension embeddings
    const old = await query<{ id: string }>(`DELETE FROM document_chunks WHERE embedding IS NOT NULL RETURNING id`, []);
    steps.push(`Cleared ${old.length} old chunks`);

    return new Response(JSON.stringify({ ok: true, migration: "embeddings_1536_to_2048", steps }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, steps_completed: steps }, null, 2), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}