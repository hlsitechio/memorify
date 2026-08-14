/**
 * Legacy no-op data client.
 * Backend is Memorify API + Neon + Netlify Edge + Clerk.
 * This module exists only so old dashboard pages do not crash at load time
 * while they migrate to authenticated /api routes.
 *
 * SECURITY: never pretend auth succeeded. user/session always null.
 */

type EmptyResult = { data: null; error: { message: string; code: string } };

const REMOVED = {
  message: "This legacy client is disabled while the page migrates to Memorify API.",
  code: "MEMORIFY_API_REQUIRED",
} as const;

function emptyResult(): EmptyResult {
  return { data: null, error: { ...REMOVED } };
}

function emptyQuery() {
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get(_t, prop: string) {
      if (prop === "then") {
        return (resolve: (v: EmptyResult) => void) => resolve(emptyResult());
      }
      if (prop === "catch" || prop === "finally") {
        return () => self;
      }
      return (..._args: unknown[]) => self;
    },
  });
  return self;
}

function emptyAuth() {
  return {
    getSession: async () => ({
      data: { session: null },
      error: null,
    }),
    getUser: async () => ({
      data: { user: null },
      error: null,
    }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: { ...REMOVED },
    }),
    signUp: async () => ({
      data: { user: null, session: null },
      error: { ...REMOVED },
    }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: { ...REMOVED } }),
    updateUser: async () => ({
      data: { user: null },
      error: { ...REMOVED },
    }),
    onAuthStateChange: (_cb?: unknown) => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
    exchangeCodeForSession: async () => ({
      data: { user: null, session: null },
      error: { ...REMOVED },
    }),
  };
}

function emptyFunctions() {
  return {
    invoke: async (_name: string, _opts?: unknown) => emptyResult(),
  };
}

function emptyStorage() {
  return {
    from: () => ({
      upload: async () => emptyResult(),
      download: async () => emptyResult(),
      remove: async () => emptyResult(),
      list: async () => emptyResult(),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: async () => emptyResult(),
    }),
  };
}

function emptyChannel() {
  return {
    on: () => emptyChannel(),
    subscribe: () => ({ unsubscribe: () => {} }),
    unsubscribe: () => {},
  };
}

export const memorify = {
  from: (_table: string) => emptyQuery(),
  rpc: async (_fn: string, _args?: unknown) => emptyResult(),
  auth: emptyAuth(),
  functions: emptyFunctions(),
  storage: emptyStorage(),
  channel: (_name: string) => emptyChannel(),
  removeChannel: () => {},
  removeAllChannels: () => {},
} as const;

export default memorify;
