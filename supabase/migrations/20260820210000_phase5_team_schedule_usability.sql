-- Phase 5 usability hardening: complete team roster and editable weekly schedules.

CREATE OR REPLACE FUNCTION public.get_clinic_team_members(_clinic_id uuid)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  role public.clinic_role,
  active boolean,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  physiotherapist_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.role, m.active,
         p.email, p.first_name, p.last_name, p.avatar_url,
         physio.id
  FROM public.clinic_memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN public.physiotherapists physio
    ON physio.user_id = m.user_id AND physio.clinic_id = m.clinic_id
  WHERE m.clinic_id = _clinic_id
    AND (public.is_clinic_member(_clinic_id) OR public.is_admin(auth.uid()))
  ORDER BY m.active DESC, p.first_name NULLS LAST, p.email;
$$;

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
DECLARE
  schedule_id uuid;
BEGIN
  IF NOT (public.is_clinic_admin(_clinic_id) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;
  IF _day_of_week NOT BETWEEN 0 AND 6 THEN
    RAISE EXCEPTION 'INVALID_DAY_OF_WEEK';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.physiotherapist_locations pl
    WHERE pl.clinic_id = _clinic_id AND pl.clinic_location_id = _location_id
      AND pl.physiotherapist_id = _physiotherapist_id AND pl.active
  ) THEN
    RAISE EXCEPTION 'ACTIVE_LOCATION_ASSIGNMENT_REQUIRED';
  END IF;

  DELETE FROM public.physiotherapist_location_working_hours
  WHERE clinic_id = _clinic_id AND location_id = _location_id
    AND physiotherapist_id = _physiotherapist_id AND day_of_week = _day_of_week;

  IF NOT _enabled THEN
    RETURN NULL;
  END IF;
  IF _start_time IS NULL OR _end_time IS NULL OR _start_time >= _end_time THEN
    RAISE EXCEPTION 'INVALID_WORKING_HOURS';
  END IF;
  IF (_break_start IS NULL) <> (_break_end IS NULL)
     OR (_break_start IS NOT NULL AND (
       _break_start >= _break_end OR _break_start <= _start_time OR _break_end >= _end_time
     )) THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_BREAK';
  END IF;

  INSERT INTO public.physiotherapist_location_working_hours(
    clinic_id, location_id, physiotherapist_id, day_of_week,
    start_time, end_time, active, source
  ) VALUES (
    _clinic_id, _location_id, _physiotherapist_id, _day_of_week,
    _start_time, _end_time, true, 'MANUAL'
  ) RETURNING id INTO schedule_id;

  IF _break_start IS NOT NULL THEN
    INSERT INTO public.physiotherapist_location_schedule_breaks(schedule_id,start_time,end_time)
    VALUES(schedule_id,_break_start,_break_end);
  END IF;
  RETURN schedule_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_team_members(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_clinic_staff_schedule(uuid,uuid,uuid,integer,boolean,time,time,time,time) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_clinic_team_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_clinic_staff_schedule(uuid,uuid,uuid,integer,boolean,time,time,time,time) FROM PUBLIC, anon;
