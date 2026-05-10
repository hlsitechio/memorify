
DROP POLICY IF EXISTS "voices_read_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_update_own" ON storage.objects;
DROP POLICY IF EXISTS "voices_delete_own" ON storage.objects;

CREATE POLICY "voices_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "voices_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'voices' AND auth.uid()::text = (storage.foldername(name))[1]);
