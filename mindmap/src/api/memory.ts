// mindmap/src/api/memory.ts
// Clerk session → /api/memory/*

export type GetToken = () => Promise<string | null>;

async function apiFetch<T>(
  path: string,
  getToken: GetToken,
  init?: RequestInit,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("not_signed_in");
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string; code?: string }).error ??
      res.statusText;
    const code = (data as { code?: string }).code;
    const err = new Error(code ? `${code}: ${msg}` : msg);
    (err as Error & { status: number; body: unknown }).status = res.status;
    (err as Error & { body: unknown }).body = data;
    throw err;
  }
  return data as T;
}

export function createMemoryClient(getToken: GetToken) {
  return {
    list(params?: { limit?: number; namespace?: string; category?: string }) {
      const q = new URLSearchParams();
      if (params?.limit) q.set("limit", String(params.limit));
      if (params?.namespace) q.set("namespace", params.namespace);
      if (params?.category) q.set("category", params.category);
      const qs = q.toString();
      return apiFetch<{ ok: true; nodes: unknown[]; edges: unknown[] }>(
        `/api/memory${qs ? `?${qs}` : ""}`,
        getToken,
      );
    },
    get(memId: string) {
      return apiFetch<{ ok: true; memory: unknown }>(
        `/api/memory/${encodeURIComponent(memId)}`,
        getToken,
      );
    },
    create(body: {
      content: string;
      title?: string;
      namespace?: string;
      category?: string;
      tags?: string[];
      parent_mem_id?: string;
      relation?: string;
    }) {
      return apiFetch<{ ok: true; memory: unknown }>(`/api/memory`, getToken, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}
