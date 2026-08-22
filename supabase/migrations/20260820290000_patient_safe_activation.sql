-- Safe list action: archive/reactivate a patient without deleting clinical or
-- appointment history.
CREATE OR REPLACE FUNCTION public.set_clinic_patient_active(
  _clinic_id uuid,
  _patient_id uuid,
  _active boolean
)
RETURNS public.clinic_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.clinic_patients;
BEGIN
  IF NOT (
    public.is_clinic_admin(_clinic_id)
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.clinic_memberships m
      WHERE m.clinic_id = _clinic_id
        AND m.user_id = auth.uid()
        AND m.role = 'RECEPTIONIST'
        AND m.active
    )
  ) THEN
    RAISE EXCEPTION 'PATIENT_OPERATOR_REQUIRED';
  END IF;

  UPDATE public.clinic_patients
  SET active = _active, updated_at = now()
  WHERE id = _patient_id AND clinic_id = _clinic_id
  RETURNING * INTO result;

  IF result.id IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND'; END IF;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_clinic_patient_active(uuid,uuid,boolean)
  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_clinic_patient_active(uuid,uuid,boolean)
  FROM PUBLIC, anon;
