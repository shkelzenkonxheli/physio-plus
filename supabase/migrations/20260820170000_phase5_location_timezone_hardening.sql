-- PostgreSQL's IANA catalog does not include Europe/Pristina.
ALTER TABLE public.clinic_locations ALTER COLUMN timezone SET DEFAULT 'Europe/Belgrade';
UPDATE public.clinic_locations l SET timezone='Europe/Belgrade'
WHERE NOT EXISTS(SELECT 1 FROM pg_timezone_names tz WHERE tz.name=l.timezone);

CREATE OR REPLACE FUNCTION public.validate_clinic_location_timezone()
RETURNS trigger LANGUAGE plpgsql SET search_path=public
AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names tz WHERE tz.name=NEW.timezone) THEN
    RAISE EXCEPTION 'INVALID_LOCATION_TIMEZONE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_clinic_location_timezone
BEFORE INSERT OR UPDATE OF timezone ON public.clinic_locations
FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_location_timezone();
REVOKE EXECUTE ON FUNCTION public.validate_clinic_location_timezone() FROM PUBLIC,anon,authenticated;
