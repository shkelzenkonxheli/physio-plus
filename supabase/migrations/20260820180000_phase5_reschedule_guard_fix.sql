-- Consume the internal reschedule bypass exactly once.
CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE is_status_operator boolean;
BEGIN
  IF current_setting('app.allow_appointment_reschedule',true)='on' THEN
    PERFORM set_config('app.allow_appointment_reschedule','off',true);
    RETURN NEW;
  END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF OLD.client_id=auth.uid() AND OLD.physiotherapist_id IS DISTINCT FROM public.current_physio_id() THEN
    RAISE EXCEPTION 'CLIENT_APPOINTMENT_UPDATE_FORBIDDEN';
  END IF;
  is_status_operator := OLD.physiotherapist_id=public.current_physio_id()
    OR public.is_clinic_appointment_operator(OLD.physiotherapist_id);
  IF is_status_operator AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id OR NEW.physiotherapist_id IS DISTINCT FROM OLD.physiotherapist_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.clinic_service_id IS DISTINCT FROM OLD.clinic_service_id
    OR NEW.service_name IS DISTINCT FROM OLD.service_name OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at
    OR NEW.price IS DISTINCT FROM OLD.price OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.client_first_name IS DISTINCT FROM OLD.client_first_name OR NEW.client_last_name IS DISTINCT FROM OLD.client_last_name
    OR NEW.client_email IS DISTINCT FROM OLD.client_email OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
    OR NEW.client_message IS DISTINCT FROM OLD.client_message OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN RAISE EXCEPTION 'PROTECTED_APPOINTMENT_FIELDS'; END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protect_appointment_update() FROM PUBLIC,anon,authenticated;
