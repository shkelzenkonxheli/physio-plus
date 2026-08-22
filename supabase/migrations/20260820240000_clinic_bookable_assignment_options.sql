-- Expose only the identifiers needed by the Clinic Panel to disable booking
-- combinations that the existing booking engine cannot resolve yet.
CREATE OR REPLACE FUNCTION public.get_clinic_bookable_assignments(_clinic_id uuid)
RETURNS TABLE(
  physiotherapist_id uuid,
  location_id uuid,
  clinic_service_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, pl.clinic_location_id, lm.clinic_service_id
  FROM public.physiotherapists p
  JOIN public.clinics c ON c.id=p.clinic_id AND c.active
  JOIN public.clinic_memberships staff
    ON staff.clinic_id=p.clinic_id AND staff.user_id=p.user_id AND staff.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id=p.clinic_id AND pl.physiotherapist_id=p.id AND pl.active
  JOIN public.clinic_locations location
    ON location.id=pl.clinic_location_id AND location.clinic_id=pl.clinic_id AND location.active
  JOIN public.legacy_service_mappings lm
    ON lm.clinic_id=p.clinic_id AND lm.physiotherapist_id=p.id AND lm.source_deleted_at IS NULL
  JOIN public.services legacy
    ON legacy.id=lm.legacy_service_id AND legacy.physiotherapist_id=p.id AND legacy.active
  JOIN public.clinic_services service
    ON service.id=lm.clinic_service_id AND service.clinic_id=lm.clinic_id AND service.active
  JOIN public.physiotherapist_services ps
    ON ps.clinic_id=lm.clinic_id AND ps.physiotherapist_id=p.id
   AND ps.clinic_service_id=lm.clinic_service_id AND ps.active
  WHERE p.clinic_id=_clinic_id AND p.status='APPROVED'
    AND (public.is_clinic_member(_clinic_id) OR public.is_admin(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_bookable_assignments(uuid)
  TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_clinic_bookable_assignments(uuid)
  FROM PUBLIC,anon;
