-- New service -> public booking duration regression. Everything rolls back.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

DO $$
DECLARE
  v_clinic_id constant uuid := '1b93249a-aa66-43d7-b07d-5c2c2d64b630';
  v_physio_id constant uuid := 'ee2fd15e-0ea3-46c8-9eb1-657c80ff4967';
  v_location_id constant uuid := '9bf3a1da-84ed-4ed0-9b33-745905330c14';
  v_clinic_category_id uuid;
  v_clinic_service_id uuid;
  v_legacy_service_id uuid;
BEGIN
  v_clinic_category_id := public.create_my_clinic_service_category(v_clinic_id,'Audit category');
  v_clinic_service_id := public.create_my_clinic_service(
    v_clinic_id,v_clinic_category_id,'Audit 45 minute service',25,45
  );

  SELECT m.legacy_service_id INTO v_legacy_service_id
  FROM public.legacy_service_mappings m
  WHERE m.clinic_service_id=v_clinic_service_id AND m.source_deleted_at IS NULL;

  IF v_legacy_service_id IS NULL THEN RAISE EXCEPTION 'LEGACY_BOOKING_MAPPING_MISSING'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.clinic_services
    WHERE id=v_clinic_service_id AND duration_minutes=45 AND active
  ) THEN RAISE EXCEPTION 'CLINIC_DURATION_NOT_45'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.services
    WHERE id=v_legacy_service_id AND duration_minutes=45 AND active
  ) THEN RAISE EXCEPTION 'PUBLIC_DURATION_NOT_45'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.physiotherapist_services
    WHERE clinic_id=v_clinic_id AND physiotherapist_id=v_physio_id
      AND clinic_service_id=v_clinic_service_id AND active
  ) THEN RAISE EXCEPTION 'PHYSIO_SERVICE_ASSIGNMENT_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.available_slots(
      v_clinic_id,v_location_id,v_physio_id,v_legacy_service_id,'2026-08-24'::date
    )
  ) THEN RAISE EXCEPTION 'NEW_SERVICE_HAS_NO_PUBLIC_SLOTS'; END IF;

  RAISE NOTICE 'SERVICE_45_MINUTE_BOOKING_OK';
END $$;
ROLLBACK;
