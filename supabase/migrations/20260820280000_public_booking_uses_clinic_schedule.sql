-- Make the location-specific clinic schedule the single source of truth for
-- guest booking. Legacy working_hours remain stored but are no longer used by
-- the public slot engine.

CREATE OR REPLACE FUNCTION public.available_slots(
  _clinic_id uuid,
  _location_id uuid,
  _physio_id uuid,
  _service_id uuid,
  _date date
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ctx record;
  schedule_row record;
  exc record;
  tz text;
  day_start timestamptz;
  day_end timestamptz;
  brk_start timestamptz;
  brk_end timestamptz;
  cur timestamptz;
  cand_end timestamptz;
BEGIN
  SELECT * INTO ctx
  FROM public.resolve_booking_context(_clinic_id, _location_id, _physio_id, _service_id);

  SELECT l.timezone INTO tz
  FROM public.clinic_locations l
  WHERE l.id = _location_id AND l.clinic_id = _clinic_id AND l.active;
  IF tz IS NULL THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;

  SELECT * INTO exc
  FROM public.availability_exceptions e
  WHERE e.physiotherapist_id = _physio_id AND e.date = _date;
  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;

  SELECT s.id, s.start_time, s.end_time INTO schedule_row
  FROM public.physiotherapist_location_working_hours s
  WHERE s.clinic_id = _clinic_id
    AND s.location_id = _location_id
    AND s.physiotherapist_id = _physio_id
    AND s.day_of_week = extract(dow FROM _date)::smallint
    AND s.active
  LIMIT 1;

  IF exc.id IS NOT NULL AND exc.start_time IS NOT NULL THEN
    day_start := (_date + exc.start_time) AT TIME ZONE tz;
    day_end := (_date + exc.end_time) AT TIME ZONE tz;
  ELSIF schedule_row.id IS NOT NULL THEN
    day_start := (_date + schedule_row.start_time) AT TIME ZONE tz;
    day_end := (_date + schedule_row.end_time) AT TIME ZONE tz;
    SELECT (_date + b.start_time) AT TIME ZONE tz,
           (_date + b.end_time) AT TIME ZONE tz
      INTO brk_start, brk_end
    FROM public.physiotherapist_location_schedule_breaks b
    WHERE b.schedule_id = schedule_row.id
    LIMIT 1;
  ELSE
    RETURN;
  END IF;

  cur := day_start;
  WHILE cur + make_interval(mins => ctx.duration_minutes) <= day_end LOOP
    cand_end := cur + make_interval(mins => ctx.duration_minutes);
    IF cur > now()
       AND NOT (
         brk_start IS NOT NULL
         AND tstzrange(cur, cand_end) && tstzrange(brk_start, brk_end)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.appointments a
         WHERE a.physiotherapist_id = _physio_id
           AND a.status IN ('PENDING', 'CONFIRMED')
           AND tstzrange(a.start_at, a.end_at) && tstzrange(cur, cand_end)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.blocked_times b
         WHERE b.physiotherapist_id = _physio_id
           AND tstzrange(b.start_at, b.end_at) && tstzrange(cur, cand_end)
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.appointment_holds h
         WHERE h.physiotherapist_id = _physio_id
           AND h.expires_at > now()
           AND tstzrange(h.start_at, h.end_at) && tstzrange(cur, cand_end)
       )
    THEN
      slot := cur;
      RETURN NEXT;
    END IF;
    cur := cur + interval '15 minutes';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_working_days(
  _clinic_id uuid,
  _location_id uuid,
  _physio_id uuid,
  _service_id uuid
)
RETURNS TABLE(day_of_week smallint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.resolve_booking_context(
    _clinic_id, _location_id, _physio_id, _service_id
  );
  RETURN QUERY
  SELECT DISTINCT s.day_of_week
  FROM public.physiotherapist_location_working_hours s
  WHERE s.clinic_id = _clinic_id
    AND s.location_id = _location_id
    AND s.physiotherapist_id = _physio_id
    AND s.active
  ORDER BY s.day_of_week;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_working_days(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_working_days(uuid,uuid,uuid,uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_physio_schedule(_physio_id uuid)
RETURNS TABLE(
  location_id uuid,
  location_name text,
  day_of_week smallint,
  start_time time,
  end_time time
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.name, s.day_of_week, s.start_time, s.end_time
  FROM public.physiotherapists p
  JOIN public.clinics c ON c.id = p.clinic_id AND c.active
  JOIN public.clinic_memberships m
    ON m.clinic_id = p.clinic_id AND m.user_id = p.user_id AND m.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
  JOIN public.clinic_locations l
    ON l.clinic_id = pl.clinic_id AND l.id = pl.clinic_location_id AND l.active
  JOIN public.physiotherapist_location_working_hours s
    ON s.clinic_id = p.clinic_id
   AND s.location_id = l.id
   AND s.physiotherapist_id = p.id
   AND s.active
  WHERE p.id = _physio_id AND p.status = 'APPROVED'
  ORDER BY l.is_default DESC, l.name, s.day_of_week;
$$;

REVOKE ALL ON FUNCTION public.public_physio_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_physio_schedule(uuid)
  TO anon, authenticated, service_role;
