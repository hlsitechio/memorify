ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_workspace_id text,
  ADD COLUMN IF NOT EXISTS current_workspace_name text,
  ADD COLUMN IF NOT EXISTS current_workspace_kind text,
  ADD COLUMN IF NOT EXISTS current_workspace_subtitle text;