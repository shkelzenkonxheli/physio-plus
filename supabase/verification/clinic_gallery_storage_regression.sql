-- Clinic gallery storage and tenant-isolation regression. All fixtures roll back.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'profiles'
      AND public = false
      AND file_size_limit = 5242880
  ) THEN
    RAISE EXCEPTION 'PROFILES_BUCKET_NOT_CONFIGURED';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
VALUES(
  'profiles',
  'gallery/clinic/1b93249a-aa66-43d7-b07d-5c2c2d64b630/audit.png',
  auth.uid()::text,
  '{"mimetype":"image/png","size":1}'::jsonb
);

INSERT INTO public.profile_gallery_images(owner_type,owner_id,url,alt,sort_order)
VALUES(
  'CLINIC',
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
  'http://local.test/audit.png',
  'Audit image',
  999
);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id,name,owner_id,metadata)
    VALUES(
      'profiles',
      'gallery/clinic/dddddddd-4444-4444-8444-dddddddddddd/audit.png',
      auth.uid()::text,
      '{"mimetype":"image/png","size":1}'::jsonb
    );
    RAISE EXCEPTION 'CROSS_TENANT_GALLERY_UPLOAD_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.profile_gallery_images(owner_type,owner_id,url,alt,sort_order)
    VALUES(
      'CLINIC',
      'dddddddd-4444-4444-8444-dddddddddddd',
      'http://local.test/cross-tenant.png',
      'Cross tenant',
      999
    );
    RAISE EXCEPTION 'CROSS_TENANT_GALLERY_ROW_ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'CLINIC_GALLERY_STORAGE_RLS_OK';
END $$;

ROLLBACK;
