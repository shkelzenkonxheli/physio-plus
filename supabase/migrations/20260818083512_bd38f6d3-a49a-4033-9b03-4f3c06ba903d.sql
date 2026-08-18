CREATE OR REPLACE FUNCTION public.available_slots(_physio_id uuid, _service_id uuid, _date date)
 RETURNS TABLE(slot timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tz CONSTANT TEXT := 'Europe/Belgrade';
  dur INT;
  wh RECORD;
  exc RECORD;
  day_start TIMESTAMPTZ;
  day_end TIMESTAMPTZ;
  brk_start TIMESTAMPTZ;
  brk_end TIMESTAMPTZ;
  cur TIMESTAMPTZ;
  step INTERVAL := INTERVAL '15 minutes';
  cand_end TIMESTAMPTZ;
BEGIN
  SELECT s.duration_minutes INTO dur FROM public.services s
    WHERE s.id = _service_id AND s.physiotherapist_id = _physio_id AND s.active;
  IF dur IS NULL THEN RETURN; END IF;

  SELECT * INTO exc FROM public.availability_exceptions e
    WHERE e.physiotherapist_id = _physio_id AND e.date = _date;

  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;

  SELECT * INTO wh FROM public.working_hours w
    WHERE w.physiotherapist_id = _physio_id
      AND w.day_of_week = EXTRACT(DOW FROM _date)::SMALLINT
      AND w.active;

  IF exc.id IS NOT NULL AND exc.start_time IS NOT NULL THEN
    day_start := (_date + exc.start_time) AT TIME ZONE tz;
    day_end := (_date + exc.end_time) AT TIME ZONE tz;
  ELSIF wh.id IS NOT NULL THEN
    day_start := (_date + wh.start_time) AT TIME ZONE tz;
    day_end := (_date + wh.end_time) AT TIME ZONE tz;
    IF wh.break_start IS NOT NULL AND wh.break_end IS NOT NULL THEN
      brk_start := (_date + wh.break_start) AT TIME ZONE tz;
      brk_end := (_date + wh.break_end) AT TIME ZONE tz;
    END IF;
  ELSE
    RETURN;
  END IF;

  cur := day_start;
  WHILE cur + (dur || ' minutes')::INTERVAL <= day_end LOOP
    cand_end := cur + (dur || ' minutes')::INTERVAL;
    IF cur > now()
       AND NOT (brk_start IS NOT NULL AND tstzrange(cur, cand_end) && tstzrange(brk_start, brk_end))
       AND NOT EXISTS (SELECT 1 FROM public.appointments a
            WHERE a.physiotherapist_id = _physio_id
              AND a.status IN ('PENDING','CONFIRMED')
              AND tstzrange(a.start_at, a.end_at) && tstzrange(cur, cand_end))
       AND NOT EXISTS (SELECT 1 FROM public.blocked_times b
            WHERE b.physiotherapist_id = _physio_id
              AND tstzrange(b.start_at, b.end_at) && tstzrange(cur, cand_end))
       AND NOT EXISTS (SELECT 1 FROM public.appointment_holds h
            WHERE h.physiotherapist_id = _physio_id
              AND h.expires_at > now()
              AND tstzrange(h.start_at, h.end_at) && tstzrange(cur, cand_end))
    THEN
      slot := cur;
      RETURN NEXT;
    END IF;
    cur := cur + step;
  END LOOP;
  RETURN;
END; $function$;

CREATE OR REPLACE FUNCTION public.book_appointment(_physio_id uuid, _service_id uuid, _start_at timestamp with time zone, _first_name text, _last_name text, _email text, _phone text, _message text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  svc RECORD;
  physio RECORD;
  new_end TIMESTAMPTZ;
  result public.appointments;
  owner_user UUID;
BEGIN
  IF length(coalesce(_first_name,'')) < 2 OR length(coalesce(_last_name,'')) < 2
     OR coalesce(_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(coalesce(_phone,'')) < 6 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  SELECT * INTO physio FROM public.physiotherapists WHERE id = _physio_id AND status = 'APPROVED';
  IF physio.id IS NULL THEN RAISE EXCEPTION 'PHYSIOTHERAPIST_NOT_FOUND'; END IF;

  SELECT * INTO svc FROM public.services
    WHERE id = _service_id AND physiotherapist_id = _physio_id AND active;
  IF svc.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;

  IF _start_at <= now() THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;

  new_end := _start_at + (svc.duration_minutes || ' minutes')::INTERVAL;

  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.available_slots(_physio_id, _service_id, (_start_at AT TIME ZONE 'Europe/Belgrade')::date) s
    WHERE s.slot = _start_at
  ) THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END IF;

  BEGIN
    INSERT INTO public.appointments (
      physiotherapist_id, client_id, service_id, service_name,
      client_first_name, client_last_name, client_email, client_phone,
      start_at, end_at, price, currency, status, client_message)
    VALUES (_physio_id, auth.uid(), _service_id, svc.name,
      trim(_first_name), trim(_last_name), lower(trim(_email)), trim(_phone),
      _start_at, new_end, svc.price, svc.currency, 'PENDING', NULLIF(trim(coalesce(_message,'')),''))
    RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END;

  DELETE FROM public.appointment_holds h
    WHERE h.physiotherapist_id = _physio_id AND h.start_at = _start_at;

  SELECT user_id INTO owner_user FROM public.physiotherapists WHERE id = _physio_id;
  INSERT INTO public.notifications (user_id, type, title, message, link)
  VALUES (owner_user, 'BOOKING_CREATED', 'Kërkesë e re për termin',
    result.client_first_name || ' ' || result.client_last_name || ' kërkoi termin për ' || svc.name || '.',
    '/paneli/terminet');

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (auth.uid(), 'BOOKING_SENT', 'Kërkesa u dërgua',
      'Termini yt është duke pritur konfirmimin e fizioterapeutit.', '/llogaria/terminet');
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'APPOINTMENT_CREATED', 'appointment', result.id);

  RETURN result;
END; $function$;

REVOKE ALL ON FUNCTION public.available_slots(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid, uuid, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, uuid, timestamptz, text, text, text, text, text) TO anon, authenticated;