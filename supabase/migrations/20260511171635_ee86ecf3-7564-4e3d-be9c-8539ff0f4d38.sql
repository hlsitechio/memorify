
CREATE TABLE public.mcp_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  server_name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'http',
  code_verifier TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret TEXT,
  authorization_endpoint TEXT NOT NULL,
  token_endpoint TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mcp_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_oauth_states_own"
  ON public.mcp_oauth_states
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX mcp_oauth_states_user_idx ON public.mcp_oauth_states(user_id, created_at DESC);
