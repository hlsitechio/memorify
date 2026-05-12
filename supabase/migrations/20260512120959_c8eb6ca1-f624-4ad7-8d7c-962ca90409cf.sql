CREATE TABLE public.agent_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id UUID NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  latency_ms INTEGER NULL,
  tokens_in INTEGER NULL,
  tokens_out INTEGER NULL,
  cost_cents NUMERIC(12,4) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_calls_user_created ON public.agent_calls (user_id, created_at DESC);
CREATE INDEX idx_agent_calls_user_kind_created ON public.agent_calls (user_id, kind, created_at DESC);
CREATE INDEX idx_agent_calls_user_agent_created ON public.agent_calls (user_id, agent_id, created_at DESC);

ALTER TABLE public.agent_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_calls_select_own" ON public.agent_calls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "agent_calls_insert_own" ON public.agent_calls FOR INSERT WITH CHECK (auth.uid() = user_id);