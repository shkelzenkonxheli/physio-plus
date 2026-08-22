-- Clinic Panel tenant-isolation regression. All fixtures are rolled back.
BEGIN;

INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('cccccccc-3333-4333-8333-cccccccccccc','authenticated','authenticated',
       'tenant-b.admin@example.com',now(),'{}','{}',now(),now());

INSERT INTO public.clinics(id,name,slug,active,public_listing_enabled)
VALUES('dddddddd-4444-4444-8444-dddddddddddd','Tenant B private','phase5-tenant-b-private',false,false);
INSERT INTO public.clinic_memberships(clinic_id,user_id,role,active)
VALUES('dddddddd-4444-4444-8444-dddddddddddd','cccccccc-3333-4333-8333-cccccccccccc','CLINIC_ADMIN',true);
INSERT INTO public.clinic_locations(id,clinic_id,name,active,is_default,timezone)
VALUES('eeeeeeee-5555-4555-8555-eeeeeeeeeeee','dddddddd-4444-4444-8444-dddddddddddd',
       'Tenant B location',true,true,'Europe/Belgrade');
INSERT INTO public.clinic_patients(id,clinic_id,patient_key,first_name,last_name,email,phone)
VALUES('ffffffff-6666-4666-8666-ffffffffffff','dddddddd-4444-4444-8444-dddddddddddd',
       'email:private-b@example.com','Private','Patient','private-b@example.com','');
INSERT INTO public.clinic_service_categories(id,clinic_id,name,active)
VALUES('11111111-7777-4777-8777-111111111111','dddddddd-4444-4444-8444-dddddddddddd','Private category',false);
INSERT INTO public.clinic_services(id,clinic_id,category_id,name,price,duration_minutes,active)
VALUES('22222222-8888-4888-8888-222222222222','dddddddd-4444-4444-8444-dddddddddddd',
       '11111111-7777-4777-8777-111111111111','Private service',25,45,false);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

DO $$
DECLARE changed integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.clinic_memberships WHERE clinic_id='dddddddd-4444-4444-8444-dddddddddddd')
    THEN RAISE EXCEPTION 'CROSS_TENANT_MEMBERSHIP_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.clinic_locations WHERE clinic_id='dddddddd-4444-4444-8444-dddddddddddd')
    THEN RAISE EXCEPTION 'CROSS_TENANT_LOCATION_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.clinic_patients WHERE clinic_id='dddddddd-4444-4444-8444-dddddddddddd')
    THEN RAISE EXCEPTION 'CROSS_TENANT_PATIENT_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.clinic_services WHERE id='22222222-8888-4888-8888-222222222222')
    THEN RAISE EXCEPTION 'CROSS_TENANT_PRIVATE_SERVICE_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.get_clinic_team_members('dddddddd-4444-4444-8444-dddddddddddd'))
    THEN RAISE EXCEPTION 'CROSS_TENANT_TEAM_RPC_VISIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.get_clinic_bookable_assignments('dddddddd-4444-4444-8444-dddddddddddd'))
    THEN RAISE EXCEPTION 'CROSS_TENANT_BOOKING_OPTIONS_VISIBLE'; END IF;

  UPDATE public.clinic_services SET name='Illegal tenant mutation'
  WHERE id='22222222-8888-4888-8888-222222222222';
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>0 THEN RAISE EXCEPTION 'CROSS_TENANT_SERVICE_UPDATE_ALLOWED'; END IF;
  RAISE NOTICE 'CLINIC_PANEL_CROSS_TENANT_RLS_OK';
END $$;

ROLLBACK;
