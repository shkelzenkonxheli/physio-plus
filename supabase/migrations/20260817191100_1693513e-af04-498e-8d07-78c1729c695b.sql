
-- SLUG
CREATE OR REPLACE FUNCTION public.slugify(_input TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(
    lower(translate(_input,
      'ÇçËëÀÁÂÃÄÅàáâãäåÈÉÊËèéêìíîïÌÍÎÏÒÓÔÕÖòóôõöÙÚÛÜùúûüÑñŠšŽž',
      'CcEeAAAAAAaaaaaaEEEEeeeiiiiIIIIOOOOOoooooUUUUuuuuNnSsZz')),
    '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_slug(_base TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base TEXT; candidate TEXT; i INT := 1;
BEGIN
  base := NULLIF(public.slugify(_base), '');
  IF base IS NULL THEN base := 'fizioterapeut'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.physiotherapists WHERE slug = candidate) LOOP
    i := i + 1;
    candidate := base || '-' || i;
  END LOOP;
  RETURN candidate;
END; $$;

-- AVAILABLE SLOTS
CREATE OR REPLACE FUNCTION public.available_slots(_physio_id UUID, _service_id UUID, _date DATE)
RETURNS TABLE (slot TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz CONSTANT TEXT := 'Europe/Pristina';
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
END; $$;

-- BOOK APPOINTMENT (transaction-safe)
CREATE OR REPLACE FUNCTION public.book_appointment(
  _physio_id UUID,
  _service_id UUID,
  _start_at TIMESTAMPTZ,
  _first_name TEXT,
  _last_name TEXT,
  _email TEXT,
  _phone TEXT,
  _message TEXT DEFAULT NULL
) RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    SELECT 1 FROM public.available_slots(_physio_id, _service_id, (_start_at AT TIME ZONE 'Europe/Pristina')::date) s
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
END; $$;

-- HOLD SLOT
CREATE OR REPLACE FUNCTION public.hold_slot(_physio_id UUID, _service_id UUID, _start_at TIMESTAMPTZ, _session_id TEXT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dur INT; exp TIMESTAMPTZ;
BEGIN
  DELETE FROM public.appointment_holds WHERE expires_at < now();
  SELECT duration_minutes INTO dur FROM public.services WHERE id = _service_id AND physiotherapist_id = _physio_id AND active;
  IF dur IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  DELETE FROM public.appointment_holds WHERE session_id = _session_id;
  exp := now() + INTERVAL '5 minutes';
  INSERT INTO public.appointment_holds (physiotherapist_id, service_id, start_at, end_at, session_id, expires_at)
  VALUES (_physio_id, _service_id, _start_at, _start_at + (dur || ' minutes')::INTERVAL, _session_id, exp);
  RETURN exp;
END; $$;

-- STATUS TRANSITIONS + NOTIFICATIONS
CREATE OR REPLACE FUNCTION public.on_appointment_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE title TEXT; msg TEXT;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('CONFIRMED','REJECTED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  IF OLD.status = 'CONFIRMED' AND NEW.status NOT IN ('COMPLETED','CANCELLED','NO_SHOW') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION';
  END IF;
  IF OLD.status IN ('REJECTED','CANCELLED','COMPLETED','NO_SHOW') THEN
    RAISE EXCEPTION 'BOOKING_ALREADY_CANCELLED';
  END IF;

  CASE NEW.status
    WHEN 'CONFIRMED' THEN title := 'Termini u konfirmua'; msg := 'Termini juaj për ' || NEW.service_name || ' u konfirmua.';
    WHEN 'REJECTED' THEN title := 'Termini u refuzua'; msg := 'Fatkeqësisht termini juaj për ' || NEW.service_name || ' u refuzua.';
    WHEN 'CANCELLED' THEN title := 'Termini u anulua'; msg := 'Termini juaj për ' || NEW.service_name || ' u anulua.';
    WHEN 'COMPLETED' THEN title := 'Termini u përfundua'; msg := 'Faleminderit! Mund të lini një vlerësim për ' || NEW.service_name || '.';
    ELSE title := NULL;
  END CASE;

  IF title IS NOT NULL AND NEW.client_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, link)
    VALUES (NEW.client_id, 'APPOINTMENT_' || NEW.status::text, title, msg, '/llogaria/terminet');
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'APPOINTMENT_' || NEW.status::text, 'appointment', NEW.id);

  RETURN NEW;
END; $$;
CREATE TRIGGER trg_appt_status BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.on_appointment_status_change();

-- REVIEW SECURITY
CREATE OR REPLACE FUNCTION public.check_review_allowed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD;
BEGIN
  SELECT * INTO a FROM public.appointments WHERE id = NEW.appointment_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;
  IF a.client_id IS NULL OR a.client_id <> auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF a.status <> 'COMPLETED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_COMPLETED'; END IF;
  NEW.client_id := a.client_id;
  NEW.physiotherapist_id := a.physiotherapist_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_review_check BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.check_review_allowed();

CREATE POLICY "rev_insert_own" ON public.reviews FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());

-- lock down function execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_physio_rating() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_appointment_status_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_review_allowed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_service_category_owner() FROM PUBLIC;
