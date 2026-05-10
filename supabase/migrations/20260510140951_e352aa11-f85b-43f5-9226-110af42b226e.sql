
-- documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  mime text,
  size bigint,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_all_own ON public.documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- images
CREATE TABLE public.images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  prompt text,
  model text,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'generated',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
CREATE POLICY images_all_own ON public.images FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- voices
CREATE TABLE public.voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'tts',
  sample_url text,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY voices_all_own ON public.voices FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('documents','documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('images','images', false) ON CONFLICT (id) DO NOTHING;

-- storage policies: per-user folder
CREATE POLICY "docs_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "docs_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "imgs_select_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "imgs_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "imgs_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "imgs_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'images' AND auth.uid()::text = (storage.foldername(name))[1]);
