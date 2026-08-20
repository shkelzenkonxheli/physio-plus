-- Phase 5 steps 5-10: locations, assignments, schedules, invitations and website.

CREATE OR REPLACE FUNCTION public.save_clinic_location(
  _clinic_id uuid, _location_id uuid, _name text, _address text DEFAULT NULL,
  _city_id uuid DEFAULT NULL, _region_id uuid DEFAULT NULL, _phone text DEFAULT NULL,
  _latitude double precision DEFAULT NULL, _longitude double precision DEFAULT NULL,
  _timezone text DEFAULT 'Europe/Belgrade', _active boolean DEFAULT true
)
RETURNS public.clinic_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE result public.clinic_locations; action_name text;
BEGIN
  IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
  IF length(trim(coalesce(_name,'')))<2 OR length(trim(coalesce(_timezone,'')))<2 THEN RAISE EXCEPTION 'INVALID_LOCATION'; END IF;
  IF _location_id IS NULL THEN
    INSERT INTO public.clinic_locations(clinic_id,name,address,city_id,region_id,phone,latitude,longitude,timezone,active)
    VALUES(_clinic_id,trim(_name),nullif(trim(coalesce(_address,'')),''),_city_id,_region_id,
      nullif(trim(coalesce(_phone,'')),''),_latitude,_longitude,trim(_timezone),_active)
    RETURNING * INTO result; action_name:='LOCATION_CREATED';
  ELSE
    UPDATE public.clinic_locations SET name=trim(_name),address=nullif(trim(coalesce(_address,'')),''),
      city_id=_city_id,region_id=_region_id,phone=nullif(trim(coalesce(_phone,'')),''),
      latitude=_latitude,longitude=_longitude,timezone=trim(_timezone),active=_active
    WHERE id=_location_id AND clinic_id=_clinic_id RETURNING * INTO result;
    IF result.id IS NULL THEN RAISE EXCEPTION 'LOCATION_NOT_FOUND'; END IF;
    action_name:='LOCATION_UPDATED';
  END IF;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),action_name,'clinic_location',result.id,jsonb_build_object('clinic_id',_clinic_id));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_clinic_location(_clinic_id uuid,_location_id uuid)
RETURNS public.clinic_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE result public.clinic_locations;
BEGIN
  IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clinic_locations WHERE id=_location_id AND clinic_id=_clinic_id AND active) THEN RAISE EXCEPTION 'ACTIVE_LOCATION_REQUIRED'; END IF;
  UPDATE public.clinic_locations SET is_default=false WHERE clinic_id=_clinic_id AND is_default;
  UPDATE public.clinic_locations SET is_default=true WHERE id=_location_id AND clinic_id=_clinic_id RETURNING * INTO result;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'LOCATION_DEFAULT_CHANGED','clinic_location',result.id,jsonb_build_object('clinic_id',_clinic_id));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_clinic_location(_clinic_id uuid,_location_id uuid)
RETURNS public.clinic_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE result public.clinic_locations;
BEGIN
  IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM public.appointments WHERE clinic_id=_clinic_id AND location_id=_location_id
    AND start_at>now() AND status IN ('PENDING','CONFIRMED')) THEN RAISE EXCEPTION 'LOCATION_HAS_FUTURE_APPOINTMENTS'; END IF;
  IF EXISTS(SELECT 1 FROM public.clinic_locations WHERE id=_location_id AND clinic_id=_clinic_id AND is_default)
    AND NOT EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id=_clinic_id AND id<>_location_id AND active AND is_default)
  THEN RAISE EXCEPTION 'SELECT_ANOTHER_DEFAULT_LOCATION_FIRST'; END IF;
  UPDATE public.clinic_locations SET active=false WHERE id=_location_id AND clinic_id=_clinic_id RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION 'LOCATION_NOT_FOUND'; END IF;
  UPDATE public.physiotherapist_locations SET active=false WHERE clinic_id=_clinic_id AND clinic_location_id=_location_id;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'LOCATION_DEACTIVATED','clinic_location',result.id,jsonb_build_object('clinic_id',_clinic_id));
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_physiotherapist_location_assignment(
  _clinic_id uuid,_physio_id uuid,_location_id uuid,_active boolean
)
RETURNS public.physiotherapist_locations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE result public.physiotherapist_locations;
BEGIN
  IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
  IF NOT _active AND EXISTS(SELECT 1 FROM public.appointments WHERE clinic_id=_clinic_id
    AND location_id=_location_id AND physiotherapist_id=_physio_id AND start_at>now()
    AND status IN ('PENDING','CONFIRMED')) THEN RAISE EXCEPTION 'ASSIGNMENT_HAS_FUTURE_APPOINTMENTS'; END IF;
  INSERT INTO public.physiotherapist_locations(clinic_id,physiotherapist_id,clinic_location_id,active)
  VALUES(_clinic_id,_physio_id,_location_id,_active)
  ON CONFLICT(clinic_id,physiotherapist_id,clinic_location_id)
  DO UPDATE SET active=excluded.active RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE TABLE public.physiotherapist_location_working_hours(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  location_id uuid NOT NULL, physiotherapist_id uuid NOT NULL, day_of_week smallint NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL, end_time time NOT NULL, active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('LEGACY_BACKFILL','MANUAL')),
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(location_id,clinic_id) REFERENCES public.clinic_locations(id,clinic_id) ON DELETE CASCADE,
  FOREIGN KEY(physiotherapist_id,clinic_id) REFERENCES public.physiotherapists(id,clinic_id) ON DELETE CASCADE,
  UNIQUE(clinic_id,location_id,physiotherapist_id,day_of_week,start_time), CHECK(start_time<end_time)
);
CREATE INDEX plwh_lookup_idx ON public.physiotherapist_location_working_hours(physiotherapist_id,location_id,day_of_week,active);
CREATE TABLE public.physiotherapist_location_schedule_breaks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid NOT NULL REFERENCES public.physiotherapist_location_working_hours(id) ON DELETE CASCADE,
  start_time time NOT NULL,end_time time NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id,start_time),CHECK(start_time<end_time)
);
CREATE TABLE public.legacy_schedule_mapping_issues(
  legacy_working_hour_id uuid PRIMARY KEY REFERENCES public.working_hours(id) ON DELETE CASCADE,
  physiotherapist_id uuid NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('MAPPED','MANUAL_CONFIGURATION_REQUIRED','SKIPPED')),
  detail text,created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.legacy_schedule_mapping_issues(legacy_working_hour_id,physiotherapist_id,clinic_id,status,detail)
SELECT w.id,w.physiotherapist_id,p.clinic_id,
  CASE WHEN p.clinic_id IS NULL THEN 'SKIPPED'
       WHEN count(pl.id)=1 THEN 'MAPPED' ELSE 'MANUAL_CONFIGURATION_REQUIRED' END,
  CASE WHEN p.clinic_id IS NULL THEN 'physiotherapist has no clinic'
       WHEN count(pl.id)=1 THEN 'single active assigned location'
       ELSE 'active assigned locations='||count(pl.id) END
FROM public.working_hours w JOIN public.physiotherapists p ON p.id=w.physiotherapist_id
LEFT JOIN public.physiotherapist_locations pl ON pl.physiotherapist_id=p.id AND pl.clinic_id=p.clinic_id AND pl.active
GROUP BY w.id,w.physiotherapist_id,p.clinic_id;

INSERT INTO public.physiotherapist_location_working_hours(clinic_id,location_id,physiotherapist_id,day_of_week,start_time,end_time,active,source)
SELECT issue.clinic_id,(array_agg(pl.clinic_location_id ORDER BY pl.clinic_location_id))[1],w.physiotherapist_id,
  w.day_of_week,w.start_time,w.end_time,w.active,'LEGACY_BACKFILL'
FROM public.legacy_schedule_mapping_issues issue JOIN public.working_hours w ON w.id=issue.legacy_working_hour_id
JOIN public.physiotherapist_locations pl ON pl.clinic_id=issue.clinic_id AND pl.physiotherapist_id=w.physiotherapist_id AND pl.active
WHERE issue.status='MAPPED' GROUP BY issue.clinic_id,w.id,w.physiotherapist_id,w.day_of_week,w.start_time,w.end_time,w.active;
INSERT INTO public.physiotherapist_location_schedule_breaks(schedule_id,start_time,end_time)
SELECT schedule.id,w.break_start,w.break_end FROM public.physiotherapist_location_working_hours schedule
JOIN public.working_hours w ON w.physiotherapist_id=schedule.physiotherapist_id AND w.day_of_week=schedule.day_of_week
WHERE schedule.source='LEGACY_BACKFILL' AND w.break_start IS NOT NULL AND w.break_end IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_location_schedule_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.active AND EXISTS(SELECT 1 FROM public.physiotherapist_location_working_hours s
   WHERE s.physiotherapist_id=NEW.physiotherapist_id AND s.day_of_week=NEW.day_of_week AND s.active
     AND s.id<>NEW.id AND s.start_time<NEW.end_time AND NEW.start_time<s.end_time)
 THEN RAISE EXCEPTION 'PHYSIOTHERAPIST_SCHEDULE_OVERLAP'; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_location_schedule_overlap BEFORE INSERT OR UPDATE ON public.physiotherapist_location_working_hours
FOR EACH ROW EXECUTE FUNCTION public.validate_location_schedule_overlap();
CREATE TRIGGER trg_plwh_updated BEFORE UPDATE ON public.physiotherapist_location_working_hours
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.physiotherapist_location_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physiotherapist_location_schedule_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_schedule_mapping_issues ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.physiotherapist_location_working_hours,public.physiotherapist_location_schedule_breaks,public.legacy_schedule_mapping_issues TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.physiotherapist_location_working_hours,public.physiotherapist_location_schedule_breaks TO authenticated;
GRANT ALL ON public.physiotherapist_location_working_hours,public.physiotherapist_location_schedule_breaks,public.legacy_schedule_mapping_issues TO service_role;
CREATE POLICY plwh_read ON public.physiotherapist_location_working_hours FOR SELECT TO authenticated USING(public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY plwh_write ON public.physiotherapist_location_working_hours FOR ALL TO authenticated USING(public.is_clinic_admin(clinic_id) OR physiotherapist_id=public.current_physio_id() OR public.is_admin(auth.uid())) WITH CHECK(public.is_clinic_admin(clinic_id) OR physiotherapist_id=public.current_physio_id() OR public.is_admin(auth.uid()));
CREATE POLICY schedule_break_read ON public.physiotherapist_location_schedule_breaks FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.physiotherapist_location_working_hours s WHERE s.id=schedule_id AND (public.is_clinic_member(s.clinic_id) OR public.is_admin(auth.uid()))));
CREATE POLICY schedule_break_write ON public.physiotherapist_location_schedule_breaks FOR ALL TO authenticated USING(EXISTS(SELECT 1 FROM public.physiotherapist_location_working_hours s WHERE s.id=schedule_id AND (public.is_clinic_admin(s.clinic_id) OR s.physiotherapist_id=public.current_physio_id() OR public.is_admin(auth.uid())))) WITH CHECK(EXISTS(SELECT 1 FROM public.physiotherapist_location_working_hours s WHERE s.id=schedule_id AND (public.is_clinic_admin(s.clinic_id) OR s.physiotherapist_id=public.current_physio_id() OR public.is_admin(auth.uid()))));
CREATE POLICY schedule_issues_read ON public.legacy_schedule_mapping_issues FOR SELECT TO authenticated USING(public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

CREATE TABLE public.clinic_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
 email text NOT NULL,role public.clinic_role NOT NULL CHECK(role IN ('PHYSIOTHERAPIST','RECEPTIONIST')),
 invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX clinic_invitation_open_unique ON public.clinic_invitations(clinic_id,lower(email),role) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.clinic_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.clinic_invitations TO authenticated; GRANT ALL ON public.clinic_invitations TO service_role;
CREATE POLICY clinic_invitation_admin_read ON public.clinic_invitations FOR SELECT TO authenticated USING(public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_clinic_invitation(_clinic_id uuid,_email text,_role public.clinic_role)
RETURNS TABLE(invitation_id uuid,invite_token text,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions
AS $$ DECLARE raw_token text:=encode(gen_random_bytes(32),'hex'); created public.clinic_invitations;
BEGIN
 IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
 IF _role NOT IN ('PHYSIOTHERAPIST','RECEPTIONIST') THEN RAISE EXCEPTION 'INVALID_INVITATION_ROLE'; END IF;
 INSERT INTO public.clinic_invitations(clinic_id,email,role,invited_by,token_hash,expires_at)
 VALUES(_clinic_id,lower(trim(_email)),_role,auth.uid(),encode(digest(raw_token,'sha256'),'hex'),now()+interval '7 days') RETURNING * INTO created;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'TEAM_MEMBER_INVITED','clinic_invitation',created.id,jsonb_build_object('clinic_id',_clinic_id,'role',_role));
 RETURN QUERY SELECT created.id,raw_token,created.expires_at;
END $$;
CREATE OR REPLACE FUNCTION public.accept_clinic_invitation(_token text)
RETURNS public.clinic_memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions
AS $$ DECLARE invitation public.clinic_invitations; result public.clinic_memberships; user_email text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
 SELECT email INTO user_email FROM auth.users WHERE id=auth.uid();
 SELECT * INTO invitation FROM public.clinic_invitations WHERE token_hash=encode(digest(_token,'sha256'),'hex') FOR UPDATE;
 IF invitation.id IS NULL OR invitation.revoked_at IS NOT NULL OR invitation.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_INVALID'; END IF;
 IF invitation.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_EXPIRED'; END IF;
 IF lower(user_email)<>invitation.email THEN RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH'; END IF;
 INSERT INTO public.clinic_memberships(clinic_id,user_id,role,active) VALUES(invitation.clinic_id,auth.uid(),invitation.role,true)
 ON CONFLICT(clinic_id,user_id,role) DO UPDATE SET active=true RETURNING * INTO result;
 UPDATE public.clinic_invitations SET accepted_at=now() WHERE id=invitation.id;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'TEAM_INVITATION_ACCEPTED','clinic_invitation',invitation.id,jsonb_build_object('clinic_id',invitation.clinic_id));
 RETURN result;
END $$;

ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS website_status text NOT NULL DEFAULT 'DRAFT' CHECK(website_status IN ('DRAFT','PUBLISHED')),
 ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS services_visible boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS team_visible boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS locations_visible boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS booking_cta_enabled boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.update_clinic_website(_clinic_id uuid,_name text,_description text,_phone text,_email text,_address text,
 _logo_url text,_header_image_url text,_website text,_social_links jsonb,_services_visible boolean,_team_visible boolean,
 _locations_visible boolean,_booking_cta_enabled boolean,_public_listing_enabled boolean,_publish boolean)
RETURNS public.clinics LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$ DECLARE result public.clinics;
BEGIN
 IF NOT public.is_clinic_admin(_clinic_id) AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED'; END IF;
 UPDATE public.clinics SET name=trim(_name),description=nullif(trim(coalesce(_description,'')),''),phone=nullif(trim(coalesce(_phone,'')),''),
 email=nullif(lower(trim(coalesce(_email,''))),''),address=nullif(trim(coalesce(_address,'')),''),logo_url=_logo_url,
 header_image_url=_header_image_url,website=_website,social_links=coalesce(_social_links,'{}'::jsonb),services_visible=_services_visible,
 team_visible=_team_visible,locations_visible=_locations_visible,booking_cta_enabled=_booking_cta_enabled,
 public_listing_enabled=_public_listing_enabled,website_status=CASE WHEN _publish THEN 'PUBLISHED' ELSE 'DRAFT' END
 WHERE id=_clinic_id RETURNING * INTO result;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),CASE WHEN _publish THEN 'WEBSITE_PUBLISHED' ELSE 'WEBSITE_UPDATED' END,'clinic',_clinic_id,'{}');
 RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.save_clinic_location(uuid,uuid,text,text,uuid,uuid,text,double precision,double precision,text,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_default_clinic_location(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_clinic_location(uuid,uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_physiotherapist_location_assignment(uuid,uuid,uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.create_clinic_invitation(uuid,text,public.clinic_role) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_clinic_invitation(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_clinic_website(uuid,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.save_clinic_location(uuid,uuid,text,text,uuid,uuid,text,double precision,double precision,text,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.set_default_clinic_location(uuid,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_clinic_location(uuid,uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.set_physiotherapist_location_assignment(uuid,uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.create_clinic_invitation(uuid,text,public.clinic_role) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.accept_clinic_invitation(text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.update_clinic_website(uuid,text,text,text,text,text,text,text,text,jsonb,boolean,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.validate_location_schedule_overlap() FROM PUBLIC,anon,authenticated;
