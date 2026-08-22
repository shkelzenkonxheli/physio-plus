-- Keep rescheduling on the same clinic-owned service and schedule path used by
-- manual creation, including practitioners without legacy-owned services.
CREATE OR REPLACE FUNCTION public.reschedule_clinic_appointment(
  _appointment_id uuid,
  _location_id uuid,
  _physio_id uuid,
  _clinic_service_id uuid,
  _start_at timestamptz
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_row public.appointments;
  service_row public.clinic_services;
  legacy_id uuid;
  timezone_name text;
  result public.appointments;
  previous jsonb;
BEGIN
  SELECT * INTO current_row
  FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;
  IF current_row.status NOT IN ('PENDING', 'CONFIRMED') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  IF NOT public.can_operate_clinic_appointment(current_row.clinic_id, _physio_id) THEN
    RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED';
  END IF;

  SELECT s.* INTO service_row FROM public.clinic_services s
  WHERE s.id = _clinic_service_id
    AND s.clinic_id = current_row.clinic_id
    AND s.active;
  IF service_row.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;

  SELECT l.timezone INTO timezone_name FROM public.clinic_locations l
  WHERE l.id = _location_id
    AND l.clinic_id = current_row.clinic_id
    AND l.active;
  IF timezone_name IS NULL THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;

  SELECT lm.legacy_service_id INTO legacy_id
  FROM public.legacy_service_mappings lm
  WHERE lm.clinic_id = current_row.clinic_id
    AND lm.clinic_service_id = _clinic_service_id
    AND lm.source_deleted_at IS NULL
  ORDER BY lm.created_at, lm.legacy_service_id LIMIT 1;

  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text, 0));
  IF current_row.physiotherapist_id <> _physio_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(current_row.physiotherapist_id::text, 0));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_available_slots(
      current_row.clinic_id, _location_id, _physio_id, _clinic_service_id,
      (_start_at AT TIME ZONE timezone_name)::date, _appointment_id
    ) available WHERE available.slot = _start_at
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  previous := jsonb_build_object(
    'start_at', current_row.start_at,
    'end_at', current_row.end_at,
    'location_id', current_row.location_id,
    'physiotherapist_id', current_row.physiotherapist_id
  );
  PERFORM set_config('app.allow_appointment_reschedule', 'on', true);
  BEGIN
    UPDATE public.appointments
    SET location_id = _location_id,
        physiotherapist_id = _physio_id,
        service_id = legacy_id,
        clinic_service_id = service_row.id,
        service_name = service_row.name,
        duration_minutes = service_row.duration_minutes,
        start_at = _start_at,
        end_at = _start_at + make_interval(mins => service_row.duration_minutes),
        price = service_row.price,
        currency = service_row.currency,
        rescheduled_at = now()
    WHERE id = _appointment_id
    RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END;

  INSERT INTO public.appointment_activities(
    clinic_id, appointment_id, actor_user_id, action, metadata
  ) VALUES (
    current_row.clinic_id, result.id, auth.uid(), 'APPOINTMENT_RESCHEDULED',
    jsonb_build_object(
      'previous', previous,
      'new', jsonb_build_object(
        'start_at', result.start_at,
        'end_at', result.end_at,
        'location_id', result.location_id,
        'physiotherapist_id', result.physiotherapist_id
      )
    )
  );
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), 'APPOINTMENT_RESCHEDULED', 'appointment', result.id,
    jsonb_build_object('clinic_id', current_row.clinic_id)
  );
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reschedule_clinic_appointment(
  uuid, uuid, uuid, uuid, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_clinic_appointment(
  uuid, uuid, uuid, uuid, timestamptz
) TO authenticated, service_role;

