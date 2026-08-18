// Backend internal API — Shape Data Query Endpoint
// Called by Edge Function shape-cache.ts to fetch fresh data from Neon
// Path: /api/shape/query (internal, protected by SHAPE_CACHE_INTERNAL_TOKEN)

import { query } from "../lib/db.ts";

export async function handleShapeQuery(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Verify internal token
  const auth = req.headers.get('authorization');
  const expectedToken = Deno.env.get('SHAPE_CACHE_INTERNAL_TOKEN') || 'internal';
  if (auth !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workspaceId = url.searchParams.get('workspace_id');
  const table = url.searchParams.get('table') || 'memories';
  const where = url.searchParams.get('where') || 'workspace_id = $1';
  const limit = parseInt(url.searchParams.get('limit') || '1000');
  const orderBy = url.searchParams.get('order_by') || 'updated_at';
  const orderDir = url.searchParams.get('order_dir') || 'DESC';
  
  // Parse params
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams) {
    if (k.startsWith('params[')) {
      const idx = k.replace('params[', '').replace(']', '');
      params[idx] = v;
    }
  }
  if (!params['1'] && workspaceId) params['1'] = workspaceId;

  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate table (prevent SQL injection)
  const allowedTables = [
    'memories', 'documents', 'document_chunks', 'agents',
    'skills', 'events', 'mcp_servers', 'config',
    'collections', 'collection_items'
  ];
  if (!allowedTables.includes(table)) {
    return new Response(JSON.stringify({ error: 'Invalid table' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build param array from params object
  const paramValues: string[] = [];
  const paramKeys = Object.keys(params).sort((a, b) => parseInt(a) - parseInt(b));
  for (const key of paramKeys) {
    paramValues.push(params[key]);
  }

  // Replace $N placeholders with actual values for Neon
  // Neon uses $1, $2, etc. directly
  let finalWhere = where;
  let paramIndex = 1;
  for (const key of paramKeys) {
    finalWhere = finalWhere.replace(new RegExp(`\\$${key}\\b`, 'g'), `$${paramIndex}`);
    paramIndex++;
  }

  try {
    // Build SELECT query
    let sql = `SELECT * FROM ${table} WHERE ${finalWhere} ORDER BY ${orderBy} ${orderDir} LIMIT ${limit}`;
    
    const rows = await query(sql, paramValues);
    
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ShapeQuery] Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}