ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS agent_id uuid NULL;
CREATE INDEX IF NOT EXISTS documents_user_agent_created_idx ON public.documents (user_id, agent_id, created_at DESC);