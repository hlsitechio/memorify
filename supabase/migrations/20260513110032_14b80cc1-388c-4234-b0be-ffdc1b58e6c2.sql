CREATE TABLE IF NOT EXISTS public.workspace_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_id text NOT NULL,
  layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  visible_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  accent jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);

ALTER TABLE public.workspace_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_prefs_select_own" ON public.workspace_prefs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "workspace_prefs_insert_own" ON public.workspace_prefs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "workspace_prefs_update_own" ON public.workspace_prefs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "workspace_prefs_delete_own" ON public.workspace_prefs
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER workspace_prefs_set_updated_at
  BEFORE UPDATE ON public.workspace_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();