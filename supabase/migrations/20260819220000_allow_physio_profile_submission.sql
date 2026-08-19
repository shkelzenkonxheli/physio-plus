-- Allow a physiotherapist to submit only their own profile for review.
-- Approval, rejection, suspension, verification and ownership remain
-- administrator-controlled.

CREATE OR REPLACE FUNCTION public.protect_physio_owner_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     ) THEN
    RAISE EXCEPTION 'PROTECTED_PROFILE_FIELDS';
  END IF;

  RETURN NEW;
END;
$$;
