CREATE POLICY "profiles_bucket_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'profiles');
CREATE POLICY "profiles_bucket_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profiles');
CREATE POLICY "profiles_bucket_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'profiles') WITH CHECK (bucket_id = 'profiles');
CREATE POLICY "profiles_bucket_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'profiles');