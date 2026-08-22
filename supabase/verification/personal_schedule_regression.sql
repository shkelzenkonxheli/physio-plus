-- Personal weekly schedule regression. No data persists.
BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

DO $$
DECLARE
  own_physio uuid := public.current_physio_id();
  own_clinic uuid;
  own_location uuid;
  other_physio uuid;
  closed_week jsonb := '[
    {"day_of_week":0,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":1,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":2,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":3,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":4,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":5,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""},
    {"day_of_week":6,"enabled":false,"start_time":"08:00","end_time":"16:00","break_start":"","break_end":""}
  ]'::jsonb;
BEGIN
  SELECT pl.clinic_id, pl.clinic_location_id
  INTO own_clinic, own_location
  FROM public.physiotherapist_locations pl
  WHERE pl.physiotherapist_id = own_physio AND pl.active
  LIMIT 1;

  IF own_physio IS NULL OR own_location IS NULL THEN
    RAISE EXCEPTION 'ADMIN_PHYSIO_LOCATION_FIXTURE_REQUIRED';
  END IF;

  PERFORM public.save_my_weekly_schedule(own_clinic, own_location, closed_week);

  SELECT p.id INTO other_physio
  FROM public.physiotherapists p
  WHERE p.clinic_id = own_clinic AND p.id <> own_physio
  LIMIT 1;

  IF other_physio IS NOT NULL THEN
    BEGIN
      PERFORM public.save_clinic_staff_schedule(
        own_clinic, own_location, other_physio, 1, true,
        '08:00'::time, '16:00'::time, NULL, NULL
      );
      RAISE EXCEPTION 'CLINIC_ADMIN_CHANGED_OTHER_PHYSIO_SCHEDULE';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'OWN_SCHEDULE_ONLY' THEN RAISE; END IF;
    END;
  END IF;

  RAISE NOTICE 'PERSONAL_WEEKLY_SCHEDULE_OK';
END $$;

ROLLBACK;
