ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS workspace_id text,
  ADD COLUMN IF NOT EXISTS source jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS skills_user_ws_idx
  ON public.skills (user_id, workspace_id);