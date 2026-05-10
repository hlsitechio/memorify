
ALTER TABLE public.voices
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime text,
  ADD COLUMN IF NOT EXISTS duration_sec numeric,
  ADD COLUMN IF NOT EXISTS size bigint,
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.voices ALTER COLUMN kind SET DEFAULT 'recording';

DROP TRIGGER IF EXISTS voices_set_updated_at ON public.voices;
CREATE TRIGGER voices_set_updated_at BEFORE UPDATE ON public.voices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('voices', 'voices', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voices_read_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_update_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_delete_own" ON storage.objects;

CREATE POLICY "voices_read_own" ON storage.objects FOR SELECT
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_update_own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_delete_own" ON storage.objects FOR DELETE
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
