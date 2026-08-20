-- Phase 5 steps 1-4: controlled clinic appointments, rescheduling and patient CRUD.

ALTER TABLE public.clinic_patients
  DROP CONSTRAINT IF EXISTS clinic_patients_contact_required;
ALTER TABLE public.clinic_patients
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS administrative_note text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PUBLIC_BOOKING',
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;

UPDATE public.appointments a
SET patient_id = cp.id
FROM public.clinic_patients cp
WHERE cp.clinic_id = a.clinic_id
  AND cp.patient_key = public.appointment_patient_key(a.client_id, a.client_email, a.client_phone)
  AND a.patient_id IS NULL;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_patient_clinic_fkey
    FOREIGN KEY (patient_id, clinic_id)
    REFERENCES public.clinic_patients(id, clinic_id) ON DELETE RESTRICT,
  ADD CONSTRAINT appointments_source_valid
    CHECK (source IN ('PUBLIC_BOOKING','RECEPTION','PHONE','MANUAL'));
CREATE INDEX appointments_patient_start_idx ON public.appointments(patient_id, start_at DESC);

CREATE TABLE public.appointment_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX appointment_activities_appointment_idx
  ON public.appointment_activities(appointment_id, created_at DESC);
ALTER TABLE public.appointment_activities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.appointment_activities TO authenticated;
GRANT ALL ON public.appointment_activities TO service_role;
CREATE POLICY appointment_activities_select ON public.appointment_activities
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.can_operate_clinic_appointment(
  target_clinic_id uuid, target_physio_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.clinic_memberships m
    WHERE m.clinic_id = target_clinic_id AND m.user_id = auth.uid() AND m.active
      AND (
        m.role IN ('CLINIC_ADMIN','RECEPTIONIST')
        OR (m.role = 'PHYSIOTHERAPIST' AND target_physio_id = public.current_physio_id())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.create_clinic_patient(
  _clinic_id uuid, _first_name text, _last_name text,
  _phone text DEFAULT NULL, _email text DEFAULT NULL,
  _date_of_birth date DEFAULT NULL, _administrative_note text DEFAULT NULL
)
RETURNS public.clinic_patients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.clinic_patients; normalized_email text; normalized_phone text; key text;
BEGIN
  IF NOT public.can_operate_clinic_appointment(_clinic_id, NULL) THEN
    RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED';
  END IF;
  IF length(trim(coalesce(_first_name,''))) < 2 OR length(trim(coalesce(_last_name,''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_PATIENT_NAME';
  END IF;
  normalized_email := lower(trim(coalesce(_email,'')));
  normalized_phone := regexp_replace(trim(coalesce(_phone,'')), '[^0-9+]', '', 'g');
  IF normalized_email <> '' AND normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  key := CASE WHEN normalized_email <> '' THEN 'email:' || normalized_email
              WHEN normalized_phone <> '' THEN 'phone:' || normalized_phone
              ELSE 'manual:' || gen_random_uuid()::text END;
  INSERT INTO public.clinic_patients(
    clinic_id, patient_key, first_name, last_name, phone, email,
    date_of_birth, administrative_note
  ) VALUES (
    _clinic_id, key, trim(_first_name), trim(_last_name), normalized_phone, normalized_email,
    _date_of_birth, nullif(trim(coalesce(_administrative_note,'')), '')
  ) RETURNING * INTO result;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'PATIENT_CREATED','clinic_patient',result.id,jsonb_build_object('clinic_id',_clinic_id));
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'POTENTIAL_DUPLICATE_PATIENT';
END;
$$;

CREATE OR REPLACE FUNCTION public.update_clinic_patient(
  _patient_id uuid, _first_name text, _last_name text,
  _phone text DEFAULT NULL, _email text DEFAULT NULL,
  _date_of_birth date DEFAULT NULL, _administrative_note text DEFAULT NULL,
  _active boolean DEFAULT true
)
RETURNS public.clinic_patients
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.clinic_patients; target_clinic uuid; normalized_email text; normalized_phone text;
BEGIN
  SELECT clinic_id INTO target_clinic FROM public.clinic_patients WHERE id = _patient_id;
  IF target_clinic IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND'; END IF;
  IF NOT public.can_operate_clinic_appointment(target_clinic, NULL) THEN
    RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED';
  END IF;
  IF length(trim(coalesce(_first_name,''))) < 2 OR length(trim(coalesce(_last_name,''))) < 2 THEN
    RAISE EXCEPTION 'INVALID_PATIENT_NAME';
  END IF;
  normalized_email := lower(trim(coalesce(_email,'')));
  normalized_phone := regexp_replace(trim(coalesce(_phone,'')), '[^0-9+]', '', 'g');
  IF normalized_email <> '' AND normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;
  UPDATE public.clinic_patients SET
    first_name=trim(_first_name), last_name=trim(_last_name), phone=normalized_phone,
    email=normalized_email, date_of_birth=_date_of_birth,
    administrative_note=nullif(trim(coalesce(_administrative_note,'')), ''), active=_active
  WHERE id=_patient_id RETURNING * INTO result;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'PATIENT_UPDATED','clinic_patient',result.id,jsonb_build_object('clinic_id',target_clinic));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.clinic_available_slots(
  _clinic_id uuid, _location_id uuid, _physio_id uuid, _clinic_service_id uuid,
  _date date, _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE legacy_id uuid; ctx record; wh record; exc record; tz text := 'Europe/Belgrade';
  day_start timestamptz; day_end timestamptz; brk_start timestamptz; brk_end timestamptz;
  cur timestamptz; cand_end timestamptz;
BEGIN
  SELECT m.legacy_service_id INTO legacy_id FROM public.legacy_service_mappings m
  WHERE m.clinic_id=_clinic_id AND m.physiotherapist_id=_physio_id
    AND m.clinic_service_id=_clinic_service_id AND m.source_deleted_at IS NULL LIMIT 1;
  IF legacy_id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  SELECT * INTO ctx FROM public.resolve_booking_context(_clinic_id,_location_id,_physio_id,legacy_id);
  SELECT * INTO exc FROM public.availability_exceptions e
    WHERE e.physiotherapist_id=_physio_id AND e.date=_date;
  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;
  SELECT * INTO wh FROM public.working_hours w
    WHERE w.physiotherapist_id=_physio_id
      AND w.day_of_week=extract(dow FROM _date)::smallint AND w.active;
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
  ELSE RETURN; END IF;
  cur := day_start;
  WHILE cur + make_interval(mins=>ctx.duration_minutes) <= day_end LOOP
    cand_end := cur + make_interval(mins=>ctx.duration_minutes);
    IF cur > now()
      AND NOT (brk_start IS NOT NULL AND tstzrange(cur,cand_end) && tstzrange(brk_start,brk_end))
      AND NOT EXISTS (SELECT 1 FROM public.appointments a
        WHERE a.physiotherapist_id=_physio_id AND a.id IS DISTINCT FROM _exclude_appointment_id
          AND a.status IN ('PENDING','CONFIRMED')
          AND tstzrange(a.start_at,a.end_at) && tstzrange(cur,cand_end))
      AND NOT EXISTS (SELECT 1 FROM public.blocked_times b WHERE b.physiotherapist_id=_physio_id
          AND tstzrange(b.start_at,b.end_at) && tstzrange(cur,cand_end))
      AND NOT EXISTS (SELECT 1 FROM public.appointment_holds h WHERE h.physiotherapist_id=_physio_id
          AND h.expires_at>now() AND tstzrange(h.start_at,h.end_at) && tstzrange(cur,cand_end))
    THEN slot:=cur; RETURN NEXT; END IF;
    cur:=cur+interval '15 minutes';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_clinic_appointment(
  _clinic_id uuid, _location_id uuid, _patient_id uuid,
  _physio_id uuid, _clinic_service_id uuid, _start_at timestamptz,
  _notes text DEFAULT NULL, _source text DEFAULT 'MANUAL'
)
RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE patient public.clinic_patients; legacy_id uuid; ctx record; result public.appointments;
BEGIN
  IF NOT public.can_operate_clinic_appointment(_clinic_id,_physio_id) THEN RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED'; END IF;
  IF _source NOT IN ('RECEPTION','PHONE','MANUAL') THEN RAISE EXCEPTION 'INVALID_APPOINTMENT_SOURCE'; END IF;
  SELECT * INTO patient FROM public.clinic_patients WHERE id=_patient_id AND clinic_id=_clinic_id AND active;
  IF patient.id IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND'; END IF;
  SELECT legacy_service_id INTO legacy_id FROM public.legacy_service_mappings
    WHERE clinic_id=_clinic_id AND physiotherapist_id=_physio_id
      AND clinic_service_id=_clinic_service_id AND source_deleted_at IS NULL LIMIT 1;
  SELECT * INTO ctx FROM public.resolve_booking_context(_clinic_id,_location_id,_physio_id,legacy_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.clinic_available_slots(
      _clinic_id,_location_id,_physio_id,_clinic_service_id,
      (_start_at AT TIME ZONE 'Europe/Belgrade')::date,NULL) s WHERE s.slot=_start_at)
  THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;
  BEGIN
    INSERT INTO public.appointments(
      clinic_id,location_id,patient_id,physiotherapist_id,client_id,
      service_id,clinic_service_id,service_name,duration_minutes,start_at,end_at,
      price,currency,client_first_name,client_last_name,client_email,client_phone,
      client_message,status,source
    ) VALUES (
      _clinic_id,_location_id,patient.id,_physio_id,patient.client_user_id,
      legacy_id,_clinic_service_id,ctx.service_name,ctx.duration_minutes,_start_at,
      _start_at+make_interval(mins=>ctx.duration_minutes),ctx.price,ctx.currency,
      patient.first_name,patient.last_name,patient.email,patient.phone,_notes,'CONFIRMED',_source
    ) RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END;
  INSERT INTO public.appointment_activities(clinic_id,appointment_id,actor_user_id,action,metadata)
  VALUES(_clinic_id,result.id,auth.uid(),'APPOINTMENT_CREATED_MANUALLY',jsonb_build_object('source',_source));
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'APPOINTMENT_CREATED_MANUALLY','appointment',result.id,jsonb_build_object('clinic_id',_clinic_id));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_clinic_appointment(
  _appointment_id uuid, _location_id uuid, _physio_id uuid,
  _clinic_service_id uuid, _start_at timestamptz
)
RETURNS public.appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE current_row public.appointments; legacy_id uuid; ctx record; result public.appointments;
  previous jsonb;
BEGIN
  SELECT * INTO current_row FROM public.appointments WHERE id=_appointment_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;
  IF current_row.status NOT IN ('PENDING','CONFIRMED') THEN RAISE EXCEPTION 'INVALID_STATUS_TRANSITION'; END IF;
  IF NOT public.can_operate_clinic_appointment(current_row.clinic_id,_physio_id) THEN RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED'; END IF;
  SELECT legacy_service_id INTO legacy_id FROM public.legacy_service_mappings
    WHERE clinic_id=current_row.clinic_id AND physiotherapist_id=_physio_id
      AND clinic_service_id=_clinic_service_id AND source_deleted_at IS NULL LIMIT 1;
  SELECT * INTO ctx FROM public.resolve_booking_context(current_row.clinic_id,_location_id,_physio_id,legacy_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(_physio_id::text,0));
  IF current_row.physiotherapist_id<>_physio_id THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(current_row.physiotherapist_id::text,0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_available_slots(
      current_row.clinic_id,_location_id,_physio_id,_clinic_service_id,
      (_start_at AT TIME ZONE 'Europe/Belgrade')::date,_appointment_id) s WHERE s.slot=_start_at)
  THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;
  previous:=jsonb_build_object('start_at',current_row.start_at,'end_at',current_row.end_at,
    'location_id',current_row.location_id,'physiotherapist_id',current_row.physiotherapist_id);
  PERFORM set_config('app.allow_appointment_reschedule','on',true);
  BEGIN
    UPDATE public.appointments SET location_id=_location_id,physiotherapist_id=_physio_id,
      service_id=legacy_id,clinic_service_id=_clinic_service_id,service_name=ctx.service_name,
      duration_minutes=ctx.duration_minutes,start_at=_start_at,
      end_at=_start_at+make_interval(mins=>ctx.duration_minutes),price=ctx.price,currency=ctx.currency,
      rescheduled_at=now()
    WHERE id=_appointment_id RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END;
  INSERT INTO public.appointment_activities(clinic_id,appointment_id,actor_user_id,action,metadata)
  VALUES(current_row.clinic_id,result.id,auth.uid(),'APPOINTMENT_RESCHEDULED',
    jsonb_build_object('previous',previous,'new',jsonb_build_object('start_at',result.start_at,
      'end_at',result.end_at,'location_id',result.location_id,'physiotherapist_id',result.physiotherapist_id)));
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'APPOINTMENT_RESCHEDULED','appointment',result.id,jsonb_build_object('clinic_id',current_row.clinic_id));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE is_status_operator boolean;
BEGIN
  IF public.is_admin(auth.uid()) OR current_setting('app.allow_appointment_reschedule',true)='on' THEN
    RETURN NEW;
  END IF;
  IF OLD.client_id=auth.uid() AND OLD.physiotherapist_id IS DISTINCT FROM public.current_physio_id() THEN
    RAISE EXCEPTION 'CLIENT_APPOINTMENT_UPDATE_FORBIDDEN';
  END IF;
  is_status_operator := OLD.physiotherapist_id=public.current_physio_id()
    OR public.is_clinic_appointment_operator(OLD.physiotherapist_id);
  IF is_status_operator AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.physiotherapist_id IS DISTINCT FROM OLD.physiotherapist_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.clinic_service_id IS DISTINCT FROM OLD.clinic_service_id
    OR NEW.service_name IS DISTINCT FROM OLD.service_name OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at
    OR NEW.price IS DISTINCT FROM OLD.price OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.client_first_name IS DISTINCT FROM OLD.client_first_name OR NEW.client_last_name IS DISTINCT FROM OLD.client_last_name
    OR NEW.client_email IS DISTINCT FROM OLD.client_email OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
    OR NEW.client_message IS DISTINCT FROM OLD.client_message OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'PROTECTED_APPOINTMENT_FIELDS'; END IF;
  RETURN NEW;
END;
$$;

-- Server workflows own all patient mutations.
REVOKE INSERT, UPDATE, DELETE ON public.clinic_patients FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_clinic_patient(uuid,text,text,text,text,date,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_clinic_patient(uuid,text,text,text,text,date,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clinic_available_slots(uuid,uuid,uuid,uuid,date,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_clinic_appointment(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_clinic_appointment(uuid,uuid,uuid,uuid,timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.can_operate_clinic_appointment(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_clinic_patient(uuid,text,text,text,text,date,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_clinic_patient(uuid,text,text,text,text,date,text,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clinic_available_slots(uuid,uuid,uuid,uuid,date,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_clinic_appointment(uuid,uuid,uuid,uuid,uuid,timestamptz,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reschedule_clinic_appointment(uuid,uuid,uuid,uuid,timestamptz) FROM PUBLIC, anon;

COMMENT ON FUNCTION public.reschedule_clinic_appointment(uuid,uuid,uuid,uuid,timestamptz) IS
  'Controlled reschedule that revalidates tenant context, locks the physio and excludes only the current appointment.';
