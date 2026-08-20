-- Phase 4: tenant/location-aware booking with legacy-compatible RPC wrappers.
-- The legacy service foreign keys and physiotherapist/time overlap rule remain intact.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS clinic_service_id uuid,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.appointment_holds
  ADD COLUMN IF NOT EXISTS clinic_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS clinic_service_id uuid;

-- An approved personal practitioner is an operational tenant. Public listing
-- remains independently disabled until explicitly enabled.
UPDATE public.clinics c
SET active = true, updated_at = now()
WHERE NOT c.active
  AND EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    JOIN public.clinic_memberships m
      ON m.clinic_id = c.id AND m.user_id = p.user_id AND m.active
    WHERE p.clinic_id = c.id AND p.status = 'APPROVED'
  );

-- Compatibility assignment is deterministic only when exactly one active
-- location exists and the physio has no active explicit assignment.
INSERT INTO public.physiotherapist_locations (
  clinic_id, physiotherapist_id, clinic_location_id, active
)
SELECT p.clinic_id, p.id, (array_agg(l.id ORDER BY l.id))[1], true
FROM public.physiotherapists p
JOIN public.clinic_locations l ON l.clinic_id = p.clinic_id AND l.active
WHERE p.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.physiotherapist_locations pl
    WHERE pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
  )
GROUP BY p.clinic_id, p.id
HAVING count(*) = 1
ON CONFLICT (clinic_id, physiotherapist_id, clinic_location_id)
DO UPDATE SET active = true;

UPDATE public.appointments a
SET clinic_id = p.clinic_id
FROM public.physiotherapists p
WHERE p.id = a.physiotherapist_id AND a.clinic_id IS NULL;

UPDATE public.appointments a
SET location_id = (
  SELECT l.id
  FROM public.clinic_locations l
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = l.clinic_id
   AND pl.clinic_location_id = l.id
   AND pl.active
  WHERE l.clinic_id = a.clinic_id
    AND l.active
    AND pl.physiotherapist_id = a.physiotherapist_id
    AND (
      l.is_default
      OR 1 = (
        SELECT count(*)
        FROM public.physiotherapist_locations assigned
        JOIN public.clinic_locations assigned_location
          ON assigned_location.id = assigned.clinic_location_id
         AND assigned_location.clinic_id = assigned.clinic_id
         AND assigned_location.active
        WHERE assigned.clinic_id = a.clinic_id
          AND assigned.physiotherapist_id = a.physiotherapist_id
          AND assigned.active
      )
    )
  ORDER BY l.is_default DESC, l.created_at, l.id
  LIMIT 1
)
WHERE a.location_id IS NULL;

UPDATE public.appointments a
SET clinic_service_id = m.clinic_service_id
FROM public.legacy_service_mappings m
WHERE m.legacy_service_id = a.service_id
  AND m.clinic_id = a.clinic_id
  AND m.source_deleted_at IS NULL
  AND a.clinic_service_id IS NULL;

UPDATE public.appointments
SET duration_minutes = greatest(1, round(extract(epoch FROM (end_at - start_at)) / 60)::integer)
WHERE duration_minutes IS NULL;

UPDATE public.appointment_holds h
SET clinic_id = p.clinic_id
FROM public.physiotherapists p
WHERE p.id = h.physiotherapist_id AND h.clinic_id IS NULL;

UPDATE public.appointment_holds h
SET location_id = (
  SELECT l.id
  FROM public.clinic_locations l
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = l.clinic_id
   AND pl.clinic_location_id = l.id
   AND pl.active
  WHERE l.clinic_id = h.clinic_id
    AND l.active
    AND pl.physiotherapist_id = h.physiotherapist_id
    AND (
      l.is_default
      OR 1 = (
        SELECT count(*)
        FROM public.physiotherapist_locations assigned
        JOIN public.clinic_locations assigned_location
          ON assigned_location.id = assigned.clinic_location_id
         AND assigned_location.clinic_id = assigned.clinic_id
         AND assigned_location.active
        WHERE assigned.clinic_id = h.clinic_id
          AND assigned.physiotherapist_id = h.physiotherapist_id
          AND assigned.active
      )
    )
  ORDER BY l.is_default DESC, l.created_at, l.id
  LIMIT 1
)
WHERE h.location_id IS NULL;

UPDATE public.appointment_holds h
SET clinic_service_id = m.clinic_service_id
FROM public.legacy_service_mappings m
WHERE m.legacy_service_id = h.service_id
  AND m.clinic_id = h.clinic_id
  AND m.source_deleted_at IS NULL
  AND h.clinic_service_id IS NULL;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_clinic_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists(id, clinic_id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_location_clinic_fkey
    FOREIGN KEY (location_id, clinic_id)
    REFERENCES public.clinic_locations(id, clinic_id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_clinic_service_fkey
    FOREIGN KEY (clinic_service_id, clinic_id)
    REFERENCES public.clinic_services(id, clinic_id) ON DELETE SET NULL (clinic_service_id),
  ADD CONSTRAINT appointments_duration_snapshot_valid
    CHECK (duration_minutes IS NULL OR duration_minutes > 0);

ALTER TABLE public.appointment_holds
  ADD CONSTRAINT appointment_holds_clinic_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE,
  ADD CONSTRAINT appointment_holds_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists(id, clinic_id) ON DELETE CASCADE,
  ADD CONSTRAINT appointment_holds_location_clinic_fkey
    FOREIGN KEY (location_id, clinic_id)
    REFERENCES public.clinic_locations(id, clinic_id) ON DELETE CASCADE,
  ADD CONSTRAINT appointment_holds_clinic_service_fkey
    FOREIGN KEY (clinic_service_id, clinic_id)
    REFERENCES public.clinic_services(id, clinic_id) ON DELETE CASCADE;

CREATE INDEX appointments_clinic_start_idx ON public.appointments(clinic_id, start_at);
CREATE INDEX appointments_location_start_idx ON public.appointments(location_id, start_at);
CREATE INDEX appointment_holds_clinic_expiry_idx ON public.appointment_holds(clinic_id, expires_at);
CREATE INDEX appointment_holds_location_expiry_idx ON public.appointment_holds(location_id, expires_at);

CREATE OR REPLACE FUNCTION public.resolve_booking_context(
  _expected_clinic_id uuid,
  _location_id uuid,
  _physio_id uuid,
  _legacy_service_id uuid
)
RETURNS TABLE(
  clinic_id uuid,
  location_id uuid,
  clinic_service_id uuid,
  duration_minutes integer,
  service_name text,
  price numeric,
  currency text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_clinic_id uuid;
  resolved_location_id uuid;
  active_location_count integer;
BEGIN
  SELECT p.clinic_id INTO resolved_clinic_id
  FROM public.physiotherapists p
  JOIN public.clinics c ON c.id = p.clinic_id AND c.active
  JOIN public.clinic_memberships membership
    ON membership.clinic_id = p.clinic_id
   AND membership.user_id = p.user_id
   AND membership.active
  WHERE p.id = _physio_id AND p.status = 'APPROVED';

  IF resolved_clinic_id IS NULL THEN RAISE EXCEPTION 'BOOKING_CLINIC_NOT_OPERATIONAL'; END IF;
  IF _expected_clinic_id IS NOT NULL AND _expected_clinic_id <> resolved_clinic_id THEN
    RAISE EXCEPTION 'BOOKING_CROSS_CLINIC_CONTEXT';
  END IF;

  IF _location_id IS NULL THEN
    SELECT count(*), (array_agg(l.id ORDER BY l.id))[1]
    INTO active_location_count, resolved_location_id
    FROM public.physiotherapist_locations pl
    JOIN public.clinic_locations l
      ON l.id = pl.clinic_location_id
     AND l.clinic_id = pl.clinic_id
     AND l.active
    WHERE pl.clinic_id = resolved_clinic_id
      AND pl.physiotherapist_id = _physio_id
      AND pl.active;
    IF active_location_count = 0 THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;
    IF active_location_count > 1 THEN RAISE EXCEPTION 'LOCATION_REQUIRED'; END IF;
  ELSE
    SELECT l.id INTO resolved_location_id
    FROM public.physiotherapist_locations pl
    JOIN public.clinic_locations l
      ON l.id = pl.clinic_location_id
     AND l.clinic_id = pl.clinic_id
     AND l.active
    WHERE pl.clinic_id = resolved_clinic_id
      AND pl.physiotherapist_id = _physio_id
      AND pl.clinic_location_id = _location_id
      AND pl.active;
    IF resolved_location_id IS NULL THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;
  END IF;

  RETURN QUERY
  SELECT resolved_clinic_id, resolved_location_id, mapping.clinic_service_id,
         legacy.duration_minutes, legacy.name, legacy.price, legacy.currency
  FROM public.services legacy
  JOIN public.legacy_service_mappings mapping
    ON mapping.legacy_service_id = legacy.id
   AND mapping.clinic_id = resolved_clinic_id
   AND mapping.physiotherapist_id = _physio_id
   AND mapping.source_deleted_at IS NULL
  JOIN public.clinic_services clinic_service
    ON clinic_service.id = mapping.clinic_service_id
   AND clinic_service.clinic_id = mapping.clinic_id
   AND clinic_service.active
  JOIN public.physiotherapist_services assignment
    ON assignment.clinic_id = mapping.clinic_id
   AND assignment.physiotherapist_id = _physio_id
   AND assignment.clinic_service_id = mapping.clinic_service_id
   AND assignment.active
  WHERE legacy.id = _legacy_service_id
    AND legacy.physiotherapist_id = _physio_id
    AND legacy.active;

  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_locations(_physio_id uuid, _service_id uuid)
RETURNS TABLE(id uuid, clinic_id uuid, name text, address text, is_default boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.clinic_id, l.name, l.address, l.is_default
  FROM public.physiotherapists p
  JOIN public.clinics c ON c.id = p.clinic_id AND c.active
  JOIN public.clinic_memberships membership
    ON membership.clinic_id = p.clinic_id AND membership.user_id = p.user_id AND membership.active
  JOIN public.legacy_service_mappings mapping
    ON mapping.legacy_service_id = _service_id
   AND mapping.clinic_id = p.clinic_id
   AND mapping.physiotherapist_id = p.id
   AND mapping.source_deleted_at IS NULL
  JOIN public.clinic_services cs
    ON cs.id = mapping.clinic_service_id AND cs.clinic_id = mapping.clinic_id AND cs.active
  JOIN public.physiotherapist_services ps
    ON ps.clinic_id = p.clinic_id AND ps.physiotherapist_id = p.id
   AND ps.clinic_service_id = cs.id AND ps.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id = p.clinic_id AND pl.physiotherapist_id = p.id AND pl.active
  JOIN public.clinic_locations l
    ON l.clinic_id = pl.clinic_id AND l.id = pl.clinic_location_id AND l.active
  JOIN public.services legacy
    ON legacy.id = _service_id AND legacy.physiotherapist_id = p.id AND legacy.active
  WHERE p.id = _physio_id AND p.status = 'APPROVED'
  ORDER BY l.is_default DESC, l.name, l.id;
$$;

CREATE OR REPLACE FUNCTION public.available_slots(
  _clinic_id uuid, _location_id uuid, _physio_id uuid, _service_id uuid, _date date
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz constant text := 'Europe/Belgrade';
  ctx record; wh record; exc record;
  day_start timestamptz; day_end timestamptz;
  brk_start timestamptz; brk_end timestamptz;
  cur timestamptz; cand_end timestamptz;
  step interval := interval '15 minutes';
BEGIN
  SELECT * INTO ctx FROM public.resolve_booking_context(
    _clinic_id, _location_id, _physio_id, _service_id
  );

  SELECT * INTO exc FROM public.availability_exceptions e
  WHERE e.physiotherapist_id = _physio_id AND e.date = _date;
  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;

  SELECT * INTO wh FROM public.working_hours w
  WHERE w.physiotherapist_id = _physio_id
    AND w.day_of_week = extract(dow FROM _date)::smallint AND w.active;

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
  ELSE RETURN;
  END IF;

  cur := day_start;
  WHILE cur + make_interval(mins => ctx.duration_minutes) <= day_end LOOP
    cand_end := cur + make_interval(mins => ctx.duration_minutes);
    IF cur > now()
       AND NOT (brk_start IS NOT NULL AND tstzrange(cur, cand_end) && tstzrange(brk_start, brk_end))
       AND NOT EXISTS (
         SELECT 1 FROM public.appointments a
         WHERE a.physiotherapist_id = _physio_id
           AND a.status IN ('PENDING','CONFIRMED')
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
    THEN slot := cur; RETURN NEXT;
    END IF;
    cur := cur + step;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.available_slots(_physio_id uuid, _service_id uuid, _date date)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ctx record;
BEGIN
  SELECT * INTO ctx FROM public.resolve_booking_context(NULL, NULL, _physio_id, _service_id);
  RETURN QUERY SELECT * FROM public.available_slots(
    ctx.clinic_id, ctx.location_id, _physio_id, _service_id, _date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_slot(
  _clinic_id uuid, _location_id uuid, _physio_id uuid, _service_id uuid,
  _start_at timestamptz, _session_id text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ctx record; expiry timestamptz;
BEGIN
  IF length(trim(coalesce(_session_id, ''))) < 8 THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  SELECT * INTO ctx FROM public.resolve_booking_context(
    _clinic_id, _location_id, _physio_id, _service_id
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text, 0));
  DELETE FROM public.appointment_holds WHERE expires_at < now() OR session_id = _session_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.available_slots(
      ctx.clinic_id, ctx.location_id, _physio_id, _service_id,
      (_start_at AT TIME ZONE 'Europe/Belgrade')::date
    ) available WHERE available.slot = _start_at
  ) THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;
  expiry := now() + interval '5 minutes';
  INSERT INTO public.appointment_holds(
    clinic_id, location_id, physiotherapist_id, service_id, clinic_service_id,
    start_at, end_at, session_id, expires_at
  ) VALUES (
    ctx.clinic_id, ctx.location_id, _physio_id, _service_id, ctx.clinic_service_id,
    _start_at, _start_at + make_interval(mins => ctx.duration_minutes), _session_id, expiry
  );
  RETURN expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_slot(
  _physio_id uuid, _service_id uuid, _start_at timestamptz, _session_id text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ctx record;
BEGIN
  SELECT * INTO ctx FROM public.resolve_booking_context(NULL, NULL, _physio_id, _service_id);
  RETURN public.hold_slot(
    ctx.clinic_id, ctx.location_id, _physio_id, _service_id, _start_at, _session_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.book_appointment(
  _clinic_id uuid, _location_id uuid, _physio_id uuid, _service_id uuid,
  _start_at timestamptz, _first_name text, _last_name text,
  _email text, _phone text, _message text DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ctx record; new_end timestamptz; result public.appointments; owner_user uuid;
BEGIN
  IF length(coalesce(_first_name,'')) < 2 OR length(coalesce(_last_name,'')) < 2
     OR coalesce(_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     OR length(coalesce(_phone,'')) < 6 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  SELECT * INTO ctx FROM public.resolve_booking_context(
    _clinic_id, _location_id, _physio_id, _service_id
  );
  IF _start_at <= now() THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  new_end := _start_at + make_interval(mins => ctx.duration_minutes);
  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.available_slots(
      ctx.clinic_id, ctx.location_id, _physio_id, _service_id,
      (_start_at AT TIME ZONE 'Europe/Belgrade')::date
    ) available WHERE available.slot = _start_at
  ) THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;

  BEGIN
    INSERT INTO public.appointments(
      clinic_id, location_id, physiotherapist_id, client_id,
      service_id, clinic_service_id, service_name, duration_minutes,
      client_first_name, client_last_name, client_email, client_phone,
      start_at, end_at, price, currency, status, client_message
    ) VALUES (
      ctx.clinic_id, ctx.location_id, _physio_id, auth.uid(),
      _service_id, ctx.clinic_service_id, ctx.service_name, ctx.duration_minutes,
      trim(_first_name), trim(_last_name), lower(trim(_email)), trim(_phone),
      _start_at, new_end, ctx.price, ctx.currency, 'PENDING',
      nullif(trim(coalesce(_message,'')), '')
    ) RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE';
  END;

  DELETE FROM public.appointment_holds
  WHERE physiotherapist_id = _physio_id AND start_at = _start_at;
  SELECT user_id INTO owner_user FROM public.physiotherapists WHERE id = _physio_id;
  INSERT INTO public.notifications(user_id,type,title,message,link)
  VALUES(owner_user,'BOOKING_CREATED','Kërkesë e re për termin',
    result.client_first_name || ' ' || result.client_last_name || ' kërkoi termin për ' || ctx.service_name || '.',
    '/paneli#appointments');
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,message,link)
    VALUES(auth.uid(),'BOOKING_SENT','Kërkesa u dërgua',
      'Termini yt është duke pritur konfirmimin e fizioterapeutit.','/llogaria/terminet');
  END IF;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id)
  VALUES(auth.uid(),'APPOINTMENT_CREATED','appointment',result.id);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.book_appointment(
  _physio_id uuid, _service_id uuid, _start_at timestamptz,
  _first_name text, _last_name text, _email text, _phone text,
  _message text DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ctx record;
BEGIN
  SELECT * INTO ctx FROM public.resolve_booking_context(NULL, NULL, _physio_id, _service_id);
  RETURN public.book_appointment(
    ctx.clinic_id, ctx.location_id, _physio_id, _service_id, _start_at,
    _first_name, _last_name, _email, _phone, _message
  );
END;
$$;

-- Tenant columns and snapshots cannot be changed through operational status updates.
CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE is_status_operator boolean;
BEGIN
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF OLD.client_id = auth.uid()
     AND OLD.physiotherapist_id IS DISTINCT FROM public.current_physio_id() THEN
    RAISE EXCEPTION 'CLIENT_APPOINTMENT_UPDATE_FORBIDDEN';
  END IF;
  is_status_operator := OLD.physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_appointment_operator(OLD.physiotherapist_id);
  IF is_status_operator AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.physiotherapist_id IS DISTINCT FROM OLD.physiotherapist_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.clinic_service_id IS DISTINCT FROM OLD.clinic_service_id
    OR NEW.service_name IS DISTINCT FROM OLD.service_name
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at
    OR NEW.price IS DISTINCT FROM OLD.price OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.client_first_name IS DISTINCT FROM OLD.client_first_name
    OR NEW.client_last_name IS DISTINCT FROM OLD.client_last_name
    OR NEW.client_email IS DISTINCT FROM OLD.client_email
    OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
    OR NEW.client_message IS DISTINCT FROM OLD.client_message
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'PROTECTED_APPOINTMENT_FIELDS'; END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS appt_read ON public.appointments;
CREATE POLICY appt_read ON public.appointments FOR SELECT TO authenticated
USING (
  client_id = auth.uid() OR physiotherapist_id = public.current_physio_id()
  OR (clinic_id IS NOT NULL AND public.is_clinic_appointment_operator(physiotherapist_id))
  OR public.is_admin(auth.uid())
);
DROP POLICY IF EXISTS appt_update ON public.appointments;
CREATE POLICY appt_update ON public.appointments FOR UPDATE TO authenticated
USING (
  physiotherapist_id = public.current_physio_id()
  OR (clinic_id IS NOT NULL AND public.is_clinic_appointment_operator(physiotherapist_id))
  OR public.is_admin(auth.uid())
)
WITH CHECK (
  physiotherapist_id = public.current_physio_id()
  OR (clinic_id IS NOT NULL AND public.is_clinic_appointment_operator(physiotherapist_id))
  OR public.is_admin(auth.uid())
);

REVOKE EXECUTE ON FUNCTION public.resolve_booking_context(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.booking_locations(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_locations(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid,uuid,uuid,uuid,date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid,uuid,date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hold_slot(uuid,uuid,uuid,uuid,timestamptz,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hold_slot(uuid,uuid,timestamptz,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid,uuid,timestamptz,text,text,text,text,text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.protect_appointment_update() FROM PUBLIC, anon, authenticated;
