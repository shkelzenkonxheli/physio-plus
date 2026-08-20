-- Optional lightweight patient/session history for clinic tenants.
-- Additive only: booking RPCs, holds and overlap protection are unchanged.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS session_history_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_notes_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.clinic_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_key text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  keep_session_history boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_patients_identity_unique UNIQUE (clinic_id, patient_key),
  CONSTRAINT clinic_patients_id_clinic_unique UNIQUE (id, clinic_id),
  CONSTRAINT clinic_patients_contact_required CHECK (
    client_user_id IS NOT NULL OR email <> '' OR phone <> ''
  )
);

CREATE INDEX clinic_patients_clinic_name_idx
  ON public.clinic_patients (clinic_id, last_name, first_name);
CREATE INDEX clinic_patients_client_user_idx
  ON public.clinic_patients (client_user_id) WHERE client_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.appointment_patient_key(
  target_client_id uuid,
  target_email text,
  target_phone text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN target_client_id IS NOT NULL THEN 'user:' || target_client_id::text
    WHEN nullif(lower(trim(target_email)), '') IS NOT NULL
      THEN 'email:' || lower(trim(target_email))
    ELSE 'phone:' || regexp_replace(coalesce(target_phone, ''), '[^0-9+]', '', 'g')
  END;
$$;

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

DROP TRIGGER IF EXISTS trg_sync_appointment_clinic_patient ON public.appointments;
CREATE TRIGGER trg_sync_appointment_clinic_patient
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_clinic_patient();

-- Prepare the patient directory from existing appointment snapshots.
INSERT INTO public.clinic_patients (
  clinic_id, client_user_id, patient_key, first_name, last_name, email, phone
)
SELECT DISTINCT ON (p.clinic_id, public.appointment_patient_key(
    a.client_id, a.client_email, a.client_phone
  ))
  p.clinic_id,
  a.client_id,
  public.appointment_patient_key(a.client_id, a.client_email, a.client_phone),
  a.client_first_name,
  a.client_last_name,
  lower(trim(a.client_email)),
  trim(a.client_phone)
FROM public.appointments a
JOIN public.physiotherapists p ON p.id = a.physiotherapist_id
WHERE p.clinic_id IS NOT NULL
  AND (a.client_id IS NOT NULL OR trim(a.client_email) <> '' OR trim(a.client_phone) <> '')
ORDER BY p.clinic_id,
  public.appointment_patient_key(a.client_id, a.client_email, a.client_phone),
  a.created_at DESC
ON CONFLICT (clinic_id, patient_key) DO NOTHING;

CREATE TABLE public.patient_session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE RESTRICT,
  physiotherapist_id uuid NOT NULL,
  note text,
  treatment_summary text,
  patient_progress text,
  next_session_plan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_session_notes_patient_clinic_fkey
    FOREIGN KEY (patient_id, clinic_id)
    REFERENCES public.clinic_patients(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT patient_session_notes_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists(id, clinic_id) ON DELETE RESTRICT,
  CONSTRAINT patient_session_notes_content_required CHECK (
    nullif(trim(coalesce(note, '')), '') IS NOT NULL
    OR nullif(trim(coalesce(treatment_summary, '')), '') IS NOT NULL
    OR nullif(trim(coalesce(patient_progress, '')), '') IS NOT NULL
    OR nullif(trim(coalesce(next_session_plan, '')), '') IS NOT NULL
  )
);

CREATE INDEX patient_session_notes_patient_date_idx
  ON public.patient_session_notes (patient_id, created_at DESC);
CREATE INDEX patient_session_notes_clinic_idx
  ON public.patient_session_notes (clinic_id);
CREATE INDEX patient_session_notes_physio_idx
  ON public.patient_session_notes (physiotherapist_id);

CREATE OR REPLACE FUNCTION public.validate_patient_session_note()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clinics c
    JOIN public.clinic_patients cp ON cp.clinic_id = c.id
    JOIN public.appointments a ON a.id = NEW.appointment_id
    JOIN public.physiotherapists ap ON ap.id = a.physiotherapist_id
    WHERE c.id = NEW.clinic_id
      AND c.session_history_enabled
      AND c.session_notes_enabled
      AND cp.id = NEW.patient_id
      AND cp.clinic_id = NEW.clinic_id
      AND cp.keep_session_history
      AND ap.clinic_id = NEW.clinic_id
      AND a.status = 'COMPLETED'
      AND public.appointment_patient_key(a.client_id, a.client_email, a.client_phone) = cp.patient_key
  ) THEN
    RAISE EXCEPTION 'SESSION_HISTORY_NOT_ENABLED_OR_RELATIONSHIP_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_patient_session_note
  BEFORE INSERT OR UPDATE OF clinic_id, patient_id, appointment_id
  ON public.patient_session_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_patient_session_note();

CREATE TRIGGER trg_clinic_patients_updated
  BEFORE UPDATE ON public.clinic_patients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_patient_session_notes_updated
  BEFORE UPDATE ON public.patient_session_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_access_patient_history(
  target_clinic_id uuid,
  target_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships m
    WHERE m.clinic_id = target_clinic_id
      AND m.user_id = auth.uid()
      AND m.active
      AND (
        m.role = 'CLINIC_ADMIN'
        OR (
          m.role = 'PHYSIOTHERAPIST'
          AND EXISTS (
            SELECT 1
            FROM public.clinic_patients cp
            JOIN public.appointments a
              ON public.appointment_patient_key(a.client_id, a.client_email, a.client_phone) = cp.patient_key
            WHERE cp.id = target_patient_id
              AND cp.clinic_id = target_clinic_id
              AND a.physiotherapist_id = public.current_physio_id()
          )
        )
      )
  );
$$;

ALTER TABLE public.clinic_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_session_notes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.clinic_patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_session_notes TO authenticated;
GRANT ALL ON public.clinic_patients, public.patient_session_notes TO service_role;

CREATE POLICY clinic_patients_select ON public.clinic_patients
  FOR SELECT TO authenticated
  USING (
    public.is_clinic_admin(clinic_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.clinic_memberships m
        WHERE m.clinic_id = clinic_patients.clinic_id
          AND m.user_id = auth.uid()
          AND m.active
          AND m.role IN ('PHYSIOTHERAPIST', 'RECEPTIONIST')
      )
    )
  );

CREATE POLICY patient_session_notes_select ON public.patient_session_notes
  FOR SELECT TO authenticated
  USING (public.can_access_patient_history(clinic_id, patient_id));
CREATE POLICY patient_session_notes_insert ON public.patient_session_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    physiotherapist_id = public.current_physio_id()
    AND public.can_access_patient_history(clinic_id, patient_id)
  );
CREATE POLICY patient_session_notes_update ON public.patient_session_notes
  FOR UPDATE TO authenticated
  USING (
    physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_admin(clinic_id)
  )
  WITH CHECK (
    physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_admin(clinic_id)
  );
CREATE POLICY patient_session_notes_delete ON public.patient_session_notes
  FOR DELETE TO authenticated
  USING (
    physiotherapist_id = public.current_physio_id()
    OR public.is_clinic_admin(clinic_id)
  );

CREATE OR REPLACE FUNCTION public.set_clinic_session_history_settings(
  target_clinic_id uuid,
  history_enabled boolean,
  notes_enabled boolean
)
RETURNS public.clinics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.clinics;
BEGIN
  IF NOT public.is_clinic_admin(target_clinic_id) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_REQUIRED';
  END IF;
  IF NOT history_enabled AND notes_enabled THEN
    RAISE EXCEPTION 'SESSION_HISTORY_REQUIRED_FOR_NOTES';
  END IF;
  UPDATE public.clinics
  SET session_history_enabled = history_enabled,
      session_notes_enabled = notes_enabled,
      updated_at = now()
  WHERE id = target_clinic_id
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_patient_session_history(
  target_patient_id uuid,
  keep_history boolean
)
RETURNS public.clinic_patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result public.clinic_patients;
DECLARE target_clinic_id uuid;
BEGIN
  SELECT clinic_id INTO target_clinic_id
  FROM public.clinic_patients WHERE id = target_patient_id;
  IF NOT public.can_access_patient_history(target_clinic_id, target_patient_id) THEN
    RAISE EXCEPTION 'PATIENT_HISTORY_ACCESS_DENIED';
  END IF;
  IF keep_history AND NOT EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE c.id = target_clinic_id AND c.session_history_enabled
  ) THEN
    RAISE EXCEPTION 'CLINIC_SESSION_HISTORY_DISABLED';
  END IF;
  UPDATE public.clinic_patients
  SET keep_session_history = keep_history, updated_at = now()
  WHERE id = target_patient_id
  RETURNING * INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.appointment_patient_key(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sync_appointment_clinic_patient() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_patient_session_note() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_patient_history(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_clinic_session_history_settings(uuid,boolean,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_patient_session_history(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_patient_key(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_patient_history(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_clinic_session_history_settings(uuid,boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_patient_session_history(uuid,boolean) TO authenticated, service_role;

COMMENT ON TABLE public.clinic_patients IS
  'Tenant patient directory synchronized from appointment identity snapshots; not a replacement booking model.';
COMMENT ON TABLE public.patient_session_notes IS
  'Optional lightweight physiotherapy session notes linked to completed appointments.';

