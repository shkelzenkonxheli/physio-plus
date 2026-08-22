-- Central clinic catalog booking. Reuses clinic_services,
-- physiotherapist_services, location schedules, holds and appointments.

ALTER TABLE public.clinic_services
  ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clinic_services.public_visible IS
  'Controls guest/public booking visibility independently from operational active state.';

DROP POLICY IF EXISTS cs_public_read ON public.clinic_services;
CREATE POLICY cs_public_read ON public.clinic_services
  FOR SELECT TO anon, authenticated
  USING (
    active AND public_visible
    AND EXISTS (
      SELECT 1 FROM public.clinics c
      WHERE c.id = clinic_id AND c.active
    )
  );

CREATE OR REPLACE FUNCTION public.set_clinic_service_assignment(
  _clinic_id uuid, _physio_id uuid, _clinic_service_id uuid, _active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    JOIN public.clinic_memberships m
      ON m.clinic_id=p.clinic_id AND m.user_id=p.user_id AND m.active
    WHERE p.id=_physio_id AND p.clinic_id=_clinic_id AND p.status='APPROVED'
  ) THEN RAISE EXCEPTION 'PRACTITIONER_NOT_AVAILABLE'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_services s
    WHERE s.id=_clinic_service_id AND s.clinic_id=_clinic_id
  ) THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;

  INSERT INTO public.physiotherapist_services(
    clinic_id,physiotherapist_id,clinic_service_id,active
  ) VALUES (_clinic_id,_physio_id,_clinic_service_id,_active)
  ON CONFLICT (clinic_id,physiotherapist_id,clinic_service_id)
  DO UPDATE SET active=excluded.active;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_clinic_service_category(
  _clinic_id uuid, _category_id uuid, _name text,
  _description text, _sort_order integer, _active boolean
)
RETURNS public.clinic_service_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.clinic_service_categories;
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN RAISE EXCEPTION 'INVALID_CATEGORY_NAME'; END IF;
  UPDATE public.clinic_service_categories
  SET name=trim(_name), description=nullif(trim(coalesce(_description,'')),''),
      sort_order=coalesce(_sort_order,0), active=_active
  WHERE id=_category_id AND clinic_id=_clinic_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_clinic_service(
  _clinic_id uuid, _service_id uuid, _category_id uuid, _name text,
  _description text, _price numeric, _currency text,
  _duration_minutes integer, _active boolean, _public_visible boolean
)
RETURNS public.clinic_services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.clinic_services; legacy_id uuid;
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;
  IF length(trim(coalesce(_name,''))) < 2 OR _price < 0
     OR _duration_minutes < 5 OR _duration_minutes > 480
     OR length(trim(coalesce(_currency,''))) <> 3 THEN
    RAISE EXCEPTION 'INVALID_SERVICE';
  END IF;
  IF _category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clinic_service_categories c
    WHERE c.id=_category_id AND c.clinic_id=_clinic_id
  ) THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;

  UPDATE public.clinic_services
  SET category_id=_category_id, name=trim(_name),
      description=nullif(trim(coalesce(_description,'')),''), price=_price,
      currency=upper(trim(_currency)), duration_minutes=_duration_minutes,
      active=_active, public_visible=_public_visible
  WHERE id=_service_id AND clinic_id=_clinic_id
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;

  -- Keep the canonical legacy row used by existing routes/snapshots aligned.
  SELECT m.legacy_service_id INTO legacy_id
  FROM public.legacy_service_mappings m
  WHERE m.clinic_id=_clinic_id AND m.clinic_service_id=_service_id
    AND m.source_deleted_at IS NULL
  ORDER BY m.created_at,m.legacy_service_id LIMIT 1;
  IF legacy_id IS NOT NULL THEN
    UPDATE public.services SET name=result.name,description=result.description,
      price=result.price,currency=result.currency,duration_minutes=result.duration_minutes,
      active=(result.active AND result.public_visible)
    WHERE id=legacy_id;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.public_clinic_booking_catalog(_clinic_id uuid)
RETURNS TABLE(
  category_id uuid, category_name text, category_sort_order integer,
  service_id uuid, service_name text, description text,
  duration_minutes integer, price numeric, currency text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,c.name,c.sort_order,s.id,s.name,s.description,
         s.duration_minutes,s.price,s.currency
  FROM public.clinic_services s
  LEFT JOIN public.clinic_service_categories c
    ON c.id=s.category_id AND c.clinic_id=s.clinic_id AND c.active
  WHERE s.clinic_id=_clinic_id AND s.active AND s.public_visible
    AND (s.category_id IS NULL OR c.id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.clinics cl WHERE cl.id=s.clinic_id AND cl.active)
    AND EXISTS (
      SELECT 1
      FROM public.physiotherapist_services ps
      JOIN public.physiotherapists p
        ON p.id=ps.physiotherapist_id AND p.clinic_id=ps.clinic_id AND p.status='APPROVED'
      JOIN public.clinic_memberships m
        ON m.clinic_id=p.clinic_id AND m.user_id=p.user_id AND m.active
      JOIN public.physiotherapist_locations pl
        ON pl.clinic_id=p.clinic_id AND pl.physiotherapist_id=p.id AND pl.active
      JOIN public.clinic_locations l
        ON l.id=pl.clinic_location_id AND l.clinic_id=pl.clinic_id AND l.active
      WHERE ps.clinic_id=s.clinic_id AND ps.clinic_service_id=s.id AND ps.active
        AND EXISTS (
          SELECT 1 FROM public.physiotherapist_location_working_hours wh
          WHERE wh.clinic_id=p.clinic_id AND wh.location_id=l.id
            AND wh.physiotherapist_id=p.id AND wh.active
        )
    )
  ORDER BY coalesce(c.sort_order,2147483647),c.name,s.name,s.id;
$$;

CREATE OR REPLACE FUNCTION public.public_service_practitioners(
  _clinic_id uuid, _clinic_service_id uuid
)
RETURNS TABLE(id uuid,first_name text,last_name text,professional_title text,photo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id,p.first_name,p.last_name,p.professional_title,p.photo_url
  FROM public.physiotherapist_services ps
  JOIN public.clinic_services s
    ON s.id=ps.clinic_service_id AND s.clinic_id=ps.clinic_id
   AND s.active AND s.public_visible
  JOIN public.physiotherapists p
    ON p.id=ps.physiotherapist_id AND p.clinic_id=ps.clinic_id AND p.status='APPROVED'
  JOIN public.clinic_memberships m
    ON m.clinic_id=p.clinic_id AND m.user_id=p.user_id AND m.active
  WHERE ps.clinic_id=_clinic_id AND ps.clinic_service_id=_clinic_service_id AND ps.active
    AND EXISTS (
      SELECT 1 FROM public.physiotherapist_locations pl
      JOIN public.clinic_locations l
        ON l.id=pl.clinic_location_id AND l.clinic_id=pl.clinic_id AND l.active
      WHERE pl.clinic_id=ps.clinic_id AND pl.physiotherapist_id=p.id AND pl.active
    )
  ORDER BY p.first_name,p.last_name,p.id;
$$;

CREATE OR REPLACE FUNCTION public.public_service_locations(
  _clinic_id uuid, _clinic_service_id uuid, _physio_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid,name text,address text,timezone text,is_default boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT l.id,l.name,l.address,l.timezone,l.is_default
  FROM public.physiotherapist_services ps
  JOIN public.physiotherapists p
    ON p.id=ps.physiotherapist_id AND p.clinic_id=ps.clinic_id AND p.status='APPROVED'
  JOIN public.clinic_memberships m
    ON m.clinic_id=p.clinic_id AND m.user_id=p.user_id AND m.active
  JOIN public.physiotherapist_locations pl
    ON pl.clinic_id=p.clinic_id AND pl.physiotherapist_id=p.id AND pl.active
  JOIN public.clinic_locations l
    ON l.id=pl.clinic_location_id AND l.clinic_id=pl.clinic_id AND l.active
  JOIN public.clinic_services s
    ON s.id=ps.clinic_service_id AND s.clinic_id=ps.clinic_id
   AND s.active AND s.public_visible
  WHERE ps.clinic_id=_clinic_id AND ps.clinic_service_id=_clinic_service_id AND ps.active
    AND (_physio_id IS NULL OR p.id=_physio_id)
    AND EXISTS (
      SELECT 1 FROM public.physiotherapist_location_working_hours wh
      WHERE wh.clinic_id=p.clinic_id AND wh.location_id=l.id
        AND wh.physiotherapist_id=p.id AND wh.active
    )
  ORDER BY l.is_default DESC,l.name,l.id;
$$;

CREATE OR REPLACE FUNCTION public.practitioner_service_available_slots(
  _clinic_id uuid, _location_id uuid, _physio_id uuid,
  _clinic_service_id uuid, _date date
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE service_row public.clinic_services; schedule_row record; exc record; tz text;
  day_start timestamptz; day_end timestamptz; cur timestamptz; cand_end timestamptz;
BEGIN
  SELECT s.* INTO service_row FROM public.clinic_services s
  WHERE s.id=_clinic_service_id AND s.clinic_id=_clinic_id AND s.active AND s.public_visible;
  IF service_row.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.physiotherapist_services ps
    JOIN public.physiotherapists p ON p.id=ps.physiotherapist_id AND p.clinic_id=ps.clinic_id AND p.status='APPROVED'
    JOIN public.clinic_memberships m ON m.clinic_id=p.clinic_id AND m.user_id=p.user_id AND m.active
    JOIN public.physiotherapist_locations pl ON pl.clinic_id=p.clinic_id AND pl.physiotherapist_id=p.id AND pl.clinic_location_id=_location_id AND pl.active
    JOIN public.clinic_locations l ON l.id=pl.clinic_location_id AND l.clinic_id=pl.clinic_id AND l.active
    WHERE ps.clinic_id=_clinic_id AND ps.physiotherapist_id=_physio_id
      AND ps.clinic_service_id=_clinic_service_id AND ps.active
  ) THEN RETURN; END IF;
  SELECT l.timezone INTO tz FROM public.clinic_locations l
  WHERE l.id=_location_id AND l.clinic_id=_clinic_id AND l.active;
  SELECT * INTO exc FROM public.availability_exceptions e
  WHERE e.physiotherapist_id=_physio_id AND e.date=_date;
  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;
  SELECT s.id,s.start_time,s.end_time INTO schedule_row
  FROM public.physiotherapist_location_working_hours s
  WHERE s.clinic_id=_clinic_id AND s.location_id=_location_id
    AND s.physiotherapist_id=_physio_id
    AND s.day_of_week=extract(dow FROM _date)::smallint AND s.active LIMIT 1;
  IF exc.id IS NOT NULL AND exc.start_time IS NOT NULL THEN
    day_start:=(_date+exc.start_time) AT TIME ZONE tz;
    day_end:=(_date+exc.end_time) AT TIME ZONE tz;
  ELSIF schedule_row.id IS NOT NULL THEN
    day_start:=(_date+schedule_row.start_time) AT TIME ZONE tz;
    day_end:=(_date+schedule_row.end_time) AT TIME ZONE tz;
  ELSE RETURN; END IF;
  cur:=day_start;
  WHILE cur+make_interval(mins=>service_row.duration_minutes)<=day_end LOOP
    cand_end:=cur+make_interval(mins=>service_row.duration_minutes);
    IF cur>now()
      AND NOT EXISTS (SELECT 1 FROM public.physiotherapist_location_schedule_breaks b
        WHERE b.schedule_id=schedule_row.id
          AND tstzrange((_date+b.start_time) AT TIME ZONE tz,(_date+b.end_time) AT TIME ZONE tz) && tstzrange(cur,cand_end))
      AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.physiotherapist_id=_physio_id
        AND a.status IN ('PENDING','CONFIRMED') AND tstzrange(a.start_at,a.end_at) && tstzrange(cur,cand_end))
      AND NOT EXISTS (SELECT 1 FROM public.blocked_times b WHERE b.physiotherapist_id=_physio_id
        AND tstzrange(b.start_at,b.end_at) && tstzrange(cur,cand_end))
      AND NOT EXISTS (SELECT 1 FROM public.appointment_holds h WHERE h.physiotherapist_id=_physio_id
        AND h.expires_at>now() AND tstzrange(h.start_at,h.end_at) && tstzrange(cur,cand_end))
    THEN slot:=cur; RETURN NEXT; END IF;
    cur:=cur+interval '15 minutes';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.clinic_service_available_slots(
  _clinic_id uuid, _location_id uuid, _clinic_service_id uuid,
  _date date, _physio_id uuid DEFAULT NULL
)
RETURNS TABLE(slot timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT available.slot
  FROM public.public_service_practitioners(_clinic_id,_clinic_service_id) p
  CROSS JOIN LATERAL public.practitioner_service_available_slots(
    _clinic_id,_location_id,p.id,_clinic_service_id,_date
  ) available
  WHERE _physio_id IS NULL OR p.id=_physio_id
  ORDER BY available.slot;
$$;

CREATE OR REPLACE FUNCTION public.clinic_service_working_days(
  _clinic_id uuid, _location_id uuid, _clinic_service_id uuid,
  _physio_id uuid DEFAULT NULL
)
RETURNS TABLE(day_of_week smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT wh.day_of_week
  FROM public.physiotherapist_location_working_hours wh
  JOIN public.public_service_practitioners(_clinic_id,_clinic_service_id) p ON p.id=wh.physiotherapist_id
  WHERE wh.clinic_id=_clinic_id AND wh.location_id=_location_id AND wh.active
    AND (_physio_id IS NULL OR wh.physiotherapist_id=_physio_id)
  ORDER BY wh.day_of_week;
$$;

CREATE OR REPLACE FUNCTION public.book_clinic_service_appointment(
  _clinic_id uuid, _location_id uuid, _clinic_service_id uuid,
  _physio_id uuid, _start_at timestamptz, _first_name text, _last_name text,
  _email text, _phone text, _message text DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE service_row public.clinic_services; chosen_physio uuid; legacy_id uuid;
  result public.appointments; patient public.clinic_patients;
  normalized_email text; normalized_phone text; patient_key_value text; owner_user uuid;
BEGIN
  IF length(trim(coalesce(_first_name,'')))<2 OR length(trim(coalesce(_last_name,'')))<2
    OR coalesce(_email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR length(trim(coalesce(_phone,'')))<6 OR _start_at<=now() THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  SELECT s.* INTO service_row FROM public.clinic_services s
  JOIN public.clinics c ON c.id=s.clinic_id AND c.active
  WHERE s.id=_clinic_service_id AND s.clinic_id=_clinic_id AND s.active AND s.public_visible;
  IF service_row.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clinic_locations l
    WHERE l.id=_location_id AND l.clinic_id=_clinic_id AND l.active) THEN
    RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE';
  END IF;

  -- One lock serializes competing Any Available requests for this exact context.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    _clinic_id::text||':'||_location_id::text||':'||_clinic_service_id::text||':'||_start_at::text,0));
  SELECT p.id INTO chosen_physio
  FROM public.public_service_practitioners(_clinic_id,_clinic_service_id) p
  WHERE (_physio_id IS NULL OR p.id=_physio_id)
    AND EXISTS (SELECT 1 FROM public.practitioner_service_available_slots(
      _clinic_id,_location_id,p.id,_clinic_service_id,
      (_start_at AT TIME ZONE (SELECT timezone FROM public.clinic_locations WHERE id=_location_id))::date
    ) a WHERE a.slot=_start_at)
  ORDER BY p.id LIMIT 1;
  IF chosen_physio IS NULL THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(chosen_physio::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.practitioner_service_available_slots(
    _clinic_id,_location_id,chosen_physio,_clinic_service_id,
    (_start_at AT TIME ZONE (SELECT timezone FROM public.clinic_locations WHERE id=_location_id))::date
  ) a WHERE a.slot=_start_at) THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END IF;

  SELECT m.legacy_service_id INTO legacy_id FROM public.legacy_service_mappings m
  WHERE m.clinic_id=_clinic_id AND m.clinic_service_id=_clinic_service_id
    AND m.source_deleted_at IS NULL ORDER BY m.created_at,m.legacy_service_id LIMIT 1;
  IF legacy_id IS NULL THEN RAISE EXCEPTION 'SERVICE_LEGACY_COMPATIBILITY_MISSING'; END IF;

  normalized_email:=lower(trim(_email));
  normalized_phone:=regexp_replace(trim(_phone),'[^0-9+]','','g');
  patient_key_value:='email:'||normalized_email;
  INSERT INTO public.clinic_patients(
    clinic_id,client_user_id,patient_key,first_name,last_name,email,phone
  ) VALUES (
    _clinic_id,auth.uid(),patient_key_value,trim(_first_name),trim(_last_name),normalized_email,normalized_phone
  ) ON CONFLICT (clinic_id,patient_key) DO UPDATE SET
    first_name=excluded.first_name,last_name=excluded.last_name,
    phone=excluded.phone,client_user_id=coalesce(public.clinic_patients.client_user_id,excluded.client_user_id),active=true
  RETURNING * INTO patient;

  BEGIN
    INSERT INTO public.appointments(
      clinic_id,location_id,patient_id,physiotherapist_id,client_id,
      service_id,clinic_service_id,service_name,duration_minutes,
      client_first_name,client_last_name,client_email,client_phone,
      start_at,end_at,price,currency,status,client_message,source
    ) VALUES (
      _clinic_id,_location_id,patient.id,chosen_physio,auth.uid(),legacy_id,
      service_row.id,service_row.name,service_row.duration_minutes,
      trim(_first_name),trim(_last_name),normalized_email,normalized_phone,
      _start_at,_start_at+make_interval(mins=>service_row.duration_minutes),
      service_row.price,service_row.currency,'PENDING',
      nullif(trim(coalesce(_message,'')),''),'PUBLIC_BOOKING'
    ) RETURNING * INTO result;
  EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'SLOT_UNAVAILABLE'; END;
  DELETE FROM public.appointment_holds
  WHERE physiotherapist_id=chosen_physio AND start_at=_start_at;
  SELECT user_id INTO owner_user FROM public.physiotherapists WHERE id=chosen_physio;
  INSERT INTO public.notifications(user_id,type,title,message,link)
  VALUES(owner_user,'BOOKING_CREATED','Kërkesë e re për termin',
    result.client_first_name||' '||result.client_last_name||' kërkoi termin për '||service_row.name||'.',
    '/paneli#appointments');
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'APPOINTMENT_CREATED','appointment',result.id,
    jsonb_build_object('clinic_id',_clinic_id,'any_available',_physio_id IS NULL));
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_clinic_service_assignment(uuid,uuid,uuid,boolean),
  public.update_my_clinic_service_category(uuid,uuid,text,text,integer,boolean),
  public.update_my_clinic_service(uuid,uuid,uuid,text,text,numeric,text,integer,boolean,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_clinic_service_assignment(uuid,uuid,uuid,boolean),
  public.update_my_clinic_service_category(uuid,uuid,text,text,integer,boolean),
  public.update_my_clinic_service(uuid,uuid,uuid,text,text,numeric,text,integer,boolean,boolean)
  TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.public_clinic_booking_catalog(uuid),
  public.public_service_practitioners(uuid,uuid),
  public.public_service_locations(uuid,uuid,uuid),
  public.practitioner_service_available_slots(uuid,uuid,uuid,uuid,date),
  public.clinic_service_available_slots(uuid,uuid,uuid,date,uuid),
  public.clinic_service_working_days(uuid,uuid,uuid,uuid),
  public.book_clinic_service_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_clinic_booking_catalog(uuid),
  public.public_service_practitioners(uuid,uuid),
  public.public_service_locations(uuid,uuid,uuid),
  public.clinic_service_available_slots(uuid,uuid,uuid,date,uuid),
  public.clinic_service_working_days(uuid,uuid,uuid,uuid),
  public.book_clinic_service_appointment(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text)
  TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.practitioner_service_available_slots(uuid,uuid,uuid,uuid,date)
  TO service_role;
