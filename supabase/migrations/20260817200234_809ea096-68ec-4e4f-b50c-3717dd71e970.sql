-- 1. Extend clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS phone2 text,
  ADD COLUMN IF NOT EXISTS whatsapp text;

CREATE UNIQUE INDEX IF NOT EXISTS clinics_slug_key ON public.clinics(slug);

-- 2. Global slug uniqueness across physiotherapists and clinics
CREATE OR REPLACE FUNCTION public.slug_taken(_slug text, _clinic_id uuid DEFAULT NULL, _physio_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinics c WHERE c.slug = _slug AND (_clinic_id IS NULL OR c.id <> _clinic_id))
      OR EXISTS (SELECT 1 FROM public.physiotherapists p WHERE p.slug = _slug AND (_physio_id IS NULL OR p.id <> _physio_id));
$$;
REVOKE EXECUTE ON FUNCTION public.slug_taken(text, uuid, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_unique_clinic_slug(_base text, _clinic_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; i int := 1;
BEGIN
  base := NULLIF(public.slugify(_base), '');
  IF base IS NULL THEN base := 'klinika'; END IF;
  candidate := base;
  WHILE public.slug_taken(candidate, _clinic_id, NULL) LOOP
    i := i + 1;
    candidate := base || '-' || i;
  END LOOP;
  RETURN candidate;
END; $$;
REVOKE EXECUTE ON FUNCTION public.generate_unique_clinic_slug(text, uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_unique_slug(_base text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; i int := 1;
BEGIN
  base := NULLIF(public.slugify(_base), '');
  IF base IS NULL THEN base := 'fizioterapeut'; END IF;
  candidate := base;
  WHILE public.slug_taken(candidate, NULL, NULL) LOOP
    i := i + 1;
    candidate := base || '-' || i;
  END LOOP;
  RETURN candidate;
END; $$;

-- 3. Clinic service categories
CREATE TABLE IF NOT EXISTS public.clinic_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clinic_service_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_service_categories TO authenticated;
GRANT ALL ON public.clinic_service_categories TO service_role;
ALTER TABLE public.clinic_service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY csc_public_read ON public.clinic_service_categories FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND c.active));
CREATE POLICY csc_admin_all ON public.clinic_service_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. Clinic services
CREATE TABLE IF NOT EXISTS public.clinic_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.clinic_service_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  duration_minutes integer NOT NULL DEFAULT 45,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clinic_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_services TO authenticated;
GRANT ALL ON public.clinic_services TO service_role;
ALTER TABLE public.clinic_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_public_read ON public.clinic_services FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND c.active));
CREATE POLICY cs_admin_all ON public.clinic_services FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 5. Clinic working hours
CREATE TABLE IF NOT EXISTS public.clinic_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_start time,
  break_end time,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (clinic_id, day_of_week)
);
GRANT SELECT ON public.clinic_working_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_working_hours TO authenticated;
GRANT ALL ON public.clinic_working_hours TO service_role;
ALTER TABLE public.clinic_working_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY cwh_public_read ON public.clinic_working_hours FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND c.active));
CREATE POLICY cwh_admin_all ON public.clinic_working_hours FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 6. Clinic days off
CREATE TABLE IF NOT EXISTS public.clinic_days_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, date)
);
GRANT SELECT ON public.clinic_days_off TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_days_off TO authenticated;
GRANT ALL ON public.clinic_days_off TO service_role;
ALTER TABLE public.clinic_days_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY cdo_public_read ON public.clinic_days_off FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = clinic_id AND c.active));
CREATE POLICY cdo_admin_all ON public.clinic_days_off FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 7. Gallery (shared by clinics and physiotherapists)
CREATE TABLE IF NOT EXISTS public.profile_gallery_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('CLINIC','PHYSIOTHERAPIST')),
  owner_id uuid NOT NULL,
  url text NOT NULL,
  alt text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pgi_owner_idx ON public.profile_gallery_images(owner_type, owner_id);
GRANT SELECT ON public.profile_gallery_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_gallery_images TO authenticated;
GRANT ALL ON public.profile_gallery_images TO service_role;
ALTER TABLE public.profile_gallery_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY pgi_public_read ON public.profile_gallery_images FOR SELECT TO anon, authenticated
  USING (
    (owner_type = 'CLINIC' AND EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = owner_id AND c.active))
    OR (owner_type = 'PHYSIOTHERAPIST' AND EXISTS (SELECT 1 FROM public.physiotherapists p WHERE p.id = owner_id AND p.status = 'APPROVED'))
  );
CREATE POLICY pgi_owner_all ON public.profile_gallery_images FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR (owner_type = 'PHYSIOTHERAPIST' AND owner_id = public.current_physio_id()))
  WITH CHECK (public.is_admin(auth.uid()) OR (owner_type = 'PHYSIOTHERAPIST' AND owner_id = public.current_physio_id()));

-- max 20 images per profile, enforced server-side
CREATE OR REPLACE FUNCTION public.enforce_gallery_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.profile_gallery_images
      WHERE owner_type = NEW.owner_type AND owner_id = NEW.owner_id) >= 20 THEN
    RAISE EXCEPTION 'GALLERY_LIMIT_REACHED';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_gallery_limit ON public.profile_gallery_images;
CREATE TRIGGER trg_gallery_limit BEFORE INSERT ON public.profile_gallery_images
  FOR EACH ROW EXECUTE FUNCTION public.enforce_gallery_limit();

-- 8. Admin upsert with full profile fields
CREATE OR REPLACE FUNCTION public.admin_upsert_clinic(
  _id uuid,
  _name text,
  _city_id uuid,
  _address text,
  _phone text,
  _email text,
  _active boolean,
  _slug text DEFAULT NULL,
  _description text DEFAULT NULL,
  _logo_url text DEFAULT NULL,
  _header_image_url text DEFAULT NULL,
  _website text DEFAULT NULL,
  _phone2 text DEFAULT NULL,
  _whatsapp text DEFAULT NULL
) RETURNS public.clinics LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res public.clinics; reg uuid; final_slug text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(coalesce(_name,'')) < 2 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT region_id INTO reg FROM public.cities WHERE id = _city_id;
  final_slug := public.generate_unique_clinic_slug(coalesce(NULLIF(_slug,''), _name), _id);

  IF _id IS NULL THEN
    INSERT INTO public.clinics (name, slug, city_id, region_id, address, phone, email, active,
      description, logo_url, header_image_url, website, phone2, whatsapp)
    VALUES (_name, final_slug, _city_id, reg, _address, _phone, _email, coalesce(_active,true),
      _description, _logo_url, _header_image_url, _website, _phone2, _whatsapp)
    RETURNING * INTO res;
  ELSE
    UPDATE public.clinics SET
      name=_name, slug=final_slug, city_id=_city_id, region_id=reg, address=_address,
      phone=_phone, email=_email, active=coalesce(_active,true), description=_description,
      logo_url=_logo_url, header_image_url=_header_image_url, website=_website,
      phone2=_phone2, whatsapp=_whatsapp, updated_at=now()
    WHERE id=_id RETURNING * INTO res;
  END IF;
  RETURN res;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_clinic(uuid, text, uuid, text, text, text, boolean, text, text, text, text, text, text, text) TO authenticated;