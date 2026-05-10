-- Add category + archive columns
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_memories_user_archived ON public.memories(user_id, archived);
CREATE INDEX IF NOT EXISTS idx_memories_category ON public.memories(user_id, category);

-- Versions table
CREATE TABLE IF NOT EXISTS public.memory_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id uuid NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version int NOT NULL,
  namespace text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_versions_memory ON public.memory_versions(memory_id, version DESC);

ALTER TABLE public.memory_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_versions_all_own ON public.memory_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: snapshot prior state on update of content/namespace/tags/category
CREATE OR REPLACE FUNCTION public.snapshot_memory_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_v int;
BEGIN
  IF (TG_OP = 'UPDATE') AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW.namespace IS DISTINCT FROM OLD.namespace OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.tags IS DISTINCT FROM OLD.tags OR
    NEW.metadata IS DISTINCT FROM OLD.metadata
  ) THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_v FROM public.memory_versions WHERE memory_id = OLD.id;
    INSERT INTO public.memory_versions(memory_id, user_id, version, namespace, category, content, tags, metadata)
    VALUES (OLD.id, OLD.user_id, next_v, OLD.namespace, COALESCE(OLD.category,'general'), OLD.content, OLD.tags, OLD.metadata);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_version ON public.memories;
CREATE TRIGGER trg_memory_version
  BEFORE UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_memory_version();
