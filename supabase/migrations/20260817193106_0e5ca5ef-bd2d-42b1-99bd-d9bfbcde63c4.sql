-- 1. Restrict public (anon) column exposure on physiotherapists
REVOKE SELECT ON public.physiotherapists FROM anon;
GRANT SELECT (id, user_id, slug, first_name, last_name, professional_title, bio,
  education, experience, certifications, photo_url, region_id, city_id, address,
  status, verification, rating_avg, rating_count, profile_views,
  min_cancellation_hours, clinic_id, created_at, updated_at)
ON public.physiotherapists TO anon;

-- 2. Working hours: only for approved physiotherapists
DROP POLICY IF EXISTS wh_public_read ON public.working_hours;
CREATE POLICY wh_public_read ON public.working_hours FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.physiotherapists p
  WHERE p.id = working_hours.physiotherapist_id AND p.status = 'APPROVED'));

-- 3. Availability exceptions: only for approved physiotherapists
DROP POLICY IF EXISTS ae_public_read ON public.availability_exceptions;
CREATE POLICY ae_public_read ON public.availability_exceptions FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.physiotherapists p
  WHERE p.id = availability_exceptions.physiotherapist_id AND p.status = 'APPROVED'));

-- 4. Fix mutable search_path
ALTER FUNCTION public.slugify(text) SET search_path = public;

-- 5. Revoke public execute on internal SECURITY DEFINER / helper functions
REVOKE EXECUTE ON FUNCTION public.current_physio_id() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_unique_slug(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.slugify(text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_review_allowed() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_service_category_owner() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_appointment_status_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_physio_rating() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.available_slots(uuid, uuid, date) FROM public;
REVOKE EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, text, text, text, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.hold_slot(uuid, uuid, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid, uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_slot(uuid, uuid, timestamptz, text) TO anon, authenticated;