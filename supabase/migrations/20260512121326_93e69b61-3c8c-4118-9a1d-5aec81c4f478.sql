CREATE TABLE public.vault_secrets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'dev',
  description TEXT NULL,
  last_used_at TIMESTAMPTZ NULL,
  last_used_by_agent_id UUID NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name, scope)
);

CREATE INDEX idx_vault_secrets_user ON public.vault_secrets (user_id, name);

ALTER TABLE public.vault_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vault_secrets_select_own" ON public.vault_secrets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vault_secrets_insert_own" ON public.vault_secrets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vault_secrets_update_own" ON public.vault_secrets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vault_secrets_delete_own" ON public.vault_secrets FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER vault_secrets_set_updated_at
  BEFORE UPDATE ON public.vault_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();