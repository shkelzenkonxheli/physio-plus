-- Phase 5 local workflow/RLS regression. All writes are rolled back.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','authenticated','authenticated','phase5.reception@example.com',now(),'{}','{}',now(),now());
INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb','authenticated','authenticated','phase5.physio@example.com',now(),'{}','{"first_name":"Phase5","last_name":"Physio"}',now(),now());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);

DO $$
DECLARE clinic uuid:='1b93249a-aa66-43d7-b07d-5c2c2d64b630'; physio uuid; location uuid;
 service uuid; patient public.clinic_patients; created public.appointments; moved public.appointments;
 first_slot timestamptz; second_slot timestamptz; test_location public.clinic_locations; rejected boolean;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.get_clinic_team_members(clinic)) THEN
   RAISE EXCEPTION 'CLINIC_TEAM_ROSTER_EMPTY';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.get_clinic_bookable_assignments(clinic)) THEN
   RAISE EXCEPTION 'BOOKABLE_ASSIGNMENT_OPTIONS_EMPTY';
 END IF;
 SELECT p.id,pl.clinic_location_id,ps.clinic_service_id INTO physio,location,service
 FROM public.physiotherapists p JOIN public.physiotherapist_locations pl ON pl.physiotherapist_id=p.id AND pl.active
 JOIN public.physiotherapist_services ps ON ps.physiotherapist_id=p.id AND ps.active WHERE p.clinic_id=clinic LIMIT 1;
 patient:=public.create_clinic_patient(clinic,'Phase','Patient','044555111','phase5.workflow@example.com',NULL,'administrative only');
 patient:=public.update_clinic_patient(patient.id,'Phase','Patient Updated','044555111','phase5.workflow@example.com',NULL,'updated',true);
 SELECT candidate.slot INTO first_slot FROM generate_series(current_date+1,current_date+30,interval '1 day') d
 CROSS JOIN LATERAL public.clinic_available_slots(clinic,location,physio,service,d::date,NULL) candidate ORDER BY candidate.slot LIMIT 1;
 IF first_slot IS NULL THEN RAISE EXCEPTION 'NO_TEST_SLOT'; END IF;
 created:=public.create_clinic_appointment(clinic,location,patient.id,physio,service,first_slot,'phone call','PHONE');
 IF created.patient_id<>patient.id OR created.source<>'PHONE' OR created.duration_minutes IS NULL THEN RAISE EXCEPTION 'MANUAL_APPOINTMENT_INVALID'; END IF;
 SELECT candidate.slot INTO second_slot FROM generate_series(first_slot::date,first_slot::date+14,interval '1 day') d
 CROSS JOIN LATERAL public.clinic_available_slots(clinic,location,physio,service,d::date,created.id) candidate
 WHERE candidate.slot<>first_slot ORDER BY candidate.slot LIMIT 1;
 moved:=public.reschedule_clinic_appointment(created.id,location,physio,service,second_slot);
 IF moved.start_at<>second_slot OR moved.patient_id<>patient.id OR moved.source<>'PHONE' THEN RAISE EXCEPTION 'RESCHEDULE_INVALID'; END IF;
 PERFORM public.set_clinic_session_history_settings(clinic,true,true);
 PERFORM public.set_patient_session_history(patient.id,true);
 moved:=public.set_clinic_appointment_status(created.id,'COMPLETED');
 IF moved.status<>'COMPLETED' THEN RAISE EXCEPTION 'CONTROLLED_STATUS_UPDATE_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.appointment_activities aa WHERE aa.appointment_id=created.id AND aa.action='STATUS_CHANGED') THEN
   RAISE EXCEPTION 'STATUS_ACTIVITY_MISSING';
 END IF;
 INSERT INTO public.patient_session_notes(
   clinic_id,patient_id,appointment_id,physiotherapist_id,treatment_summary
 ) VALUES(clinic,patient.id,created.id,physio,'Phase 5 visible history test');
 IF NOT EXISTS(SELECT 1 FROM public.patient_session_notes n WHERE n.appointment_id=created.id) THEN
   RAISE EXCEPTION 'SESSION_NOTE_NOT_PERSISTED';
 END IF;
 rejected:=false; BEGIN PERFORM public.set_clinic_appointment_status(created.id,'CONFIRMED');
 EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%INVALID_APPOINTMENT_STATUS_TRANSITION%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'INVALID_STATUS_TRANSITION_ALLOWED'; END IF;
 rejected:=false; BEGIN UPDATE public.appointments SET price=0 WHERE id=created.id; EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%PROTECTED_APPOINTMENT_FIELDS%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'PROTECTED_PRICE_UPDATE_ALLOWED'; END IF;
 test_location:=public.save_clinic_location(clinic,NULL,'Phase 5 test location','Test address',NULL,NULL,NULL,NULL,NULL,'Europe/Belgrade',true);
 test_location:=public.set_default_clinic_location(clinic,test_location.id);
 rejected:=false; BEGIN PERFORM public.deactivate_clinic_location(clinic,test_location.id); EXCEPTION WHEN OTHERS THEN rejected:=SQLERRM LIKE '%SELECT_ANOTHER_DEFAULT_LOCATION_FIRST%'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'UNSAFE_DEFAULT_DEACTIVATION_ALLOWED'; END IF;
 PERFORM public.update_clinic_website(clinic,'Phase Test Clinic','draft','044','phase5@example.com','Address',NULL,NULL,NULL,'{}',true,true,true,true,false,false);
 PERFORM public.save_clinic_staff_schedule(
   clinic, location, physio, 6, true, '09:00', '13:00', '11:00', '11:30'
 );
 IF NOT EXISTS (
   SELECT 1 FROM public.physiotherapist_location_working_hours wh
   JOIN public.physiotherapist_location_schedule_breaks b ON b.schedule_id=wh.id
   WHERE wh.clinic_id=clinic AND wh.location_id=location
     AND wh.physiotherapist_id=physio AND wh.day_of_week=6
     AND wh.start_time='09:00' AND wh.end_time='13:00'
     AND b.start_time='11:00' AND b.end_time='11:30'
 ) THEN RAISE EXCEPTION 'EDITABLE_WEEKLY_SCHEDULE_INVALID'; END IF;
 RAISE NOTICE 'PHASE5_ADMIN_WORKFLOWS_OK';
END $$;

CREATE TEMP TABLE phase5_invite_token(token text) ON COMMIT DROP;
INSERT INTO phase5_invite_token(token)
SELECT invite_token FROM public.create_clinic_invitation(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630','phase5.reception@example.com','RECEPTIONIST'
);
CREATE TEMP TABLE phase5_physio_invite_token(token text) ON COMMIT DROP;
INSERT INTO phase5_physio_invite_token(token)
SELECT invite_token FROM public.create_clinic_invitation(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630','phase5.physio@example.com','PHYSIOTHERAPIST'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',true);
SELECT clinic_id,role FROM public.accept_clinic_invitation((SELECT token FROM phase5_invite_token));
DO $$ BEGIN
  BEGIN PERFORM public.accept_clinic_invitation((SELECT token FROM phase5_invite_token));
    RAISE EXCEPTION 'INVITATION_REUSE_ALLOWED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='INVITATION_REUSE_ALLOWED' THEN RAISE; END IF; END;
END $$;
SELECT id FROM public.create_clinic_patient('1b93249a-aa66-43d7-b07d-5c2c2d64b630','Reception','Patient','044555222',NULL,NULL,NULL);
DO $$ BEGIN
  BEGIN PERFORM public.create_clinic_invitation('1b93249a-aa66-43d7-b07d-5c2c2d64b630','blocked@example.com','RECEPTIONIST');
    RAISE EXCEPTION 'RECEPTIONIST_INVITE_ALLOWED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='RECEPTIONIST_INVITE_ALLOWED' THEN RAISE; END IF; END;
END $$;
SELECT count(*) AS receptionist_session_notes_visible FROM public.patient_session_notes;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',true);
SELECT clinic_id,role FROM public.accept_clinic_invitation((SELECT token FROM phase5_physio_invite_token));
DO $$ BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM public.physiotherapists p
    WHERE p.user_id=auth.uid() AND p.clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630'
  ) THEN RAISE EXCEPTION 'INVITED_PHYSIO_NOT_PROVISIONED'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);
SELECT public.set_physiotherapist_location_assignment(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
  (SELECT id FROM public.physiotherapists WHERE user_id='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'),
  (SELECT id FROM public.clinic_locations WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' AND active ORDER BY is_default DESC LIMIT 1),
  true
);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',true);
SELECT public.save_clinic_staff_schedule(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
  (SELECT id FROM public.clinic_locations WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' AND active ORDER BY is_default DESC LIMIT 1),
  (SELECT id FROM public.physiotherapists WHERE user_id='bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'),
  2,true,'10:00','14:00','12:00','12:30'
);
ROLLBACK;
