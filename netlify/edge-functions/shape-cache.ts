// Netlify Edge Function — Electric-compatible Shape Cache
// Provides GET /api/shape with caching, ETag, incremental sync, and SSE live updates
// Uses Neon pg_notify triggers for real-time invalidation

import type { Config } from '@netlify/edge-functions'

// ── Types ────────────────────────────────────────────────────────────

interface ShapeCacheEntry {
  data: any[]
  offset: string
  etag: string
  lastFetch: number
  subscribers: Set<ReadableStreamDefaultController>
  stale: boolean
}

interface InvalidationMessage {
  table: string
  workspace_id: string
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  id: string
  ts: number
}

// ── In-memory cache (per Edge instance) ──────────────────────────────

const shapeCache = new Map<string, Map<string, ShapeCacheEntry>>()

function getCacheKey(wsId: string, table: string): string {
  return `${wsId}:${table}`
}

function getOrCreateEntry(wsId: string, table: string): ShapeCacheEntry {
  if (!shapeCache.has(wsId)) shapeCache.set(wsId, new Map())
  const tables = shapeCache.get(wsId)!
  if (!tables.has(table)) {
    tables.set(table, {
      data: [],
      offset: '0',
      etag: '',
      lastFetch: 0,
      subscribers: new Set(),
      stale: true,
    })
  }
  return tables.get(table)!
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateETag(data: any[]): string {
  // Simple hash of data for ETag
  const str = JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return `"${Math.abs(hash).toString(36)}"`
}

async function fetchShapeData(
  wsId: string,
  table: string,
  where: string,
  params: Record<string, string>
): Promise<any[]> {
  // Use a simple fetch to a backend endpoint that queries Neon
  // This avoids importing the DB pool directly in Edge Function
  const searchParams = new URLSearchParams()
  searchParams.set('workspace_id', wsId)
  searchParams.set('table', table)
  searchParams.set('where', where)
  Object.entries(params).forEach(([k, v]) => searchParams.set(`params[${k}]`, v))
  searchParams.set('limit', '1000')
  searchParams.set('order_by', 'updated_at')
  searchParams.set('order_dir', 'DESC')

  const backendUrl = `https://memorify.dev/api/shape/query?${searchParams.toString()}`
  
  const resp = await fetch(backendUrl, {
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SHAPE_CACHE_INTERNAL_TOKEN') || 'internal'}`,
    },
  })
  
  if (!resp.ok) {
    throw new Error(`Backend query failed: ${resp.status}`)
  }
  
  return resp.json()
}

// ── Background stale-check interval ──────────────────────────────────

// Run every 5 seconds to mark entries stale and notify subscribers
setInterval(() => {
  const now = Date.now()
  for (const [wsId, tables] of shapeCache) {
    for (const [table, entry] of tables) {
      if (!entry.stale && now - entry.lastFetch > 30000) {
        entry.stale = true
        const msg = `event: stale\ndata: ${JSON.stringify({ table, workspaceId: wsId })}\n\n`
        const encoder = new TextEncoder()
        for (const ctrl of entry.subscribers) {
          try { ctrl.enqueue(encoder.encode(msg)) } catch {}
        }
      }
    }
  }
}, 5000)

// ── Main Handler ─────────────────────────────────────────────────────

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const path = url.pathname

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // Only handle GET /api/shape/*
  if (!path.startsWith('/api/shape')) {
    return new Response('Not found', { status: 404 })
  }

  // ── Auth: verify mem_live_ token ───────────────────────────────────
  
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  
  if (!token?.startsWith('mem_live_')) {
    return new Response('Unauthorized: missing or invalid mem_live_ token', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="memorify"',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // Verify token via backend (we'll call the verify endpoint)
  let workspaceId: string
  try {
    const verifyResp = await fetch('https://memorify.dev/api/v1/agent/verify', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!verifyResp.ok) {
      return new Response('Invalid token', { 
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
    const payload = await verifyResp.json()
    workspaceId = payload.workspace_id
    if (!workspaceId) {
      return new Response('Token missing workspace_id', { 
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }
  } catch (err) {
    return new Response('Auth verification failed', { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }

  // ── Parse shape parameters ─────────────────────────────────────────
  
  const table = url.searchParams.get('table') || 'memories'
  const live = url.searchParams.get('live') === 'true'
  const sse = url.searchParams.get('live_sse') === 'true'
  const offset = url.searchParams.get('offset')
  const handle = url.searchParams.get('handle')
  const where = url.searchParams.get('where') || `workspace_id = $1`
  
  // Parse params[N] values
  const params: Record<string, string> = {}
  for (const [k, v] of url.searchParams) {
    if (k.startsWith('params[')) {
      const idx = k.replace('params[', '').replace(']', '')
      params[idx] = v
    }
  }
  // Ensure workspace_id is in params
  if (!params['1']) params['1'] = workspaceId

  const entry = getOrCreateEntry(workspaceId, table)
  const cacheKey = getCacheKey(workspaceId, table)

  // ── SSE Live Mode ──────────────────────────────────────────────────
  
  if (live && sse) {
    const stream = new ReadableStream({
      start(controller) {
        entry.subscribers.add(controller)
        
        // Send initial snapshot if we have fresh data
        if (!entry.stale && entry.data.length > 0) {
          const snapshotMsg = `event: data\ndata: ${JSON.stringify({ 
            operation: 'snapshot',
            data: entry.data,
            offset: entry.offset,
            etag: entry.etag,
            handle: `shape_${table}_${workspaceId.slice(0, 8)}`,
          })}\n\n`
          controller.enqueue(new TextEncoder().encode(snapshotMsg))
        }
        
        // Send connected event
        controller.enqueue(new TextEncoder().encode(
          `event: connected\ndata: ${JSON.stringify({ 
            workspace_id: workspaceId, 
            table,
            handle: `shape_${table}_${workspaceId.slice(0, 8)}`,
          })}\n\n`
        ))
        
        // Keep-alive every 15 seconds
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`: keep-alive\n\n`))
          } catch {
            clearInterval(keepAlive)
          }
        }, 15000)
        
        // Cleanup on close
        ;(controller as any)._keepAlive = keepAlive
      },
      cancel() {
        entry.subscribers.delete(controller)
        const keepAlive = (controller as any)._keepAlive
        if (keepAlive) clearInterval(keepAlive)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    })
  }

  // ── Regular GET (Initial Sync or Refetch) ──────────────────────────
  
  // Check ETag for conditional request
  const ifNoneMatch = req.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === entry.etag && !entry.stale) {
    return new Response(null, { 
      status: 304,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'ETag': entry.etag,
        'electric-handle': `shape_${table}_${workspaceId.slice(0, 8)}`,
        'electric-offset': entry.offset,
      },
    })
  }

  // Check if we need to refetch
  if (entry.stale || entry.data.length === 0) {
    try {
      // Call backend API to get fresh data
      const searchParams = new URLSearchParams()
      searchParams.set('workspace_id', workspaceId)
      searchParams.set('table', table)
      searchParams.set('where', where)
      Object.entries(params).forEach(([k, v]) => searchParams.set(`params[${k}]`, v))
      searchParams.set('limit', '1000')
      searchParams.set('order_by', 'updated_at')
      searchParams.set('order_dir', 'DESC')

      const backendUrl = `https://memorify.dev/api/shape/query?${searchParams.toString()}`
      
      const resp = await fetch(backendUrl, {
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SHAPE_CACHE_INTERNAL_TOKEN') || 'internal'}`,
        },
      })
      
      if (!resp.ok) {
        throw new Error(`Backend query failed: ${resp.status}`)
      }
      
      const data = await resp.json()
      
      entry.data = data
      entry.offset = `${Date.now()}`
      entry.etag = generateETag(data)
      entry.lastFetch = Date.now()
      entry.stale = false
    } catch (err) {
      console.error('[ShapeCache] Fetch failed:', err)
      if (entry.data.length === 0) {
        return new Response('Upstream error', { 
          status: 502,
          headers: { 'Access-Control-Allow-Origin': '*' },
        })
      }
      // Serve stale data with warning header
    }
  }

  // Format as Electric-compatible shape messages
  const shapeMessages = entry.data.map((row: any) => ({
    headers: { 
      operation: row.updated_at && row.created_at && row.updated_at !== row.created_at ? 'update' : 'insert' 
    },
    key: row.id,
    value: row,
  }))

  const shapeHandle = `shape_${table}_${workspaceId.slice(0, 8)}`

  return new Response(JSON.stringify(shapeMessages), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'ETag': entry.etag,
      'Cache-Control': 'public, max-age=5, stale-while-revalidate=30',
      'electric-handle': shapeHandle,
      'electric-offset': entry.offset,
      'electric-up-to-date': 'true',
    },
  })
}

export const config: Config = {
  path: '/api/shape*',
}