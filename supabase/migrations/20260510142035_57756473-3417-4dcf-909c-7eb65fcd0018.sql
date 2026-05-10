CREATE OR REPLACE FUNCTION public.snapshot_memory_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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
REVOKE ALL ON FUNCTION public.snapshot_memory_version() FROM PUBLIC, anon, authenticated;