-- Make the already-visible clinic gallery functional without broadening access
-- to another clinic's files.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('profiles','profiles',false,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET
  public=false,
  file_size_limit=5242880,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS "profiles_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_delete" ON storage.objects;

CREATE POLICY "profiles_bucket_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='profiles' AND (
    name LIKE 'physio/' || public.current_physio_id()::text || '/%'
    OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
    OR EXISTS(
      SELECT 1 FROM public.clinic_memberships m
      WHERE public.is_clinic_admin(m.clinic_id)
        AND name LIKE 'gallery/clinic/' || m.clinic_id::text || '/%'
    )
    OR (public.is_admin(auth.uid()) AND (
      name LIKE 'clinics/%' OR name LIKE 'gallery/clinic/%'
    ))
  )
);

CREATE POLICY "profiles_bucket_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id='profiles' AND (
    name LIKE 'physio/' || public.current_physio_id()::text || '/%'
    OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
    OR EXISTS(
      SELECT 1 FROM public.clinic_memberships m
      WHERE public.is_clinic_admin(m.clinic_id)
        AND name LIKE 'gallery/clinic/' || m.clinic_id::text || '/%'
    )
    OR public.is_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id='profiles' AND (
    name LIKE 'physio/' || public.current_physio_id()::text || '/%'
    OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
    OR EXISTS(
      SELECT 1 FROM public.clinic_memberships m
      WHERE public.is_clinic_admin(m.clinic_id)
        AND name LIKE 'gallery/clinic/' || m.clinic_id::text || '/%'
    )
    OR public.is_admin(auth.uid())
  )
);

CREATE POLICY "profiles_bucket_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id='profiles' AND (
    name LIKE 'physio/' || public.current_physio_id()::text || '/%'
    OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
    OR EXISTS(
      SELECT 1 FROM public.clinic_memberships m
      WHERE public.is_clinic_admin(m.clinic_id)
        AND name LIKE 'gallery/clinic/' || m.clinic_id::text || '/%'
    )
    OR public.is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS pgi_owner_all ON public.profile_gallery_images;
CREATE POLICY pgi_owner_all ON public.profile_gallery_images FOR ALL TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (owner_type='PHYSIOTHERAPIST' AND owner_id=public.current_physio_id())
  OR (owner_type='CLINIC' AND public.is_clinic_admin(owner_id))
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR (owner_type='PHYSIOTHERAPIST' AND owner_id=public.current_physio_id())
  OR (owner_type='CLINIC' AND public.is_clinic_admin(owner_id))
);
