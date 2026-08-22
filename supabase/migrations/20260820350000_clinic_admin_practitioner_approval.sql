-- Allow a clinic administrator to publish an eligible practitioner belonging
-- to their own active team. Platform suspensions remain platform-controlled.
CREATE OR REPLACE FUNCTION public.protect_physio_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approval_clinic_id text := current_setting('app.clinic_profile_approval', true);
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.verification IS DISTINCT FROM OLD.verification
    OR NEW.rating_avg IS DISTINCT FROM OLD.rating_avg
    OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
    OR NEW.profile_views IS DISTINCT FROM OLD.profile_views
    OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PROTECTED_PROFILE_FIELDS';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       OLD.user_id = auth.uid()
       AND OLD.status IN ('DRAFT', 'REJECTED')
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

CREATE OR REPLACE FUNCTION public.approve_clinic_practitioner(
  _clinic_id uuid,
  _physio_id uuid
)
RETURNS public.physiotherapists
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.physiotherapists;
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;

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

  IF EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    WHERE p.id = _physio_id
      AND p.clinic_id = _clinic_id
      AND p.status = 'SUSPENDED'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_REVIEW_REQUIRED';
  END IF;

  PERFORM set_config('app.clinic_profile_approval', _clinic_id::text, true);

  UPDATE public.physiotherapists
  SET status = 'APPROVED', updated_at = now()
  WHERE id = _physio_id
    AND clinic_id = _clinic_id
    AND status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'APPROVED')
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'PRACTITIONER_NOT_APPROVABLE';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_clinic_practitioner(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_clinic_practitioner(uuid, uuid)
  TO authenticated, service_role;

