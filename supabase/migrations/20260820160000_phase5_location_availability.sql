-- Phase 5 step 8: prefer verified location schedules while retaining legacy fallback.
CREATE OR REPLACE FUNCTION public.clinic_available_slots(
  _clinic_id uuid, _location_id uuid, _physio_id uuid, _clinic_service_id uuid,
  _date date, _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE(slot timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE legacy_id uuid; ctx record; exc record; schedule_row record; tz text;
  day_start timestamptz;day_end timestamptz;cur timestamptz;cand_end timestamptz;
BEGIN
  SELECT timezone INTO tz FROM public.clinic_locations WHERE id=_location_id AND clinic_id=_clinic_id AND active;
  IF tz IS NULL THEN RAISE EXCEPTION 'BOOKING_LOCATION_NOT_AVAILABLE'; END IF;
  SELECT m.legacy_service_id INTO legacy_id FROM public.legacy_service_mappings m
  WHERE m.clinic_id=_clinic_id AND m.physiotherapist_id=_physio_id
    AND m.clinic_service_id=_clinic_service_id AND m.source_deleted_at IS NULL LIMIT 1;
  IF legacy_id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND'; END IF;
  SELECT * INTO ctx FROM public.resolve_booking_context(_clinic_id,_location_id,_physio_id,legacy_id);
  SELECT * INTO exc FROM public.availability_exceptions e WHERE e.physiotherapist_id=_physio_id AND e.date=_date;
  IF exc.id IS NOT NULL AND exc.closed THEN RETURN; END IF;

  FOR schedule_row IN
    SELECT s.id,s.start_time,s.end_time,true AS location_schedule,NULL::time AS break_start,NULL::time AS break_end
    FROM public.physiotherapist_location_working_hours s
    WHERE s.clinic_id=_clinic_id AND s.location_id=_location_id AND s.physiotherapist_id=_physio_id
      AND s.day_of_week=extract(dow FROM _date)::smallint AND s.active
    UNION ALL
    SELECT w.id,w.start_time,w.end_time,false,w.break_start,w.break_end FROM public.working_hours w
    WHERE w.physiotherapist_id=_physio_id AND w.day_of_week=extract(dow FROM _date)::smallint AND w.active
      AND NOT EXISTS(SELECT 1 FROM public.physiotherapist_location_working_hours s
        WHERE s.clinic_id=_clinic_id AND s.location_id=_location_id AND s.physiotherapist_id=_physio_id
          AND s.day_of_week=extract(dow FROM _date)::smallint AND s.active)
  LOOP
    IF exc.id IS NOT NULL AND exc.start_time IS NOT NULL THEN
      day_start:=(_date+exc.start_time) AT TIME ZONE tz;day_end:=(_date+exc.end_time) AT TIME ZONE tz;
    ELSE day_start:=(_date+schedule_row.start_time) AT TIME ZONE tz;day_end:=(_date+schedule_row.end_time) AT TIME ZONE tz; END IF;
    cur:=day_start;
    WHILE cur+make_interval(mins=>ctx.duration_minutes)<=day_end LOOP
      cand_end:=cur+make_interval(mins=>ctx.duration_minutes);
      IF cur>now()
        AND NOT (NOT schedule_row.location_schedule AND schedule_row.break_start IS NOT NULL
          AND tstzrange(cur,cand_end)&&tstzrange((_date+schedule_row.break_start) AT TIME ZONE tz,(_date+schedule_row.break_end) AT TIME ZONE tz))
        AND NOT EXISTS(SELECT 1 FROM public.physiotherapist_location_schedule_breaks b
          WHERE schedule_row.location_schedule AND b.schedule_id=schedule_row.id
            AND tstzrange(cur,cand_end)&&tstzrange((_date+b.start_time) AT TIME ZONE tz,(_date+b.end_time) AT TIME ZONE tz))
        AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.physiotherapist_id=_physio_id
          AND a.id IS DISTINCT FROM _exclude_appointment_id AND a.status IN('PENDING','CONFIRMED')
          AND tstzrange(a.start_at,a.end_at)&&tstzrange(cur,cand_end))
        AND NOT EXISTS(SELECT 1 FROM public.blocked_times b WHERE b.physiotherapist_id=_physio_id
          AND tstzrange(b.start_at,b.end_at)&&tstzrange(cur,cand_end))
        AND NOT EXISTS(SELECT 1 FROM public.appointment_holds h WHERE h.physiotherapist_id=_physio_id
          AND h.expires_at>now() AND tstzrange(h.start_at,h.end_at)&&tstzrange(cur,cand_end))
      THEN slot:=cur;RETURN NEXT;END IF;
      cur:=cur+interval '15 minutes';
    END LOOP;
    IF exc.id IS NOT NULL AND exc.start_time IS NOT NULL THEN RETURN; END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.clinic_available_slots(uuid,uuid,uuid,uuid,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.clinic_available_slots(uuid,uuid,uuid,uuid,date,uuid) TO authenticated,service_role;
