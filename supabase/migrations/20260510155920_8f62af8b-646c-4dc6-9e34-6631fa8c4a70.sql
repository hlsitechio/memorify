-- AI-Native Collections: schemaless JSON document store
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  icon text DEFAULT 'database',
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY collections_all_own ON public.collections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_collections_updated_at BEFORE UPDATE ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] DEFAULT ARRAY[]::text[],
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_items_all_own ON public.collection_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_collection_items_updated_at BEFORE UPDATE ON public.collection_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_collection_items_collection ON public.collection_items(collection_id);
CREATE INDEX idx_collection_items_user ON public.collection_items(user_id);
CREATE INDEX idx_collection_items_data ON public.collection_items USING GIN(data);
CREATE INDEX idx_collection_items_tags ON public.collection_items USING GIN(tags);

-- Auto-update item_count
CREATE OR REPLACE FUNCTION public.bump_collection_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.collections SET item_count = item_count + 1 WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.collections SET item_count = GREATEST(item_count - 1, 0) WHERE id = OLD.collection_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_collection_items_count
AFTER INSERT OR DELETE ON public.collection_items
FOR EACH ROW EXECUTE FUNCTION public.bump_collection_count();