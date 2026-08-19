-- Phase 2: tenant service and staff foundation.
-- Additive only: legacy services/schedules and booking objects are untouched.

-- Separate tenant operation from public discovery without changing current behavior.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS public_listing_enabled boolean NOT NULL DEFAULT false;

UPDATE public.clinics
SET public_listing_enabled = active
WHERE public_listing_enabled IS DISTINCT FROM active;

COMMENT ON COLUMN public.clinics.active IS
  'Whether the tenant account is operational. Existing public queries continue to use this field until a later approved phase.';
COMMENT ON COLUMN public.clinics.public_listing_enabled IS
  'Whether the clinic may be publicly listed. Backfilled from active; not wired into public queries in Phase 2.';

-- Composite candidate keys allow foreign keys to prove tenant ownership.
CREATE UNIQUE INDEX IF NOT EXISTS physiotherapists_id_clinic_key
  ON public.physiotherapists (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_service_categories_id_clinic_key
  ON public.clinic_service_categories (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_services_id_clinic_key
  ON public.clinic_services (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_locations_id_clinic_key
  ON public.clinic_locations (id, clinic_id);

-- Refuse to harden inconsistent pre-existing clinic service data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clinic_services s
    JOIN public.clinic_service_categories c ON c.id = s.category_id
    WHERE c.clinic_id <> s.clinic_id
  ) THEN
    RAISE EXCEPTION 'PHASE_2_ABORTED: clinic service/category tenant mismatch exists';
  END IF;
END $$;

-- A service category, when present, must belong to the service's clinic.
ALTER TABLE public.clinic_services
  DROP CONSTRAINT IF EXISTS clinic_services_category_id_fkey;
ALTER TABLE public.clinic_services
  ADD CONSTRAINT clinic_services_category_clinic_fkey
  FOREIGN KEY (category_id, clinic_id)
  REFERENCES public.clinic_service_categories (id, clinic_id)
  ON DELETE SET NULL (category_id);

ALTER TABLE public.clinic_services
  DROP CONSTRAINT IF EXISTS clinic_services_duration_valid;
ALTER TABLE public.clinic_services
  ADD CONSTRAINT clinic_services_duration_valid
  CHECK (duration_minutes > 0 AND duration_minutes <= 480);

ALTER TABLE public.clinic_services
  DROP CONSTRAINT IF EXISTS clinic_services_price_nonnegative;
ALTER TABLE public.clinic_services
  ADD CONSTRAINT clinic_services_price_nonnegative CHECK (price >= 0);

-- Clinic service assignments. No legacy service rows are copied in Phase 2.
CREATE TABLE public.physiotherapist_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  physiotherapist_id uuid NOT NULL,
  clinic_service_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physiotherapist_services_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT physiotherapist_services_service_clinic_fkey
    FOREIGN KEY (clinic_service_id, clinic_id)
    REFERENCES public.clinic_services (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT physiotherapist_services_unique
    UNIQUE (clinic_id, physiotherapist_id, clinic_service_id)
);

CREATE INDEX physiotherapist_services_physio_idx
  ON public.physiotherapist_services (physiotherapist_id);
CREATE INDEX physiotherapist_services_service_idx
  ON public.physiotherapist_services (clinic_service_id);
CREATE INDEX physiotherapist_services_active_clinic_idx
  ON public.physiotherapist_services (clinic_id, active);

-- Explicit location assignments. No assumption is made that all staff work at
-- all locations, and no default-location assignment is backfilled.
CREATE TABLE public.physiotherapist_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  physiotherapist_id uuid NOT NULL,
  clinic_location_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physiotherapist_locations_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT physiotherapist_locations_location_clinic_fkey
    FOREIGN KEY (clinic_location_id, clinic_id)
    REFERENCES public.clinic_locations (id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT physiotherapist_locations_unique
    UNIQUE (clinic_id, physiotherapist_id, clinic_location_id)
);

CREATE INDEX physiotherapist_locations_physio_idx
  ON public.physiotherapist_locations (physiotherapist_id);
CREATE INDEX physiotherapist_locations_location_idx
  ON public.physiotherapist_locations (clinic_location_id);
CREATE INDEX physiotherapist_locations_active_clinic_idx
  ON public.physiotherapist_locations (clinic_id, active);

-- An assignment also requires an active tenant membership for the physio user.
CREATE OR REPLACE FUNCTION public.validate_physio_clinic_assignment_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.physiotherapists p
    JOIN public.clinic_memberships m
      ON m.user_id = p.user_id
     AND m.clinic_id = NEW.clinic_id
     AND m.active
    WHERE p.id = NEW.physiotherapist_id
      AND p.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'PHYSIOTHERAPIST_ACTIVE_CLINIC_MEMBERSHIP_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_physio_service_membership ON public.physiotherapist_services;
CREATE TRIGGER trg_physio_service_membership
  BEFORE INSERT OR UPDATE OF clinic_id, physiotherapist_id
  ON public.physiotherapist_services
  FOR EACH ROW EXECUTE FUNCTION public.validate_physio_clinic_assignment_membership();

DROP TRIGGER IF EXISTS trg_physio_location_membership ON public.physiotherapist_locations;
CREATE TRIGGER trg_physio_location_membership
  BEFORE INSERT OR UPDATE OF clinic_id, physiotherapist_id
  ON public.physiotherapist_locations
  FOR EACH ROW EXECUTE FUNCTION public.validate_physio_clinic_assignment_membership();

-- Do not allow the final active membership backing an assignment to be removed
-- or deactivated while assignments still exist.
CREATE OR REPLACE FUNCTION public.protect_assigned_physio_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  physio_id uuid;
BEGIN
  IF OLD.active AND TG_OP = 'DELETE' THEN
    SELECT p.id INTO physio_id
    FROM public.physiotherapists p
    WHERE p.user_id = OLD.user_id
      AND p.clinic_id = OLD.clinic_id;

    IF physio_id IS NOT NULL
       AND (
         EXISTS (
           SELECT 1 FROM public.physiotherapist_services ps
           WHERE ps.clinic_id = OLD.clinic_id
             AND ps.physiotherapist_id = physio_id
         )
         OR EXISTS (
           SELECT 1 FROM public.physiotherapist_locations pl
           WHERE pl.clinic_id = OLD.clinic_id
             AND pl.physiotherapist_id = physio_id
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.clinic_memberships m
         WHERE m.clinic_id = OLD.clinic_id
           AND m.user_id = OLD.user_id
           AND m.active
           AND m.id <> OLD.id
       ) THEN
      RAISE EXCEPTION 'ASSIGNED_PHYSIOTHERAPIST_MEMBERSHIP_REQUIRED';
    END IF;
  END IF;

  IF OLD.active AND TG_OP = 'UPDATE' AND NOT NEW.active THEN
    SELECT p.id INTO physio_id
    FROM public.physiotherapists p
    WHERE p.user_id = OLD.user_id
      AND p.clinic_id = OLD.clinic_id;

    IF physio_id IS NOT NULL
       AND (
         EXISTS (
           SELECT 1 FROM public.physiotherapist_services ps
           WHERE ps.clinic_id = OLD.clinic_id
             AND ps.physiotherapist_id = physio_id
         )
         OR EXISTS (
           SELECT 1 FROM public.physiotherapist_locations pl
           WHERE pl.clinic_id = OLD.clinic_id
             AND pl.physiotherapist_id = physio_id
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.clinic_memberships m
         WHERE m.clinic_id = OLD.clinic_id
           AND m.user_id = OLD.user_id
           AND m.active
           AND m.id <> OLD.id
       ) THEN
      RAISE EXCEPTION 'ASSIGNED_PHYSIOTHERAPIST_MEMBERSHIP_REQUIRED';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_assigned_physio_membership ON public.clinic_memberships;
CREATE TRIGGER trg_protect_assigned_physio_membership
  BEFORE DELETE OR UPDATE OF active ON public.clinic_memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_assigned_physio_membership();

DROP TRIGGER IF EXISTS trg_physiotherapist_services_updated ON public.physiotherapist_services;
CREATE TRIGGER trg_physiotherapist_services_updated
  BEFORE UPDATE ON public.physiotherapist_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_physiotherapist_locations_updated ON public.physiotherapist_locations;
CREATE TRIGGER trg_physiotherapist_locations_updated
  BEFORE UPDATE ON public.physiotherapist_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant ownership cannot be moved after insert.
CREATE OR REPLACE FUNCTION public.protect_phase2_assignment_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'ASSIGNMENT_CLINIC_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_physio_service_tenant_immutable
  BEFORE UPDATE OF clinic_id ON public.physiotherapist_services
  FOR EACH ROW EXECUTE FUNCTION public.protect_phase2_assignment_tenant();
CREATE TRIGGER trg_physio_location_tenant_immutable
  BEFORE UPDATE OF clinic_id ON public.physiotherapist_locations
  FOR EACH ROW EXECUTE FUNCTION public.protect_phase2_assignment_tenant();

-- RLS: assignments are private tenant data. Members may read; only clinic or
-- platform admins may mutate them.
ALTER TABLE public.physiotherapist_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physiotherapist_locations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.physiotherapist_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.physiotherapist_locations TO authenticated;
GRANT ALL ON public.physiotherapist_services TO service_role;
GRANT ALL ON public.physiotherapist_locations TO service_role;

CREATE POLICY physiotherapist_services_select ON public.physiotherapist_services
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_services_insert ON public.physiotherapist_services
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_services_update ON public.physiotherapist_services
  FOR UPDATE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_services_delete ON public.physiotherapist_services
  FOR DELETE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

CREATE POLICY physiotherapist_locations_select ON public.physiotherapist_locations
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_locations_insert ON public.physiotherapist_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_locations_update ON public.physiotherapist_locations
  FOR UPDATE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY physiotherapist_locations_delete ON public.physiotherapist_locations
  FOR DELETE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

-- Harden clinic-owned service configuration. Existing public visibility for
-- active clinics/services is preserved; private rows are tenant-isolated.
DROP POLICY IF EXISTS csc_public_read ON public.clinic_service_categories;
DROP POLICY IF EXISTS csc_admin_all ON public.clinic_service_categories;
CREATE POLICY csc_public_read ON public.clinic_service_categories
  FOR SELECT TO anon, authenticated
  USING (
    active
    AND EXISTS (
      SELECT 1 FROM public.clinics c
      WHERE c.id = clinic_id AND c.active
    )
  );
CREATE POLICY csc_tenant_read ON public.clinic_service_categories
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY csc_tenant_insert ON public.clinic_service_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY csc_tenant_update ON public.clinic_service_categories
  FOR UPDATE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY csc_tenant_delete ON public.clinic_service_categories
  FOR DELETE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS cs_public_read ON public.clinic_services;
DROP POLICY IF EXISTS cs_admin_all ON public.clinic_services;
CREATE POLICY cs_public_read ON public.clinic_services
  FOR SELECT TO anon, authenticated
  USING (
    active
    AND EXISTS (
      SELECT 1 FROM public.clinics c
      WHERE c.id = clinic_id AND c.active
    )
  );
CREATE POLICY cs_tenant_read ON public.clinic_services
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY cs_tenant_insert ON public.clinic_services
  FOR INSERT TO authenticated
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY cs_tenant_update ON public.clinic_services
  FOR UPDATE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()))
  WITH CHECK (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY cs_tenant_delete ON public.clinic_services
  FOR DELETE TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

-- Prevent changing ownership through updates. Category/service relationships
-- remain protected by the composite foreign key above.
CREATE OR REPLACE FUNCTION public.protect_clinic_service_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'CLINIC_SERVICE_TENANT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_service_category_tenant_immutable
  ON public.clinic_service_categories;
CREATE TRIGGER trg_clinic_service_category_tenant_immutable
  BEFORE UPDATE OF clinic_id ON public.clinic_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_service_tenant();

DROP TRIGGER IF EXISTS trg_clinic_service_tenant_immutable
  ON public.clinic_services;
CREATE TRIGGER trg_clinic_service_tenant_immutable
  BEFORE UPDATE OF clinic_id ON public.clinic_services
  FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_service_tenant();

DROP TRIGGER IF EXISTS trg_clinic_service_categories_updated
  ON public.clinic_service_categories;
CREATE TRIGGER trg_clinic_service_categories_updated
  BEFORE UPDATE ON public.clinic_service_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_clinic_services_updated ON public.clinic_services;
CREATE TRIGGER trg_clinic_services_updated
  BEFORE UPDATE ON public.clinic_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.physiotherapist_services IS
  'Tenant-safe assignment of clinic-owned services to physiotherapists. Legacy services are not migrated in Phase 2.';
COMMENT ON TABLE public.physiotherapist_locations IS
  'Explicit tenant-safe assignment of physiotherapists to clinic locations.';
