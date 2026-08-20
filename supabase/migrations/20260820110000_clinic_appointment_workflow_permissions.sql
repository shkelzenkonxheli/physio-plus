-- Allow clinic appointment workflows without weakening booking integrity.
-- Booking RPCs, slot holds, overlap constraints and appointment times are untouched.

CREATE OR REPLACE FUNCTION public.sync_appointment_clinic_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_clinic_id uuid;
  target_key text;
BEGIN
  IF NEW.client_id IS NULL
     AND trim(coalesce(NEW.client_email, '')) = ''
     AND trim(coalesce(NEW.client_phone, '')) = '' THEN
    RETURN NEW;
  END IF;

  SELECT p.clinic_id INTO target_clinic_id
  FROM public.physiotherapists p
  WHERE p.id = NEW.physiotherapist_id;

  IF target_clinic_id IS NULL THEN
    RETURN NEW;
  END IF;

  target_key := public.appointment_patient_key(NEW.client_id, NEW.client_email, NEW.client_phone);

  INSERT INTO public.clinic_patients (
    clinic_id, client_user_id, patient_key, first_name, last_name, email, phone
  ) VALUES (
    target_clinic_id, NEW.client_id, target_key, NEW.client_first_name,
    NEW.client_last_name, lower(trim(NEW.client_email)), trim(NEW.client_phone)
  )
  ON CONFLICT (clinic_id, patient_key) DO UPDATE SET
    client_user_id = coalesce(EXCLUDED.client_user_id, clinic_patients.client_user_id),
    first_name = CASE WHEN EXCLUDED.first_name <> '' THEN EXCLUDED.first_name ELSE clinic_patients.first_name END,
    last_name = CASE WHEN EXCLUDED.last_name <> '' THEN EXCLUDED.last_name ELSE clinic_patients.last_name END,
    email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE clinic_patients.email END,
    phone = CASE WHEN EXCLUDED.phone <> '' THEN EXCLUDED.phone ELSE clinic_patients.phone END,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_appointment_operator(target_physio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    JOIN public.clinic_memberships m
      ON m.clinic_id = p.clinic_id
     AND m.user_id = auth.uid()
     AND m.active
     AND m.role IN ('CLINIC_ADMIN', 'RECEPTIONIST')
    WHERE p.id = target_physio_id
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_appointment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_status_operator boolean;
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.client_id = auth.uid()
    AND OLD.physiotherapist_id IS DISTINCT FROM public.current_physio_id() THEN
    RAISE EXCEPTION 'CLIENT_APPOINTMENT_UPDATE_FORBIDDEN';
  END IF;

  is_status_operator :=
    OLD.physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_appointment_operator(OLD.physiotherapist_id);

  IF is_status_operator
    AND (NEW.id IS DISTINCT FROM OLD.id
      OR NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.physiotherapist_id IS DISTINCT FROM OLD.physiotherapist_id
      OR NEW.service_id IS DISTINCT FROM OLD.service_id
      OR NEW.service_name IS DISTINCT FROM OLD.service_name
      OR NEW.start_at IS DISTINCT FROM OLD.start_at
      OR NEW.end_at IS DISTINCT FROM OLD.end_at
      OR NEW.price IS DISTINCT FROM OLD.price
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.client_first_name IS DISTINCT FROM OLD.client_first_name
      OR NEW.client_last_name IS DISTINCT FROM OLD.client_last_name
      OR NEW.client_email IS DISTINCT FROM OLD.client_email
      OR NEW.client_phone IS DISTINCT FROM OLD.client_phone
      OR NEW.client_message IS DISTINCT FROM OLD.client_message
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'PROTECTED_APPOINTMENT_FIELDS';
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS appt_read ON public.appointments;
DROP POLICY IF EXISTS "appt_read" ON public.appointments;
CREATE POLICY appt_read ON public.appointments
  FOR SELECT TO authenticated
  USING (
    client_id = auth.uid()
    OR physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_appointment_operator(physiotherapist_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS appt_update ON public.appointments;
DROP POLICY IF EXISTS "appt_update" ON public.appointments;
CREATE POLICY appt_update ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_appointment_operator(physiotherapist_id)
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_appointment_operator(physiotherapist_id)
    OR public.is_admin(auth.uid())
  );

REVOKE EXECUTE ON FUNCTION public.is_clinic_appointment_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_appointment_operator(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.sync_appointment_clinic_patient() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_appointment_update() FROM PUBLIC, anon, authenticated;

