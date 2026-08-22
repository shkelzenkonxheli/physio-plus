-- Every physiotherapist manages their own weekly schedule, regardless of
-- whether their clinic membership role is PHYSIOTHERAPIST or CLINIC_ADMIN.
-- Clinic admins do not receive permission to change another physio's hours.

CREATE OR REPLACE FUNCTION public.save_clinic_staff_schedule(
  _clinic_id uuid,
  _location_id uuid,
  _physiotherapist_id uuid,
  _day_of_week integer,
  _enabled boolean,
  _start_time time DEFAULT NULL,
  _end_time time DEFAULT NULL,
  _break_start time DEFAULT NULL,
  _break_end time DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE schedule_id uuid;
BEGIN
  IF NOT (
    public.is_admin(auth.uid())
    OR (
      public.current_physio_id() = _physiotherapist_id
      AND EXISTS (
        SELECT 1 FROM public.clinic_memberships m
        WHERE m.clinic_id = _clinic_id
          AND m.user_id = auth.uid()
          AND m.active
      )
    )
  ) THEN
    RAISE EXCEPTION 'OWN_SCHEDULE_ONLY';
  END IF;

  IF _day_of_week NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'INVALID_DAY_OF_WEEK';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physiotherapist_locations pl
    WHERE pl.clinic_id = _clinic_id
      AND pl.clinic_location_id = _location_id
      AND pl.physiotherapist_id = _physiotherapist_id
      AND pl.active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_LOCATION_ASSIGNMENT_REQUIRED';
  END IF;

  DELETE FROM public.physiotherapist_location_working_hours
  WHERE clinic_id = _clinic_id
    AND location_id = _location_id
    AND physiotherapist_id = _physiotherapist_id
    AND day_of_week = _day_of_week;

  IF NOT _enabled THEN
    RETURN NULL;
  END IF;

  IF _start_time IS NULL OR _end_time IS NULL OR _start_time >= _end_time THEN
    RAISE EXCEPTION 'INVALID_WORKING_HOURS';
  END IF;

  IF (_break_start IS NULL) <> (_break_end IS NULL)
     OR (_break_start IS NOT NULL AND (
       _break_start >= _break_end
       OR _break_start <= _start_time
       OR _break_end >= _end_time
     )) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_BREAK';
  END IF;

  INSERT INTO public.physiotherapist_location_working_hours(
    clinic_id, location_id, physiotherapist_id, day_of_week,
    start_time, end_time, active, source
  ) VALUES(
    _clinic_id, _location_id, _physiotherapist_id, _day_of_week,
    _start_time, _end_time, true, 'MANUAL'
  ) RETURNING id INTO schedule_id;

  IF _break_start IS NOT NULL THEN
    INSERT INTO public.physiotherapist_location_schedule_breaks(
      schedule_id, start_time, end_time
    ) VALUES(schedule_id, _break_start, _break_end);
  END IF;

  RETURN schedule_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_weekly_schedule(
  _clinic_id uuid,
  _location_id uuid,
  _days jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  own_physio_id uuid := public.current_physio_id();
  day_row jsonb;
BEGIN
  IF own_physio_id IS NULL THEN
    RAISE EXCEPTION 'PHYSIOTHERAPIST_PROFILE_REQUIRED';
  END IF;
  IF jsonb_typeof(_days) <> 'array' OR jsonb_array_length(_days) <> 7 THEN
    RAISE EXCEPTION 'SEVEN_SCHEDULE_DAYS_REQUIRED';
  END IF;

  FOR day_row IN SELECT value FROM jsonb_array_elements(_days)
  LOOP
    PERFORM public.save_clinic_staff_schedule(
      _clinic_id,
      _location_id,
      own_physio_id,
      (day_row->>'day_of_week')::integer,
      (day_row->>'enabled')::boolean,
      NULLIF(day_row->>'start_time', '')::time,
      NULLIF(day_row->>'end_time', '')::time,
      NULLIF(day_row->>'break_start', '')::time,
      NULLIF(day_row->>'break_end', '')::time
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS plwh_write ON public.physiotherapist_location_working_hours;
CREATE POLICY plwh_write ON public.physiotherapist_location_working_hours
  FOR ALL TO authenticated
  USING (
    physiotherapist_id = public.current_physio_id()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    physiotherapist_id = public.current_physio_id()
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS schedule_break_write ON public.physiotherapist_location_schedule_breaks;
CREATE POLICY schedule_break_write ON public.physiotherapist_location_schedule_breaks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.physiotherapist_location_working_hours s
      WHERE s.id = schedule_id
        AND (
          s.physiotherapist_id = public.current_physio_id()
          OR public.is_admin(auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physiotherapist_location_working_hours s
      WHERE s.id = schedule_id
        AND (
          s.physiotherapist_id = public.current_physio_id()
          OR public.is_admin(auth.uid())
        )
    )
  );

GRANT EXECUTE ON FUNCTION public.save_my_weekly_schedule(uuid,uuid,jsonb)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_my_weekly_schedule(uuid,uuid,jsonb)
  FROM PUBLIC, anon;
