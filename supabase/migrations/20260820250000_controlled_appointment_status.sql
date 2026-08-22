-- Persist Clinic Panel status actions through one audited, tenant-safe entry point.
CREATE OR REPLACE FUNCTION public.set_clinic_appointment_status(
  _appointment_id uuid,
  _status public.appointment_status
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE current_row public.appointments; result public.appointments;
BEGIN
  SELECT * INTO current_row FROM public.appointments WHERE id=_appointment_id FOR UPDATE;
  IF current_row.id IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;
  IF NOT public.can_operate_clinic_appointment(current_row.clinic_id,current_row.physiotherapist_id) THEN
    RAISE EXCEPTION 'CLINIC_OPERATOR_REQUIRED';
  END IF;
  IF NOT (
    (current_row.status='PENDING' AND _status IN ('CONFIRMED','REJECTED','CANCELLED'))
    OR (current_row.status='CONFIRMED' AND _status IN ('COMPLETED','NO_SHOW','CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'INVALID_APPOINTMENT_STATUS_TRANSITION';
  END IF;

  UPDATE public.appointments SET status=_status WHERE id=_appointment_id RETURNING * INTO result;
  INSERT INTO public.appointment_activities(clinic_id,appointment_id,actor_user_id,action,metadata)
  VALUES(current_row.clinic_id,current_row.id,auth.uid(),'STATUS_CHANGED',
         jsonb_build_object('from',current_row.status,'to',_status));
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_clinic_appointment_status(uuid,public.appointment_status)
  TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.set_clinic_appointment_status(uuid,public.appointment_status)
  FROM PUBLIC,anon;
