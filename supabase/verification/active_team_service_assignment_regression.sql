-- Regression: an active clinic physiotherapist may receive internal service
-- assignments regardless of public profile approval. Public visibility stays
-- governed by the existing APPROVED checks in public booking RPCs.
DO $$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.set_clinic_service_assignment(uuid,uuid,uuid,boolean)'::regprocedure
  ) INTO function_definition;

  IF function_definition LIKE '%p.status=''APPROVED''%'
     OR function_definition LIKE '%p.status = ''APPROVED''%' THEN
    RAISE EXCEPTION 'assignment RPC still requires public approval';
  END IF;

  IF function_definition NOT LIKE '%m.active%' THEN
    RAISE EXCEPTION 'assignment RPC does not require active membership';
  END IF;

  SELECT pg_get_functiondef(
    'public.public_service_practitioners(uuid,uuid)'::regprocedure
  ) INTO function_definition;

  IF function_definition NOT LIKE '%APPROVED%' THEN
    RAISE EXCEPTION 'public practitioner RPC lost approval filtering';
  END IF;
END;
$$;

SELECT 'active_team_service_assignment_regression_passed' AS result;

-- Exercise the RPC against an existing unapproved active member when such a
-- fixture exists. Everything is rolled back.
BEGIN;
DO $$
DECLARE
  target record;
  admin_user uuid;
  service_id uuid;
BEGIN
  SELECT p.id AS physio_id, p.clinic_id, p.status
  INTO target
  FROM public.physiotherapists p
  JOIN public.clinic_memberships m
    ON m.clinic_id = p.clinic_id
   AND m.user_id = p.user_id
   AND m.active
  WHERE p.status <> 'APPROVED'
  LIMIT 1;

  IF target.physio_id IS NULL THEN
    RAISE NOTICE 'No unapproved active team member fixture; transactional check skipped';
    RETURN;
  END IF;

  SELECT m.user_id INTO admin_user
  FROM public.clinic_memberships m
  WHERE m.clinic_id = target.clinic_id
    AND m.active
    AND m.role = 'CLINIC_ADMIN'
  LIMIT 1;

  SELECT s.id INTO service_id
  FROM public.clinic_services s
  WHERE s.clinic_id = target.clinic_id
    AND s.active
  LIMIT 1;

  IF admin_user IS NULL OR service_id IS NULL THEN
    RAISE NOTICE 'Clinic admin/service fixture incomplete; transactional check skipped';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', admin_user::text, true);
  PERFORM public.set_clinic_service_assignment(
    target.clinic_id,
    target.physio_id,
    service_id,
    true
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.physiotherapist_services ps
    WHERE ps.clinic_id = target.clinic_id
      AND ps.physiotherapist_id = target.physio_id
      AND ps.clinic_service_id = service_id
      AND ps.active
  ) THEN
    RAISE EXCEPTION 'active team member service assignment did not persist';
  END IF;

  RAISE NOTICE 'Transactional assignment passed for practitioner status %', target.status;
END;
$$;
ROLLBACK;
