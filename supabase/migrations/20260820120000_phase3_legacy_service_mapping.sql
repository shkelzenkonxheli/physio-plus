-- Phase 3: deterministic legacy -> clinic service mapping and compatibility sync.
-- Legacy tables and all booking RPCs/constraints remain unchanged.

CREATE TABLE public.legacy_service_category_mappings (
  legacy_category_id uuid PRIMARY KEY,
  clinic_category_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  physiotherapist_id uuid NOT NULL,
  source_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_category_mapping_target_unique UNIQUE (clinic_category_id),
  CONSTRAINT legacy_category_mapping_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT legacy_category_mapping_target_clinic_fkey
    FOREIGN KEY (clinic_category_id, clinic_id)
    REFERENCES public.clinic_service_categories(id, clinic_id) ON DELETE CASCADE
);

CREATE INDEX legacy_category_mappings_clinic_idx
  ON public.legacy_service_category_mappings(clinic_id);
CREATE INDEX legacy_category_mappings_physio_idx
  ON public.legacy_service_category_mappings(physiotherapist_id);

CREATE TABLE public.legacy_service_mappings (
  legacy_service_id uuid PRIMARY KEY,
  clinic_service_id uuid NOT NULL,
  legacy_category_id uuid,
  clinic_category_id uuid,
  clinic_id uuid NOT NULL,
  physiotherapist_id uuid NOT NULL,
  source_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legacy_service_mapping_target_unique UNIQUE (clinic_service_id),
  CONSTRAINT legacy_service_mapping_physio_clinic_fkey
    FOREIGN KEY (physiotherapist_id, clinic_id)
    REFERENCES public.physiotherapists(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT legacy_service_mapping_target_clinic_fkey
    FOREIGN KEY (clinic_service_id, clinic_id)
    REFERENCES public.clinic_services(id, clinic_id) ON DELETE CASCADE,
  CONSTRAINT legacy_service_mapping_category_clinic_fkey
    FOREIGN KEY (clinic_category_id, clinic_id)
    REFERENCES public.clinic_service_categories(id, clinic_id) ON DELETE SET NULL (clinic_category_id),
  CONSTRAINT legacy_service_mapping_category_pair CHECK (
    (legacy_category_id IS NULL) = (clinic_category_id IS NULL)
  )
);

CREATE INDEX legacy_service_mappings_clinic_idx
  ON public.legacy_service_mappings(clinic_id);
CREATE INDEX legacy_service_mappings_physio_idx
  ON public.legacy_service_mappings(physiotherapist_id);
CREATE INDEX legacy_service_mappings_category_idx
  ON public.legacy_service_mappings(legacy_category_id)
  WHERE legacy_category_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_legacy_service_mapping_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'legacy_service_category_mappings' THEN
    IF NEW.source_deleted_at IS NULL AND NOT EXISTS (
      SELECT 1
      FROM public.service_categories sc
      JOIN public.physiotherapists p ON p.id = sc.physiotherapist_id
      WHERE sc.id = NEW.legacy_category_id
        AND sc.physiotherapist_id = NEW.physiotherapist_id
        AND p.clinic_id = NEW.clinic_id
    ) THEN
      RAISE EXCEPTION 'LEGACY_CATEGORY_MAPPING_SOURCE_MISMATCH';
    END IF;
  ELSE
    IF NEW.source_deleted_at IS NULL AND NOT EXISTS (
      SELECT 1
      FROM public.services s
      JOIN public.physiotherapists p ON p.id = s.physiotherapist_id
      WHERE s.id = NEW.legacy_service_id
        AND s.physiotherapist_id = NEW.physiotherapist_id
        AND p.clinic_id = NEW.clinic_id
        AND s.category_id IS NOT DISTINCT FROM NEW.legacy_category_id
    ) THEN
      RAISE EXCEPTION 'LEGACY_SERVICE_MAPPING_SOURCE_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_legacy_category_mapping
  BEFORE INSERT OR UPDATE ON public.legacy_service_category_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_legacy_service_mapping_source();
CREATE TRIGGER trg_validate_legacy_service_mapping
  BEFORE INSERT OR UPDATE ON public.legacy_service_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_legacy_service_mapping_source();

CREATE TRIGGER trg_legacy_category_mapping_updated
  BEFORE UPDATE ON public.legacy_service_category_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_legacy_service_mapping_updated
  BEFORE UPDATE ON public.legacy_service_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_legacy_service_category(target_legacy_category_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_row public.service_categories;
  target_clinic_id uuid;
  target_category_id uuid;
  existing_mapping public.legacy_service_category_mappings;
BEGIN
  SELECT * INTO source_row
  FROM public.service_categories
  WHERE id = target_legacy_category_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT clinic_id INTO target_clinic_id
  FROM public.physiotherapists
  WHERE id = source_row.physiotherapist_id;
  IF target_clinic_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO existing_mapping
  FROM public.legacy_service_category_mappings
  WHERE legacy_category_id = source_row.id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_mapping.clinic_id <> target_clinic_id
       OR existing_mapping.physiotherapist_id <> source_row.physiotherapist_id THEN
      RAISE EXCEPTION 'LEGACY_CATEGORY_MAPPING_TENANT_IMMUTABLE';
    END IF;
    UPDATE public.clinic_service_categories
    SET name = source_row.name,
        description = source_row.description,
        sort_order = source_row.sort_order,
        active = source_row.active,
        created_at = least(created_at, source_row.created_at),
        updated_at = source_row.updated_at
    WHERE id = existing_mapping.clinic_category_id
      AND clinic_id = target_clinic_id
    RETURNING id INTO target_category_id;

    IF target_category_id IS NULL THEN
      DELETE FROM public.legacy_service_category_mappings
      WHERE legacy_category_id = source_row.id;
    ELSE
      UPDATE public.legacy_service_category_mappings
      SET source_deleted_at = NULL
      WHERE legacy_category_id = source_row.id;
      RETURN target_category_id;
    END IF;
  END IF;

  INSERT INTO public.clinic_service_categories (
    clinic_id, name, description, sort_order, active, created_at, updated_at
  ) VALUES (
    target_clinic_id, source_row.name, source_row.description, source_row.sort_order,
    source_row.active, source_row.created_at, source_row.updated_at
  ) RETURNING id INTO target_category_id;

  INSERT INTO public.legacy_service_category_mappings (
    legacy_category_id, clinic_category_id, clinic_id, physiotherapist_id
  ) VALUES (
    source_row.id, target_category_id, target_clinic_id, source_row.physiotherapist_id
  );
  RETURN target_category_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_legacy_service(target_legacy_service_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_row public.services;
  target_clinic_id uuid;
  target_category_id uuid;
  target_service_id uuid;
  existing_mapping public.legacy_service_mappings;
BEGIN
  SELECT * INTO source_row
  FROM public.services
  WHERE id = target_legacy_service_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT clinic_id INTO target_clinic_id
  FROM public.physiotherapists
  WHERE id = source_row.physiotherapist_id;
  IF target_clinic_id IS NULL THEN RETURN NULL; END IF;

  IF source_row.category_id IS NOT NULL THEN
    target_category_id := public.sync_legacy_service_category(source_row.category_id);
    IF target_category_id IS NULL THEN RETURN NULL; END IF;
  END IF;

  SELECT * INTO existing_mapping
  FROM public.legacy_service_mappings
  WHERE legacy_service_id = source_row.id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_mapping.clinic_id <> target_clinic_id
       OR existing_mapping.physiotherapist_id <> source_row.physiotherapist_id THEN
      RAISE EXCEPTION 'LEGACY_SERVICE_MAPPING_TENANT_IMMUTABLE';
    END IF;
    UPDATE public.clinic_services
    SET category_id = target_category_id,
        name = source_row.name,
        description = source_row.description,
        price = source_row.price,
        currency = source_row.currency,
        duration_minutes = source_row.duration_minutes,
        active = source_row.active,
        created_at = least(created_at, source_row.created_at),
        updated_at = source_row.updated_at
    WHERE id = existing_mapping.clinic_service_id
      AND clinic_id = target_clinic_id
    RETURNING id INTO target_service_id;

    IF target_service_id IS NULL THEN
      DELETE FROM public.legacy_service_mappings
      WHERE legacy_service_id = source_row.id;
    ELSE
      UPDATE public.legacy_service_mappings
      SET legacy_category_id = source_row.category_id,
          clinic_category_id = target_category_id,
          source_deleted_at = NULL
      WHERE legacy_service_id = source_row.id;
    END IF;
  END IF;

  IF target_service_id IS NULL THEN
    INSERT INTO public.clinic_services (
      clinic_id, category_id, name, description, price, currency,
      duration_minutes, active, created_at, updated_at
    ) VALUES (
      target_clinic_id, target_category_id, source_row.name, source_row.description,
      source_row.price, source_row.currency, source_row.duration_minutes,
      source_row.active, source_row.created_at, source_row.updated_at
    ) RETURNING id INTO target_service_id;

    INSERT INTO public.legacy_service_mappings (
      legacy_service_id, clinic_service_id, legacy_category_id,
      clinic_category_id, clinic_id, physiotherapist_id
    ) VALUES (
      source_row.id, target_service_id, source_row.category_id,
      target_category_id, target_clinic_id, source_row.physiotherapist_id
    );
  END IF;

  INSERT INTO public.physiotherapist_services (
    clinic_id, physiotherapist_id, clinic_service_id, active
  ) VALUES (
    target_clinic_id, source_row.physiotherapist_id, target_service_id, source_row.active
  )
  ON CONFLICT (clinic_id, physiotherapist_id, clinic_service_id)
  DO UPDATE SET active = EXCLUDED.active;

  RETURN target_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_all_legacy_services()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row_id uuid;
BEGIN
  FOR row_id IN SELECT id FROM public.service_categories ORDER BY created_at, id LOOP
    PERFORM public.sync_legacy_service_category(row_id);
  END LOOP;
  FOR row_id IN SELECT id FROM public.services ORDER BY created_at, id LOOP
    PERFORM public.sync_legacy_service(row_id);
  END LOOP;
  RETURN jsonb_build_object(
    'legacy_categories', (SELECT count(*) FROM public.service_categories),
    'mapped_categories', (SELECT count(*) FROM public.legacy_service_category_mappings WHERE source_deleted_at IS NULL),
    'legacy_services', (SELECT count(*) FROM public.services),
    'mapped_services', (SELECT count(*) FROM public.legacy_service_mappings WHERE source_deleted_at IS NULL),
    'assignments', (SELECT count(*) FROM public.physiotherapist_services)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_legacy_service_category_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_legacy_service_category(NEW.id);
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_legacy_service_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_legacy_service(NEW.id);
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_legacy_service_category_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinic_service_categories c
  SET active = false
  FROM public.legacy_service_category_mappings m
  WHERE m.legacy_category_id = OLD.id
    AND c.id = m.clinic_category_id
    AND c.clinic_id = m.clinic_id;
  UPDATE public.legacy_service_category_mappings
  SET source_deleted_at = now()
  WHERE legacy_category_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_legacy_service_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinic_services c
  SET active = false
  FROM public.legacy_service_mappings m
  WHERE m.legacy_service_id = OLD.id
    AND c.id = m.clinic_service_id
    AND c.clinic_id = m.clinic_id;
  UPDATE public.physiotherapist_services ps
  SET active = false
  FROM public.legacy_service_mappings m
  WHERE m.legacy_service_id = OLD.id
    AND ps.clinic_id = m.clinic_id
    AND ps.physiotherapist_id = m.physiotherapist_id
    AND ps.clinic_service_id = m.clinic_service_id;
  UPDATE public.legacy_service_mappings
  SET source_deleted_at = now()
  WHERE legacy_service_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_sync_legacy_category_write
  AFTER INSERT OR UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_service_category_write();
CREATE TRIGGER trg_sync_legacy_service_write
  AFTER INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_service_write();
CREATE TRIGGER trg_sync_legacy_category_delete
  BEFORE DELETE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_service_category_delete();
CREATE TRIGGER trg_sync_legacy_service_delete
  BEFORE DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_service_delete();

ALTER TABLE public.legacy_service_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_service_mappings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.legacy_service_category_mappings, public.legacy_service_mappings TO authenticated;
GRANT ALL ON public.legacy_service_category_mappings, public.legacy_service_mappings TO service_role;
CREATE POLICY legacy_category_mappings_admin_read ON public.legacy_service_category_mappings
  FOR SELECT TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));
CREATE POLICY legacy_service_mappings_admin_read ON public.legacy_service_mappings
  FOR SELECT TO authenticated
  USING (public.is_clinic_admin(clinic_id) OR public.is_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.validate_legacy_service_mapping_source() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service_category(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_all_legacy_services() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service_category_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service_category_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_service_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_all_legacy_services() TO service_role;

SELECT public.sync_all_legacy_services();

COMMENT ON TABLE public.legacy_service_category_mappings IS
  'Auditable one-to-one Phase 3 mapping from legacy physiotherapist category to clinic category.';
COMMENT ON TABLE public.legacy_service_mappings IS
  'Auditable one-to-one Phase 3 mapping from legacy physiotherapist service to clinic service.';

