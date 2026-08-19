-- Keep privileged roles server-controlled. New accounts start as clients.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE requested_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  requested_role := CASE
    WHEN NEW.raw_user_meta_data ->> 'role' = 'PHYSIOTHERAPIST' THEN 'PHYSIOTHERAPIST'::public.app_role
    ELSE 'CLIENT'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

-- Only users who registered as physiotherapists may create a professional profile.
CREATE OR REPLACE FUNCTION public.create_my_physio_profile(
  _first_name text,
  _last_name text,
  _phone text,
  _region_id uuid,
  _city_id uuid,
  _professional_title text DEFAULT NULL,
  _license_number text DEFAULT NULL,
  _bio text DEFAULT NULL
) RETURNS public.physiotherapists
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.physiotherapists;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(_uid, 'PHYSIOTHERAPIST') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO _row FROM public.physiotherapists WHERE user_id = _uid;
  IF FOUND THEN
    RETURN _row;
  END IF;

  INSERT INTO public.physiotherapists (
    user_id, slug, first_name, last_name, phone, professional_title,
    license_number, region_id, city_id, bio, status
  ) VALUES (
    _uid, '', trim(_first_name), trim(_last_name), NULLIF(trim(_phone), ''),
    NULLIF(trim(_professional_title), ''), NULLIF(trim(_license_number), ''),
    _region_id, _city_id, NULLIF(trim(coalesce(_bio, '')), ''), 'DRAFT'
  ) RETURNING * INTO _row;

  RETURN _row;
END; $$;

-- Owners may edit profile content, but approval and reporting fields are admin-controlled.
CREATE OR REPLACE FUNCTION public.protect_physio_owner_fields()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.verification IS DISTINCT FROM OLD.verification
    OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
    OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
    OR NEW.profile_views IS DISTINCT FROM OLD.profile_views
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PROTECTED_PROFILE_FIELDS';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_physio_owner_fields ON public.physiotherapists;
CREATE TRIGGER trg_protect_physio_owner_fields
  BEFORE UPDATE OF user_id, status, verification, rating_avg, rating_count, profile_views, clinic_id, created_at
  ON public.physiotherapists
  FOR EACH ROW EXECUTE FUNCTION public.protect_physio_owner_fields();

-- Clients cannot mutate appointment records directly. Physiotherapists may change status only.
CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id = auth.uid()
    AND OLD.physiotherapist_id IS DISTINCT FROM public.current_physio_id() THEN
    RAISE EXCEPTION 'CLIENT_APPOINTMENT_UPDATE_FORBIDDEN';
  END IF;

  IF OLD.physiotherapist_id = public.current_physio_id()
    AND (NEW.id IS DISTINCT FROM OLD.id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.physiotherapist_id IS DISTINCT FROM OLD.physiotherapist_id
      OR NEW.service_id IS DISTINCT FROM OLD.service_id
      OR NEW.service_name IS DISTINCT FROM OLD.service_name
      OR NEW.start_at IS DISTINCT FROM OLD.start_at
      OR NEW.end_at IS DISTINCT FROM OLD.end_at
      OR NEW.price IS DISTINCT FROM OLD.price
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.client_first_name IS DISTINCT FROM OLD.client_first_name
      OR NEW.client_last_name IS DISTINCT FROM OLD.client_last_name
      OR NEW.client_email IS DISTINCT FROM OLD.client_email
      OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
      OR NEW.client_message IS DISTINCT FROM OLD.client_message
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'PROTECTED_APPOINTMENT_FIELDS';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_protect_appointment_update ON public.appointments;
CREATE TRIGGER trg_protect_appointment_update
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_appointment_update();

-- Storage ownership follows the application folder layout.
DROP POLICY IF EXISTS "profiles_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "profiles_bucket_delete" ON storage.objects;

CREATE POLICY "profiles_bucket_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profiles'
    AND (
      name LIKE 'physio/' || public.current_physio_id()::text || '/%'
      OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
      OR (public.is_admin(auth.uid()) AND name LIKE 'clinics/%')
    )
  );

CREATE POLICY "profiles_bucket_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profiles'
    AND (
      name LIKE 'physio/' || public.current_physio_id()::text || '/%'
      OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
      OR (public.is_admin(auth.uid()) AND name LIKE 'clinics/%')
    )
  )
  WITH CHECK (
    bucket_id = 'profiles'
    AND (
      name LIKE 'physio/' || public.current_physio_id()::text || '/%'
      OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
      OR (public.is_admin(auth.uid()) AND name LIKE 'clinics/%')
    )
  );

CREATE POLICY "profiles_bucket_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profiles'
    AND (
      name LIKE 'physio/' || public.current_physio_id()::text || '/%'
      OR name LIKE 'gallery/physiotherapist/' || public.current_physio_id()::text || '/%'
      OR (public.is_admin(auth.uid()) AND name LIKE 'clinics/%')
    )
  );
