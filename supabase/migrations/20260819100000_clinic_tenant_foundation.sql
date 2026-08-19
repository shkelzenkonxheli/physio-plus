-- Phase 1: additive clinic tenant foundation.
-- This migration intentionally does not change booking, availability, services,
-- appointments, public profiles, or existing physiotherapist-owned schedules.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'clinic_role'
  ) THEN
    CREATE TYPE public.clinic_role AS ENUM (
      'CLINIC_ADMIN',
      'PHYSIOTHERAPIST',
      'RECEPTIONIST'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.clinic_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.clinic_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_memberships_clinic_user_role_key UNIQUE (clinic_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS clinic_memberships_clinic_idx
  ON public.clinic_memberships (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_memberships_user_idx
  ON public.clinic_memberships (user_id);
CREATE INDEX IF NOT EXISTS clinic_memberships_role_idx
  ON public.clinic_memberships (role);
CREATE INDEX IF NOT EXISTS clinic_memberships_active_clinic_idx
  ON public.clinic_memberships (clinic_id, active);

ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_memberships TO authenticated;
GRANT ALL ON public.clinic_memberships TO service_role;

DROP TRIGGER IF EXISTS trg_clinic_memberships_updated ON public.clinic_memberships;
CREATE TRIGGER trg_clinic_memberships_updated
  BEFORE UPDATE ON public.clinic_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.clinic_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  phone text,
  latitude double precision,
  longitude double precision,
  timezone text NOT NULL DEFAULT 'Europe/Pristina',
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_locations_timezone_not_empty CHECK (length(trim(timezone)) > 0)
);

CREATE INDEX IF NOT EXISTS clinic_locations_clinic_idx
  ON public.clinic_locations (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_locations_city_idx
  ON public.clinic_locations (city_id);
CREATE INDEX IF NOT EXISTS clinic_locations_region_idx
  ON public.clinic_locations (region_id);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_locations_one_default_idx
  ON public.clinic_locations (clinic_id)
  WHERE is_default;

ALTER TABLE public.clinic_locations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_locations TO authenticated;
GRANT ALL ON public.clinic_locations TO service_role;

DROP TRIGGER IF EXISTS trg_clinic_locations_updated ON public.clinic_locations;
CREATE TRIGGER trg_clinic_locations_updated
  BEFORE UPDATE ON public.clinic_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tenant authorization helpers. These functions expose only a boolean decision.
CREATE OR REPLACE FUNCTION public.is_clinic_member(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_clinic_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.clinic_memberships m
      WHERE m.clinic_id = target_clinic_id
        AND m.user_id = auth.uid()
        AND m.active
    );
$$;

CREATE OR REPLACE FUNCTION public.is_clinic_admin(target_clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_clinic_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.clinic_memberships m
      WHERE m.clinic_id = target_clinic_id
        AND m.user_id = auth.uid()
        AND m.role = 'CLINIC_ADMIN'
        AND m.active
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_clinic_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_clinic_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin(uuid) TO authenticated, service_role;

-- Memberships are visible only to active members of that clinic or platform admins.
DROP POLICY IF EXISTS clinic_memberships_select ON public.clinic_memberships;
CREATE POLICY clinic_memberships_select ON public.clinic_memberships
  FOR SELECT TO authenticated
  USING (
    public.is_clinic_member(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_memberships_insert ON public.clinic_memberships;
CREATE POLICY clinic_memberships_insert ON public.clinic_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_memberships_update ON public.clinic_memberships;
CREATE POLICY clinic_memberships_update ON public.clinic_memberships
  FOR UPDATE TO authenticated
  USING (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_memberships_delete ON public.clinic_memberships;
CREATE POLICY clinic_memberships_delete ON public.clinic_memberships
  FOR DELETE TO authenticated
  USING (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

-- Locations are private tenant data in Phase 1. Public clinic pages are unchanged.
DROP POLICY IF EXISTS clinic_locations_select ON public.clinic_locations;
CREATE POLICY clinic_locations_select ON public.clinic_locations
  FOR SELECT TO authenticated
  USING (
    public.is_clinic_member(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_locations_insert ON public.clinic_locations;
CREATE POLICY clinic_locations_insert ON public.clinic_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_locations_update ON public.clinic_locations;
CREATE POLICY clinic_locations_update ON public.clinic_locations
  FOR UPDATE TO authenticated
  USING (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS clinic_locations_delete ON public.clinic_locations;
CREATE POLICY clinic_locations_delete ON public.clinic_locations
  FOR DELETE TO authenticated
  USING (
    public.is_clinic_admin(clinic_id)
    OR public.is_admin(auth.uid())
  );

-- Prevent tenant ownership from being moved through an update.
CREATE OR REPLACE FUNCTION public.protect_clinic_tenant_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clinic_memberships' AND NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'CLINIC_MEMBERSHIP_CLINIC_IMMUTABLE';
  END IF;

  IF TG_TABLE_NAME = 'clinic_locations' AND NEW.clinic_id IS DISTINCT FROM OLD.clinic_id THEN
    RAISE EXCEPTION 'CLINIC_LOCATION_CLINIC_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clinic_membership_tenant_immutable ON public.clinic_memberships;
CREATE TRIGGER trg_clinic_membership_tenant_immutable
  BEFORE UPDATE ON public.clinic_memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_tenant_ownership();

DROP TRIGGER IF EXISTS trg_clinic_location_tenant_immutable ON public.clinic_locations;
CREATE TRIGGER trg_clinic_location_tenant_immutable
  BEFORE UPDATE ON public.clinic_locations
  FOR EACH ROW EXECUTE FUNCTION public.protect_clinic_tenant_ownership();

-- Ensure a location's city and region remain consistent with the existing catalog.
CREATE OR REPLACE FUNCTION public.validate_clinic_location_region()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.city_id IS NOT NULL AND NEW.region_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.cities c
       WHERE c.id = NEW.city_id AND c.region_id = NEW.region_id
     ) THEN
    RAISE EXCEPTION 'CLINIC_LOCATION_CITY_REGION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_clinic_location_region ON public.clinic_locations;
CREATE TRIGGER trg_validate_clinic_location_region
  BEFORE INSERT OR UPDATE ON public.clinic_locations
  FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_location_region();

-- Controlled, idempotent backfill for existing physiotherapists.
-- Existing clinic-linked physiotherapists keep their clinic. Unlinked physiotherapists
-- receive a private personal clinic and one CLINIC_ADMIN membership.
DO $$
BEGIN
  ALTER TABLE public.physiotherapists DISABLE TRIGGER trg_protect_physio_owner_fields;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DO $$
DECLARE
  p record;
  target_clinic_id uuid;
  clinic_name text;
  location_name text;
  had_existing_clinic boolean;
BEGIN
  FOR p IN
    SELECT id, user_id, clinic_id, first_name, last_name, phone,
           address, city_id, region_id
    FROM public.physiotherapists
    ORDER BY id
  LOOP
    had_existing_clinic := p.clinic_id IS NOT NULL;
    target_clinic_id := p.clinic_id;

    IF target_clinic_id IS NULL THEN
      clinic_name := NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '');
      IF clinic_name IS NULL THEN
        clinic_name := 'Klinika e fizioterapeutit';
      END IF;

      INSERT INTO public.clinics (
        name, slug, region_id, city_id, address, phone, active
      )
      VALUES (
        clinic_name,
        public.generate_unique_clinic_slug(clinic_name, NULL::uuid),
        p.region_id,
        p.city_id,
        p.address,
        p.phone,
        false
      )
      RETURNING id INTO target_clinic_id;

      -- This is the existing nullable compatibility link. It does not replace
      -- the practitioner identity or the new membership relationship.
      UPDATE public.physiotherapists
      SET clinic_id = target_clinic_id
      WHERE id = p.id AND clinic_id IS NULL;
    ELSE
      IF NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = target_clinic_id) THEN
        RAISE NOTICE 'Skipped physiotherapist %: referenced clinic % does not exist', p.id, target_clinic_id;
        CONTINUE;
      END IF;
    END IF;

    IF had_existing_clinic THEN
      INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
      VALUES (target_clinic_id, p.user_id, 'PHYSIOTHERAPIST')
      ON CONFLICT (clinic_id, user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.clinic_memberships (clinic_id, user_id, role)
      VALUES (target_clinic_id, p.user_id, 'CLINIC_ADMIN')
      ON CONFLICT (clinic_id, user_id, role) DO NOTHING;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.clinic_locations l
      WHERE l.clinic_id = target_clinic_id AND l.is_default
    ) THEN
      SELECT COALESCE(NULLIF(trim(c.name), ''), 'Lokacioni kryesor')
      INTO location_name
      FROM public.cities c
      WHERE c.id = p.city_id;

      INSERT INTO public.clinic_locations (
        clinic_id, name, address, city_id, region_id, phone,
        timezone, active, is_default
      )
      SELECT
        target_clinic_id,
        COALESCE(location_name, 'Lokacioni kryesor'),
        CASE WHEN had_existing_clinic THEN c.address ELSE p.address END,
        CASE WHEN had_existing_clinic THEN c.city_id ELSE p.city_id END,
        CASE WHEN had_existing_clinic THEN c.region_id ELSE p.region_id END,
        CASE WHEN had_existing_clinic THEN c.phone ELSE p.phone END,
        'Europe/Pristina',
        true,
        true
      FROM public.clinics c
      WHERE c.id = target_clinic_id;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE public.physiotherapists ENABLE TRIGGER trg_protect_physio_owner_fields;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

COMMENT ON TABLE public.clinic_memberships IS
  'Tenant membership and clinic-level roles. Platform roles remain in user_roles.';
COMMENT ON TABLE public.clinic_locations IS
  'Private clinic locations. Public clinic profile behavior is unchanged in Phase 1.';
