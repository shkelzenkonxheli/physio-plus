-- Phase 4 local-only regression checks.
-- Every fixture is rolled back. Run against a seeded/local database, never as a migration.
BEGIN;

DO $$
DECLARE
  ctx record;
  second_location_id uuid := gen_random_uuid();
  free_slot timestamptz;
  existing_slot timestamptz;
  first_hold timestamptz;
  rejected boolean;
BEGIN
  SELECT p.id AS physio_id, p.clinic_id, s.id AS service_id,
         pl.clinic_location_id AS location_id
  INTO ctx
  FROM public.physiotherapists p
  JOIN public.services s ON s.physiotherapist_id = p.id AND s.active
  JOIN public.legacy_service_mappings m
    ON m.legacy_service_id = s.id AND m.source_deleted_at IS NULL
  JOIN public.physiotherapist_services ps
    ON ps.clinic_id = p.clinic_id
   AND ps.physiotherapist_id = p.id
   AND ps.clinic_service_id = m.clinic_service_id
   AND ps.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
  WHERE p.status = 'APPROVED'
  LIMIT 1;

  IF ctx IS NULL THEN RAISE EXCEPTION 'PHASE4_TEST_FIXTURE_MISSING'; END IF;

  SELECT candidate.slot INTO free_slot
  FROM generate_series(current_date + 1, current_date + 30, interval '1 day') day
  CROSS JOIN LATERAL public.available_slots(
    ctx.clinic_id, ctx.location_id, ctx.physio_id, ctx.service_id, day::date
  ) candidate
  ORDER BY candidate.slot
  LIMIT 1;
  IF free_slot IS NULL THEN RAISE EXCEPTION 'PHASE4_FREE_SLOT_FIXTURE_MISSING'; END IF;

  -- Tenant IDs supplied by a client are checked against the resolved physio.
  rejected := false;
  BEGIN
    PERFORM public.available_slots(
      gen_random_uuid(), ctx.location_id, ctx.physio_id, ctx.service_id, free_slot::date
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := SQLERRM LIKE '%BOOKING_CROSS_CLINIC_CONTEXT%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'CROSS_CLINIC_CONTEXT_WAS_NOT_REJECTED'; END IF;

  -- A second assigned location makes legacy/single-location wrappers ambiguous.
  INSERT INTO public.clinic_locations(id, clinic_id, name, active, is_default)
  VALUES (second_location_id, ctx.clinic_id, 'Phase 4 transactional test', true, false);
  INSERT INTO public.physiotherapist_locations(
    clinic_id, physiotherapist_id, clinic_location_id, active
  ) VALUES (ctx.clinic_id, ctx.physio_id, second_location_id, true);

  rejected := false;
  BEGIN
    PERFORM public.available_slots(ctx.physio_id, ctx.service_id, free_slot::date);
  EXCEPTION WHEN OTHERS THEN
    rejected := SQLERRM LIKE '%LOCATION_REQUIRED%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'MULTI_LOCATION_DID_NOT_REQUIRE_SELECTION'; END IF;

  -- Two sessions competing for the same slot serialize on the physio lock.
  first_hold := public.hold_slot(
    ctx.clinic_id, ctx.location_id, ctx.physio_id, ctx.service_id,
    free_slot, 'phase4-request-a'
  );
  IF first_hold IS NULL THEN RAISE EXCEPTION 'FIRST_HOLD_FAILED'; END IF;

  rejected := false;
  BEGIN
    PERFORM public.hold_slot(
      ctx.clinic_id, ctx.location_id, ctx.physio_id, ctx.service_id,
      free_slot, 'phase4-request-b'
    );
  EXCEPTION WHEN OTHERS THEN
    rejected := SQLERRM LIKE '%SLOT_UNAVAILABLE%';
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'SECOND_HOLD_WAS_NOT_REJECTED'; END IF;

  -- Existing overlap remains global to the human physio, not the location.
  SELECT a.start_at INTO existing_slot
  FROM public.appointments a
  WHERE a.physiotherapist_id = ctx.physio_id
    AND a.status IN ('PENDING', 'CONFIRMED')
  LIMIT 1;
  IF existing_slot IS NOT NULL THEN
    rejected := false;
    BEGIN
      PERFORM public.book_appointment(
        ctx.clinic_id, second_location_id, ctx.physio_id, ctx.service_id,
        existing_slot, 'Overlap', 'Test', 'overlap@example.com', '044000002', NULL
      );
    EXCEPTION WHEN OTHERS THEN
      rejected := SQLERRM LIKE '%SLOT_UNAVAILABLE%';
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'CROSS_LOCATION_OVERLAP_WAS_NOT_REJECTED'; END IF;
  END IF;

  RAISE NOTICE 'PHASE4_REGRESSION_OK';
END $$;

ROLLBACK;
