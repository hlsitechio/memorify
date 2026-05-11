-- Add a friendly Memory ID column and auto-generate it per agent/user workspace.
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS mem_id text;

-- Helper: derive a slug from a memory's namespace + owner.
-- agent:<uuid> → lower_snake of the agent name; otherwise 'user'.
CREATE OR REPLACE FUNCTION public.memory_slug_for(_namespace text, _user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agent_uuid uuid;
  agent_name text;
  slug text;
BEGIN
  IF _namespace LIKE 'agent:%' THEN
    BEGIN
      agent_uuid := substring(_namespace from 7)::uuid;
    EXCEPTION WHEN others THEN
      RETURN 'agent';
    END;
    SELECT name INTO agent_name
      FROM public.agents
     WHERE id = agent_uuid AND user_id = _user_id;
    IF agent_name IS NULL THEN
      RETURN 'agent';
    END IF;
    slug := lower(regexp_replace(agent_name, '[^a-zA-Z0-9]+', '_', 'g'));
    slug := trim(both '_' from slug);
    IF slug = '' THEN slug := 'agent'; END IF;
    RETURN slug;
  END IF;
  RETURN 'user';
END;
$$;

-- Trigger: assign a sequential mem_id like "<slug>_mem_001" on insert.
CREATE OR REPLACE FUNCTION public.assign_memory_mem_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slug text;
  next_n int;
BEGIN
  IF NEW.mem_id IS NOT NULL AND NEW.mem_id <> '' THEN
    RETURN NEW;
  END IF;
  slug := public.memory_slug_for(NEW.namespace, NEW.user_id);
  SELECT COALESCE(MAX(
           NULLIF(regexp_replace(mem_id, '^.*_mem_', ''), '')::int
         ), 0) + 1
    INTO next_n
    FROM public.memories
   WHERE user_id = NEW.user_id
     AND mem_id LIKE slug || '_mem_%';
  NEW.mem_id := slug || '_mem_' || lpad(next_n::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memories_assign_mem_id ON public.memories;
CREATE TRIGGER memories_assign_mem_id
BEFORE INSERT ON public.memories
FOR EACH ROW EXECUTE FUNCTION public.assign_memory_mem_id();

-- Backfill existing rows, numbering by created_at within each (user_id, slug).
WITH numbered AS (
  SELECT m.id,
         public.memory_slug_for(m.namespace, m.user_id) AS slug,
         row_number() OVER (
           PARTITION BY m.user_id, public.memory_slug_for(m.namespace, m.user_id)
           ORDER BY m.created_at, m.id
         ) AS seq
    FROM public.memories m
   WHERE m.mem_id IS NULL OR m.mem_id = ''
)
UPDATE public.memories m
   SET mem_id = n.slug || '_mem_' || lpad(n.seq::text, 3, '0')
  FROM numbered n
 WHERE m.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS memories_user_mem_id_idx
  ON public.memories (user_id, mem_id);