-- Central catalog, practitioner assignment and Any Available booking.
-- All data changes roll back.
BEGIN;
ALTER TABLE public.physiotherapists DISABLE TRIGGER trg_protect_physio_owner_fields;
UPDATE public.physiotherapists
SET status='APPROVED'
WHERE id='c2e58193-c822-4d29-bfd4-3e3b5f1be460';
ALTER TABLE public.physiotherapists ENABLE TRIGGER trg_protect_physio_owner_fields;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

DO $$
DECLARE
  v_clinic constant uuid := '1b93249a-aa66-43d7-b07d-5c2c2d64b630';
  v_location constant uuid := '9bf3a1da-84ed-4ed0-9b33-745905330c14';
  v_arben constant uuid := 'ee2fd15e-0ea3-46c8-9eb1-657c80ff4967';
  v_laura constant uuid := 'c2e58193-c822-4d29-bfd4-3e3b5f1be460';
  v_category uuid; v_a uuid; v_b uuid; v_c uuid;
  v_slot timestamptz; v_appointment public.appointments;
BEGIN
  v_category:=public.create_my_clinic_service_category(v_clinic,'Fizioterapi audit');
  v_a:=public.create_my_clinic_service(v_clinic,v_category,'A audit 30',20,30);
  v_b:=public.create_my_clinic_service(v_clinic,v_category,'B audit 45',25,45);
  v_c:=public.create_my_clinic_service(v_clinic,v_category,'C audit 60',30,60);

  PERFORM public.set_clinic_service_assignment(v_clinic,v_arben,v_a,true);
  PERFORM public.set_clinic_service_assignment(v_clinic,v_arben,v_b,true);
  PERFORM public.set_clinic_service_assignment(v_clinic,v_arben,v_c,false);
  PERFORM public.set_clinic_service_assignment(v_clinic,v_laura,v_a,false);
  PERFORM public.set_clinic_service_assignment(v_clinic,v_laura,v_b,true);
  PERFORM public.set_clinic_service_assignment(v_clinic,v_laura,v_c,true);

  IF (SELECT count(*) FROM public.public_service_practitioners(v_clinic,v_a))<>1
     OR NOT EXISTS (SELECT 1 FROM public.public_service_practitioners(v_clinic,v_a) WHERE id=v_arben)
  THEN RAISE EXCEPTION 'SERVICE_A_PRACTITIONER_FILTER_FAILED'; END IF;
  IF (SELECT count(*) FROM public.public_service_practitioners(v_clinic,v_c))<>1
     OR NOT EXISTS (SELECT 1 FROM public.public_service_practitioners(v_clinic,v_c) WHERE id=v_laura)
  THEN RAISE EXCEPTION 'SERVICE_C_PRACTITIONER_FILTER_FAILED'; END IF;
  IF (SELECT count(*) FROM public.public_service_practitioners(v_clinic,v_b))<>2
  THEN RAISE EXCEPTION 'SERVICE_B_PRACTITIONER_FILTER_FAILED'; END IF;

  SELECT slot INTO v_slot FROM public.clinic_service_available_slots(
    v_clinic,v_location,v_b,'2026-08-24',NULL
  ) ORDER BY slot LIMIT 1;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'ANY_AVAILABLE_SLOTS_MISSING'; END IF;

  v_appointment:=public.book_clinic_service_appointment(
    v_clinic,v_location,v_b,NULL,v_slot,
    'Patient','Audit','patient.audit@example.com','044123456','Regression'
  );
  IF v_appointment.physiotherapist_id<>v_laura THEN
    RAISE EXCEPTION 'ANY_AVAILABLE_NOT_DETERMINISTIC';
  END IF;
  IF v_appointment.clinic_id<>v_clinic OR v_appointment.location_id<>v_location
    OR v_appointment.clinic_service_id<>v_b OR v_appointment.patient_id IS NULL
    OR v_appointment.duration_minutes<>45 OR v_appointment.price<>25
    OR v_appointment.end_at-v_appointment.start_at<>interval '45 minutes'
  THEN RAISE EXCEPTION 'APPOINTMENT_SNAPSHOT_OR_RELATION_FAILED'; END IF;

  IF EXISTS (
    SELECT slot FROM public.clinic_service_available_slots(v_clinic,v_location,v_b,'2026-08-24',v_laura)
    WHERE slot=v_slot
  ) THEN RAISE EXCEPTION 'ASSIGNED_PRACTITIONER_SLOT_STILL_AVAILABLE'; END IF;
  IF NOT EXISTS (
    SELECT slot FROM public.clinic_service_available_slots(v_clinic,v_location,v_b,'2026-08-24',NULL)
    WHERE slot=v_slot
  ) THEN RAISE EXCEPTION 'MERGED_SLOT_DID_NOT_RETAIN_OTHER_PRACTITIONER'; END IF;
  RAISE NOTICE 'CLINIC_CATALOG_ANY_BOOKING_OK';
END $$;

SELECT set_config('request.jwt.claim.sub','cb54da15-783c-4bc3-9aae-6cf1c3e48f72',true);
DO $$
DECLARE v_service uuid;
BEGIN
  SELECT id INTO v_service FROM public.clinic_services
  WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' LIMIT 1;
  BEGIN
    PERFORM public.set_clinic_service_assignment(
      '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
      'c2e58193-c822-4d29-bfd4-3e3b5f1be460',v_service,true
    );
    RAISE EXCEPTION 'PHYSIOTHERAPIST_WRITE_WAS_NOT_BLOCKED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='PHYSIOTHERAPIST_WRITE_WAS_NOT_BLOCKED' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'SERVICE_ASSIGNMENT_ROLE_GUARD_OK';
END $$;
ROLLBACK;
