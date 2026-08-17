// Copilot Hook — Electric-compatible Shape Subscription
// Provides reactive data from /api/shape with SSE live updates
// Uses the Edge Function shape cache for incremental sync + CDN

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth as useClerkAuth } from '@clerk/react';
import { useOrganization } from '@clerk/react';

export interface ShapeRow {
  id: string;
  workspace_id: string;
  [key: string]: any;
}

export interface UseShapeOptions {
  table: string;
  where?: string;
  params?: Record<string, string>;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  live?: boolean;
  enabled?: boolean;
}

export interface UseShapeResult<T extends ShapeRow = ShapeRow> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  isLive: boolean;
  refetch: () => Promise<void>;
}

function generateETag(data: any[]): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(36)}"`;
}

export function useShape<T extends ShapeRow = ShapeRow>(
  options: UseShapeOptions
): UseShapeResult<T> {
  const {
    table,
    where = 'workspace_id = $1',
    params = {},
    orderBy = 'updated_at',
    orderDir = 'DESC',
    limit = 1000,
    live = true,
    enabled = true,
  } = options;

  const { getToken } = useClerkAuth();
  const { organization } = useOrganization();

  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isLive, setIsLive] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const etagRef = useRef<string>('');
  const workspaceIdRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Get workspace ID
  useEffect(() => {
    const getWorkspaceId = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        // Try to get workspace from org or session
        const wsId = organization?.id || 'default';
        workspaceIdRef.current = wsId;
      } catch (err) {
        console.error('[useShape] Failed to get workspace ID:', err);
      }
    };
    getWorkspaceId();
  }, [getToken, organization?.id]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!enabled || !workspaceIdRef.current) return;

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      if (isInitial) setIsLoading(true);
      setError(null);

      const token = await getToken();
      if (!token) throw new Error('No auth token');

      const searchParams = new URLSearchParams();
      searchParams.set('table', table);
      searchParams.set('where', where);
      searchParams.set('limit', limit.toString());
      searchParams.set('order_by', orderBy);
      searchParams.set('order_dir', orderDir);

      Object.entries(params).forEach(([k, v]) => {
        searchParams.set(`params[${k}]`, v);
      });
      if (!params['1']) searchParams.set('params[1]', workspaceIdRef.current);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
      };

      if (etagRef.current && !isInitial) {
        headers['If-None-Match'] = etagRef.current;
      }

      const response = await fetch(
        `/api/shape?${searchParams.toString()}`,
        { headers, signal: abortController.signal }
      );

      if (response.status === 304) {
        // Not modified, keep current data
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Shape fetch failed: ${response.status}`);
      }

      const shapeMessages = await response.json();
      
      // Extract data from shape messages
      const newData = shapeMessages
        .filter((msg: any) => msg.headers?.operation !== 'control')
        .map((msg: any) => msg.value)
        .filter(Boolean);

      if (newData.length > 0 || isInitial) {
        setData(newData as T[]);
        etagRef.current = response.headers.get('ETag') || generateETag(newData);
      }

      // Update live status
      const handle = response.headers.get('electric-handle');
      const offset = response.headers.get('electric-offset');
      if (handle && offset) {
        setIsLive(true);
      }

      // Start SSE connection for live updates
      if (live && isInitial && !eventSourceRef.current) {
        startSSEConnection(token);
      }

    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[useShape] Fetch error:', err);
      setError(err as Error);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [table, where, params, orderBy, orderDir, limit, live, enabled, getToken]);

  const startSSEConnection = useCallback((token: string) => {
    if (eventSourceRef.current) return;
    if (!enabled || !workspaceIdRef.current) return;

    const searchParams = new URLSearchParams();
    searchParams.set('table', table);
    searchParams.set('where', where);
    searchParams.set('live', 'true');
    searchParams.set('live_sse', 'true');
    Object.entries(params).forEach(([k, v]) => {
      searchParams.set(`params[${k}]`, v);
    });
    if (!params['1']) searchParams.set('params[1]', workspaceIdRef.current);

    const eventSource = new EventSource(
      `/api/shape?${searchParams.toString()}`,
      { withCredentials: false }
    );

    eventSource.onopen = () => {
      console.log('[useShape] SSE connected');
      setIsLive(true);
    };

    eventSource.addEventListener('data', (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        if (payload.operation === 'snapshot') {
          // Full snapshot - replace data
          if (payload.data && payload.data.length > 0) {
            setData(payload.data as T[]);
            etagRef.current = payload.etag || generateETag(payload.data);
          }
        } else if (payload.operation === 'insert' && payload.value) {
          setData(prev => {
            // Avoid duplicates
            if (prev.some(row => row.id === payload.value.id)) return prev;
            return [...prev, payload.value];
          });
        } else if (payload.operation === 'update' && payload.value) {
          setData(prev => prev.map(row => 
            row.id === payload.key ? payload.value : row
          ));
        } else if (payload.operation === 'delete' && payload.key) {
          setData(prev => prev.filter(row => row.id !== payload.key));
        }
      } catch (err) {
        console.error('[useShape] SSE parse error:', err);
      }
    });

    eventSource.addEventListener('stale', () => {
      // Cache marked stale - refetch
      console.log('[useShape] Cache stale, refetching...');
      fetchData(false);
    });

    eventSource.onerror = (err) => {
      console.error('[useShape] SSE error:', err);
      setIsLive(false);
      // Reconnect after 5 seconds
      setTimeout(() => {
        if (mountedRef.current && enabled) {
          const currentToken = getToken();
          currentToken.then(t => t && startSSEConnection(t));
        }
      }, 5000);
    };

    eventSourceRef.current = eventSource;
  }, [table, where, params, enabled, getToken, fetchData]);

  const refetch = useCallback(async () => {
    etagRef.current = '';
    await fetchData(true);
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    fetchData(true);
    
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [fetchData]);

  // Reconnect SSE if workspace changes
  useEffect(() => {
    if (eventSourceRef.current && workspaceIdRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      // Will be recreated by fetchData
    }
  }, [workspaceIdRef.current]);

  return {
    data,
    isLoading,
    error,
    isLive,
    refetch,
  };
}

// Convenience hooks for common shapes

export function useMemories(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'memories',
    where: 'workspace_id = $1 AND archived = false',
    orderBy: 'updated_at',
    orderDir: 'DESC',
    limit: 500,
    ...options,
  });
}

export function useDocuments(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'documents',
    where: 'workspace_id = $1',
    orderBy: 'created_at',
    orderDir: 'DESC',
    limit: 200,
    ...options,
  });
}

export function useAgents(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'agents',
    where: 'workspace_id = $1',
    orderBy: 'created_at',
    orderDir: 'DESC',
    limit: 100,
    ...options,
  });
}

export function useSkills(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'skills',
    where: 'workspace_id = $1',
    orderBy: 'created_at',
    orderDir: 'DESC',
    limit: 200,
    ...options,
  });
}

export function useEvents(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'events',
    where: 'workspace_id = $1',
    orderBy: 'created_at',
    orderDir: 'DESC',
    limit: 200,
    ...options,
  });
}

export function useMCPServers(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'mcp_servers',
    where: 'workspace_id = $1',
    orderBy: 'created_at',
    orderDir: 'DESC',
    limit: 100,
    ...options,
  });
}

export function useConfig(workspaceId?: string, options?: Partial<UseShapeOptions>) {
  return useShape({
    table: 'config',
    where: 'workspace_id = $1',
    orderBy: 'key',
    orderDir: 'ASC',
    limit: 200,
    ...options,
  });
}