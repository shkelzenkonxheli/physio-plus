-- Ensure every new public/authenticated appointment receives its clinic patient FK.
CREATE OR REPLACE FUNCTION public.sync_appointment_clinic_patient()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE target_clinic_id uuid;target_key text;target_patient_id uuid;
BEGIN
  IF NEW.patient_id IS NOT NULL THEN RETURN NEW; END IF;
  target_clinic_id:=NEW.clinic_id;
  IF target_clinic_id IS NULL THEN
    SELECT p.clinic_id INTO target_clinic_id FROM public.physiotherapists p WHERE p.id=NEW.physiotherapist_id;
  END IF;
  IF target_clinic_id IS NULL THEN RETURN NEW; END IF;
  target_key:=public.appointment_patient_key(NEW.client_id,NEW.client_email,NEW.client_phone);
  INSERT INTO public.clinic_patients(clinic_id,client_user_id,patient_key,first_name,last_name,email,phone)
  VALUES(target_clinic_id,NEW.client_id,target_key,NEW.client_first_name,NEW.client_last_name,
    lower(trim(NEW.client_email)),trim(NEW.client_phone))
  ON CONFLICT(clinic_id,patient_key) DO UPDATE SET
    client_user_id=coalesce(excluded.client_user_id,clinic_patients.client_user_id),
    first_name=CASE WHEN excluded.first_name<>'' THEN excluded.first_name ELSE clinic_patients.first_name END,
    last_name=CASE WHEN excluded.last_name<>'' THEN excluded.last_name ELSE clinic_patients.last_name END,
    email=CASE WHEN excluded.email<>'' THEN excluded.email ELSE clinic_patients.email END,
    phone=CASE WHEN excluded.phone<>'' THEN excluded.phone ELSE clinic_patients.phone END,
    updated_at=now()
  RETURNING id INTO target_patient_id;
  NEW.patient_id:=target_patient_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_appointment_clinic_patient ON public.appointments;
CREATE TRIGGER trg_sync_appointment_clinic_patient
BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_clinic_patient();
REVOKE EXECUTE ON FUNCTION public.sync_appointment_clinic_patient() FROM PUBLIC,anon,authenticated;
