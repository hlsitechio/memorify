CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'claude_code',
  status text NOT NULL DEFAULT 'pending',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agents_user_id_idx ON public.agents(user_id);
CREATE INDEX agents_token_idx ON public.agents(token);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_select_own" ON public.agents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "agents_insert_own" ON public.agents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agents_update_own" ON public.agents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "agents_delete_own" ON public.agents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Security-definer ping: marks an agent as connected by token (no JWT).
CREATE OR REPLACE FUNCTION public.agent_ping(_token text, _meta jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(id uuid, name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.agents
     SET status = 'connected',
         last_seen_at = now(),
         metadata = metadata || COALESCE(_meta, '{}'::jsonb)
   WHERE token = _token
  RETURNING agents.id, agents.name, agents.status;
END;
$$;

-- Realtime so the connect wizard flips to "Connected" instantly.
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER TABLE public.agents REPLICA IDENTITY FULL;