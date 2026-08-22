-- Separate a practitioner's ability to receive clinic bookings from having a
-- standalone card/profile in the public directory.
ALTER TABLE public.physiotherapists
  ADD COLUMN IF NOT EXISTS directory_listing_enabled boolean NOT NULL DEFAULT true;

-- Existing invited staff stay visible inside their clinic, not as standalone
-- directory entries. A practitioner who owns/administers their personal clinic
-- remains a directory entry.
UPDATE public.physiotherapists p
SET directory_listing_enabled = false
WHERE EXISTS (
  SELECT 1
  FROM public.clinic_memberships m
  WHERE m.clinic_id = p.clinic_id
    AND m.user_id = p.user_id
    AND m.role = 'PHYSIOTHERAPIST'
    AND m.active
)
AND NOT EXISTS (
  SELECT 1
  FROM public.clinic_memberships m
  WHERE m.clinic_id = p.clinic_id
    AND m.user_id = p.user_id
    AND m.role = 'CLINIC_ADMIN'
    AND m.active
);

COMMENT ON COLUMN public.physiotherapists.directory_listing_enabled IS
  'Platform-controlled standalone directory/profile visibility. Team booking eligibility is controlled separately by status and assignments.';

DROP POLICY IF EXISTS "physio_public_read_approved" ON public.physiotherapists;
CREATE POLICY "physio_public_read_approved" ON public.physiotherapists
  FOR SELECT TO anon, authenticated
  USING (status = 'APPROVED' AND directory_listing_enabled);

CREATE OR REPLACE FUNCTION public.provision_physio_clinic_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_clinic_id uuid;
  clinic_name text;
  location_name text;
BEGIN
  target_clinic_id := NEW.clinic_id;

  IF target_clinic_id IS NULL THEN
    NEW.directory_listing_enabled := true;
    clinic_name := NULLIF(trim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
    clinic_name := COALESCE(clinic_name, 'Klinika e fizioterapeutit');

    INSERT INTO public.clinics (
      name, slug, region_id, city_id, address, phone, active, public_listing_enabled
    ) VALUES (
      clinic_name,
      public.generate_unique_clinic_slug(clinic_name, NULL::uuid),
      NEW.region_id, NEW.city_id, NEW.address, NEW.phone, false, false
    ) RETURNING id INTO target_clinic_id;

    NEW.clinic_id := target_clinic_id;

    INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active)
    VALUES (target_clinic_id, NEW.user_id, 'CLINIC_ADMIN', true)
    ON CONFLICT (clinic_id, user_id, role) DO UPDATE SET active = true;

    SELECT COALESCE(NULLIF(trim(c.name), ''), 'Lokacioni kryesor')
    INTO location_name FROM public.cities c WHERE c.id = NEW.city_id;

    INSERT INTO public.clinic_locations (
      clinic_id, name, address, city_id, region_id, phone,
      timezone, active, is_default
    ) VALUES (
      target_clinic_id, COALESCE(location_name, 'Lokacioni kryesor'),
      NEW.address, NEW.city_id, NEW.region_id, NEW.phone,
      'Europe/Pristina', true, true
    );
  ELSE
    NEW.directory_listing_enabled := false;
    IF NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = target_clinic_id) THEN
      RAISE EXCEPTION 'PHYSIOTHERAPIST_CLINIC_NOT_FOUND';
    END IF;

    INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active)
    VALUES (target_clinic_id, NEW.user_id, 'PHYSIOTHERAPIST', true)
    ON CONFLICT (clinic_id, user_id, role) DO UPDATE SET active = true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_physio_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approval_clinic_id text := current_setting('app.clinic_profile_approval', true);
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.verification IS DISTINCT FROM OLD.verification
    OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
    OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
    OR NEW.profile_views IS DISTINCT FROM OLD.profile_views
    OR NEW.directory_listing_enabled IS DISTINCT FROM OLD.directory_listing_enabled
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PROTECTED_PROFILE_FIELDS';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       OLD.user_id = auth.uid() AND OLD.status IN ('DRAFT', 'REJECTED')
       AND NEW.status = 'PENDING_APPROVAL'
     )
     AND NOT (
       NEW.status = 'APPROVED'
       AND OLD.status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED')
       AND OLD.clinic_id IS NOT NULL
       AND approval_clinic_id = OLD.clinic_id::text
       AND public.is_clinic_admin(OLD.clinic_id)
     ) THEN
    RAISE EXCEPTION 'PROTECTED_PROFILE_FIELDS';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_clinic_practitioners(_clinic_id uuid)
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  professional_title text,
  photo_url text,
  is_clinic_admin boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.professional_title, p.photo_url,
         bool_or(m.role = 'CLINIC_ADMIN') AS is_clinic_admin
  FROM public.physiotherapists p
  JOIN public.clinic_memberships m
    ON m.clinic_id = p.clinic_id AND m.user_id = p.user_id AND m.active
  WHERE p.clinic_id = _clinic_id
    AND p.status = 'APPROVED'
    AND EXISTS (
      SELECT 1 FROM public.physiotherapist_services ps
      WHERE ps.clinic_id = p.clinic_id AND ps.physiotherapist_id = p.id AND ps.active
    )
    AND EXISTS (
      SELECT 1 FROM public.physiotherapist_locations pl
      WHERE pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
    )
  GROUP BY p.id, p.first_name, p.last_name, p.professional_title, p.photo_url
  ORDER BY bool_or(m.role = 'CLINIC_ADMIN') DESC, p.first_name, p.last_name, p.id;
$$;

REVOKE ALL ON FUNCTION public.public_clinic_practitioners(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_clinic_practitioners(uuid)
  TO anon, authenticated, service_role;

