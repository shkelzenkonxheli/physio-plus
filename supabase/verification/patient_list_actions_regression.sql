-- Patient list archive/reactivate permissions. All changes roll back.
BEGIN;

INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('abababab-3030-4030-8030-abababababab','authenticated','authenticated',
       'patient-list-reception@example.com',now(),'{}','{}',now(),now());
INSERT INTO public.clinic_memberships(clinic_id,user_id,role,active)
VALUES('1b93249a-aa66-43d7-b07d-5c2c2d64b630','abababab-3030-4030-8030-abababababab','RECEPTIONIST',true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','18b0e687-2785-4397-82c5-42900a5c681c',true);
SELECT public.set_clinic_patient_active(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
  (SELECT id FROM public.clinic_patients WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' LIMIT 1),
  false
);

SELECT set_config('request.jwt.claim.sub','abababab-3030-4030-8030-abababababab',true);
SELECT public.set_clinic_patient_active(
  '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
  (SELECT id FROM public.clinic_patients WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' LIMIT 1),
  true
);

SELECT set_config('request.jwt.claim.sub','cb54da15-783c-4bc3-9aae-6cf1c3e48f72',true);
DO $$
BEGIN
  BEGIN
    PERFORM public.set_clinic_patient_active(
      '1b93249a-aa66-43d7-b07d-5c2c2d64b630',
      (SELECT id FROM public.clinic_patients WHERE clinic_id='1b93249a-aa66-43d7-b07d-5c2c2d64b630' LIMIT 1),
      false
    );
    RAISE EXCEPTION 'PHYSIOTHERAPIST_ARCHIVED_PATIENT';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'PATIENT_OPERATOR_REQUIRED' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PATIENT_LIST_ACTIONS_OK';
END $$;

ROLLBACK;
