-- Manual Clinic Panel booking must use the current clinic-owned catalog and
-- staff/location schedules. Newly invited staff intentionally have no legacy
-- physiotherapist-owned service rows.
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
  SELECT DISTINCT p.id, pl.clinic_location_id, service.id
  FROM public.physiotherapists p
  JOIN public.clinics c ON c.id = p.clinic_id AND c.active
  JOIN public.clinic_memberships staff
    ON staff.clinic_id = p.clinic_id AND staff.user_id = p.user_id AND staff.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
  JOIN public.clinic_locations location
    ON location.id = pl.clinic_location_id
   AND location.clinic_id = pl.clinic_id AND location.active
  JOIN public.physiotherapist_services ps
    ON ps.clinic_id = p.clinic_id AND ps.physiotherapist_id = p.id AND ps.active
  JOIN public.clinic_services service
    ON service.id = ps.clinic_service_id
   AND service.clinic_id = ps.clinic_id AND service.active
  WHERE p.clinic_id = _clinic_id
    AND p.status = 'APPROVED'
    AND (public.is_clinic_member(_clinic_id) OR public.is_admin(auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.physiotherapist_location_working_hours wh
      WHERE wh.clinic_id = p.clinic_id
        AND wh.location_id = pl.clinic_location_id
        AND wh.physiotherapist_id = p.id
        AND wh.active
    );
$$;

CREATE OR REPLACE FUNCTION public.clinic_available_slots(
  _clinic_id uuid,
  _location_id uuid,
  _physio_id uuid,
  _clinic_service_id uuid,
  _date date,
  _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_row public.clinic_services;
  schedule_row record;
  exception_row record;
  timezone_name text;
  day_start timestamptz;
  day_end timestamptz;
  candidate timestamptz;
  candidate_end timestamptz;
BEGIN
  SELECT s.* INTO service_row
  FROM public.clinic_services s
  WHERE s.id = _clinic_service_id AND s.clinic_id = _clinic_id AND s.active;

  IF service_row.id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.physiotherapist_services ps
    JOIN public.physiotherapists p
      ON p.id = ps.physiotherapist_id AND p.clinic_id = ps.clinic_id
     AND p.status = 'APPROVED'
    JOIN public.clinic_memberships m
      ON m.clinic_id = p.clinic_id AND m.user_id = p.user_id AND m.active
    JOIN public.physiotherapist_locations pl
      ON pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id
     AND pl.clinic_location_id = _location_id AND pl.active
    JOIN public.clinic_locations l
      ON l.id = pl.clinic_location_id AND l.clinic_id = pl.clinic_id AND l.active
    WHERE ps.clinic_id = _clinic_id
      AND ps.physiotherapist_id = _physio_id
      AND ps.clinic_service_id = _clinic_service_id
      AND ps.active
  ) THEN
    RETURN;
  END IF;

  SELECT l.timezone INTO timezone_name
  FROM public.clinic_locations l
  WHERE l.id = _location_id AND l.clinic_id = _clinic_id AND l.active;

  SELECT e.* INTO exception_row
  FROM public.availability_exceptions e
  WHERE e.physiotherapist_id = _physio_id AND e.date = _date;
  IF exception_row.id IS NOT NULL AND exception_row.closed THEN RETURN; END IF;

  SELECT wh.id, wh.start_time, wh.end_time INTO schedule_row
  FROM public.physiotherapist_location_working_hours wh
  WHERE wh.clinic_id = _clinic_id AND wh.location_id = _location_id
    AND wh.physiotherapist_id = _physio_id
    AND wh.day_of_week = extract(dow FROM _date)::smallint AND wh.active
  ORDER BY wh.start_time
  LIMIT 1;

  IF exception_row.id IS NOT NULL AND exception_row.start_time IS NOT NULL THEN
    day_start := (_date + exception_row.start_time) AT TIME ZONE timezone_name;
    day_end := (_date + exception_row.end_time) AT TIME ZONE timezone_name;
  ELSIF schedule_row.id IS NOT NULL THEN
    day_start := (_date + schedule_row.start_time) AT TIME ZONE timezone_name;
    day_end := (_date + schedule_row.end_time) AT TIME ZONE timezone_name;
  ELSE
    RETURN;
  END IF;

  candidate := day_start;
  WHILE candidate + make_interval(mins => service_row.duration_minutes) <= day_end LOOP
    candidate_end := candidate + make_interval(mins => service_row.duration_minutes);
    IF candidate > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.physiotherapist_location_schedule_breaks b
        WHERE b.schedule_id = schedule_row.id
          AND tstzrange(
            (_date + b.start_time) AT TIME ZONE timezone_name,
            (_date + b.end_time) AT TIME ZONE timezone_name
          ) && tstzrange(candidate, candidate_end)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.physiotherapist_id = _physio_id
          AND a.id IS DISTINCT FROM _exclude_appointment_id
          AND a.status IN ('PENDING', 'CONFIRMED')
          AND tstzrange(a.start_at, a.end_at) && tstzrange(candidate, candidate_end)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocked_times b
        WHERE b.physiotherapist_id = _physio_id
          AND tstzrange(b.start_at, b.end_at) && tstzrange(candidate, candidate_end)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.appointment_holds h
        WHERE h.physiotherapist_id = _physio_id AND h.expires_at > now()
          AND tstzrange(h.start_at, h.end_at) && tstzrange(candidate, candidate_end)
      ) THEN
      slot := candidate;
      RETURN NEXT;
    END IF;
    candidate := candidate + interval '15 minutes';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_clinic_appointment(
  _clinic_id uuid, _location_id uuid, _patient_id uuid,
  _physio_id uuid, _clinic_service_id uuid, _start_at timestamptz,
  _notes text DEFAULT NULL, _source text DEFAULT 'MANUAL'
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient public.clinic_patients;
  service_row public.clinic_services;
  legacy_id uuid;
  result public.appointments;
  timezone_name text;
BEGIN
  IF NOT public.can_operate_clinic_appointment(_clinic_id, _physio_id) THEN
    RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED';
  END IF;
  IF _source NOT IN ('RECEPTION', 'PHONE', 'MANUAL') THEN
    RAISE EXCEPTION 'INVALID_APPOINTMENT_SOURCE';
  END IF;

  SELECT * INTO patient FROM public.clinic_patients
  WHERE id = _patient_id AND clinic_id = _clinic_id AND active;
  IF patient.id IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND'; END IF;

  SELECT s.* INTO service_row FROM public.clinic_services s
  WHERE s.id = _clinic_service_id AND s.clinic_id = _clinic_id AND s.active;
  IF service_row.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;

  SELECT l.timezone INTO timezone_name FROM public.clinic_locations l
  WHERE l.id = _location_id AND l.clinic_id = _clinic_id AND l.active;
  IF timezone_name IS NULL THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;

  SELECT lm.legacy_service_id INTO legacy_id
  FROM public.legacy_service_mappings lm
  WHERE lm.clinic_id = _clinic_id
    AND lm.clinic_service_id = _clinic_service_id
    AND lm.source_deleted_at IS NULL
  ORDER BY lm.created_at, lm.legacy_service_id LIMIT 1;

  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_available_slots(
      _clinic_id, _location_id, _physio_id, _clinic_service_id,
      (_start_at AT TIME ZONE timezone_name)::date, NULL
    ) available WHERE available.slot = _start_at
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  BEGIN
    INSERT INTO public.appointments(
      clinic_id, location_id, patient_id, physiotherapist_id, client_id,
      service_id, clinic_service_id, service_name, duration_minutes,
      start_at, end_at, price, currency,
      client_first_name, client_last_name, client_email, client_phone,
      client_message, status, source
    ) VALUES (
      _clinic_id, _location_id, patient.id, _physio_id, patient.client_user_id,
      legacy_id, service_row.id, service_row.name, service_row.duration_minutes,
      _start_at, _start_at + make_interval(mins => service_row.duration_minutes),
      service_row.price, service_row.currency,
      patient.first_name, patient.last_name, patient.email, patient.phone,
      nullif(trim(coalesce(_notes, '')), ''), 'CONFIRMED', _source
    ) RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END;

  INSERT INTO public.appointment_activities(
    clinic_id, appointment_id, actor_user_id, action, metadata
  ) VALUES (
    _clinic_id, result.id, auth.uid(), 'APPOINTMENT_CREATED_MANUALLY',
    jsonb_build_object('source', _source)
  );
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(), 'APPOINTMENT_CREATED_MANUALLY', 'appointment', result.id,
    jsonb_build_object('clinic_id', _clinic_id)
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_bookable_assignments(uuid),
  public.clinic_available_slots(uuid, uuid, uuid, uuid, date, uuid),
  public.create_clinic_appointment(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_clinic_bookable_assignments(uuid),
  public.clinic_available_slots(uuid, uuid, uuid, uuid, date, uuid),
  public.create_clinic_appointment(uuid, uuid, uuid, uuid, uuid, timestamptz, text, text)
  FROM PUBLIC, anon;

