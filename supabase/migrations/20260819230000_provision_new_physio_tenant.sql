-- Provision a tenant for every newly-created physiotherapist.
-- Existing physiotherapists were handled by the Phase 1 backfill. This trigger
-- covers ongoing registration without changing legacy booking ownership.

CREATE OR REPLACE FUNCTION public.provision_physio_clinic_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_clinic_id uuid;
  clinic_name text;
  location_name text;
BEGIN
  target_clinic_id := NEW.clinic_id;

  IF target_clinic_id IS NULL THEN
    clinic_name := NULLIF(trim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');
    clinic_name := COALESCE(clinic_name, 'Klinika e fizioterapeutit');

    INSERT INTO public.clinics (
      name,
      slug,
      region_id,
      city_id,
      address,
      phone,
      active,
      public_listing_enabled
    )
    VALUES (
      clinic_name,
      public.generate_unique_clinic_slug(clinic_name, NULL::uuid),
      NEW.region_id,
      NEW.city_id,
      NEW.address,
      NEW.phone,
      false,
      false
    )
    RETURNING id INTO target_clinic_id;

    NEW.clinic_id := target_clinic_id;

    INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active)
    VALUES (target_clinic_id, NEW.user_id, 'CLINIC_ADMIN', true)
    ON CONFLICT (clinic_id, user_id, role) DO UPDATE SET active = true;

    SELECT COALESCE(NULLIF(trim(c.name), ''), 'Lokacioni kryesor')
    INTO location_name
    FROM public.cities c
    WHERE c.id = NEW.city_id;

    INSERT INTO public.clinic_locations (
      clinic_id,
      name,
      address,
      city_id,
      region_id,
      phone,
      timezone,
      active,
      is_default
    )
    VALUES (
      target_clinic_id,
      COALESCE(location_name, 'Lokacioni kryesor'),
      NEW.address,
      NEW.city_id,
      NEW.region_id,
      NEW.phone,
      'Europe/Pristina',
      true,
      true
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.clinics c WHERE c.id = target_clinic_id
    ) THEN
      RAISE EXCEPTION 'PHYSIOTHERAPIST_CLINIC_NOT_FOUND';
    END IF;

    INSERT INTO public.clinic_memberships (clinic_id, user_id, role, active)
    VALUES (target_clinic_id, NEW.user_id, 'PHYSIOTHERAPIST', true)
    ON CONFLICT (clinic_id, user_id, role) DO UPDATE SET active = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_physio_clinic_tenant
  ON public.physiotherapists;
CREATE TRIGGER trg_provision_physio_clinic_tenant
  BEFORE INSERT ON public.physiotherapists
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_physio_clinic_tenant();

REVOKE EXECUTE ON FUNCTION public.provision_physio_clinic_tenant()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.provision_physio_clinic_tenant() IS
  'Creates a private personal clinic, CLINIC_ADMIN membership, and default location for each new standalone physiotherapist.';
