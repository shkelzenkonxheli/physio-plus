-- Restrict sensitive columns from signed-in users' direct table reads
REVOKE SELECT ON public.physiotherapists FROM authenticated;
GRANT SELECT (id, user_id, slug, first_name, last_name, professional_title, bio,
  education, experience, certifications, photo_url, region_id, city_id, address,
  status, verification, rejection_reason, rating_avg, rating_count, profile_views,
  min_cancellation_hours, onboarding_step, clinic_id, created_at, updated_at)
ON public.physiotherapists TO authenticated;

-- Owner/admin access to the full record (including phone, license, coordinates)
CREATE OR REPLACE FUNCTION public.get_physio_private(_physio_id uuid)
RETURNS TABLE(id uuid, phone text, license_number text, latitude double precision, longitude double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.phone, p.license_number, p.latitude, p.longitude
  FROM public.physiotherapists p
  WHERE p.id = _physio_id
    AND (p.user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.user_roles r
                    WHERE r.user_id = auth.uid() AND r.role IN ('ADMIN','SUPER_ADMIN')));
$$;
REVOKE EXECUTE ON FUNCTION public.get_physio_private(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_physio_private(uuid) TO authenticated;

-- Slug is generated server-side so the app no longer needs the slug helper RPC
ALTER TABLE public.physiotherapists ALTER COLUMN slug SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.set_physio_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.slug IS NULL OR btrim(NEW.slug) = '' THEN
    NEW.slug := public.generate_unique_slug(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_physio_slug() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_physio_slug ON public.physiotherapists;
CREATE TRIGGER trg_set_physio_slug BEFORE INSERT ON public.physiotherapists
FOR EACH ROW EXECUTE FUNCTION public.set_physio_slug();