-- Clinic admins may configure an active team member before their public
-- practitioner profile is approved. Public booking continues to expose only
-- APPROVED practitioners through public_service_practitioners and slot RPCs.
CREATE OR REPLACE FUNCTION public.set_clinic_service_assignment(
  _clinic_id uuid,
  _physio_id uuid,
  _clinic_service_id uuid,
  _active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;

  -- Assignment eligibility is tenant membership, not public profile status.
  IF NOT EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    JOIN public.clinic_memberships m
      ON m.clinic_id = p.clinic_id
     AND m.user_id = p.user_id
     AND m.active
    WHERE p.id = _physio_id
      AND p.clinic_id = _clinic_id
  ) THEN
    RAISE EXCEPTION 'PRACTITIONER_NOT_ACTIVE_TEAM_MEMBER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinic_services s
    WHERE s.id = _clinic_service_id
      AND s.clinic_id = _clinic_id
  ) THEN
    RAISE EXCEPTION 'SERVICE_NOT_FOUND';
  END IF;

  INSERT INTO public.physiotherapist_services (
    clinic_id,
    physiotherapist_id,
    clinic_service_id,
    active
  )
  VALUES (
    _clinic_id,
    _physio_id,
    _clinic_service_id,
    _active
  )
  ON CONFLICT (clinic_id, physiotherapist_id, clinic_service_id)
  DO UPDATE SET active = EXCLUDED.active;
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_service_assignment(uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_service_assignment(uuid, uuid, uuid, boolean)
  TO authenticated, service_role;

