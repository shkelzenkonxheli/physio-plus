-- Clinic Panel service editor compatibility: create through the existing
-- legacy-to-clinic sync so public booking receives an immediately bookable
-- service with the exact configured duration.

CREATE OR REPLACE FUNCTION public.create_my_clinic_service_category(
  _clinic_id uuid,
  _name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  physio_id uuid := public.current_physio_id();
  legacy_id uuid;
  clinic_category_id uuid;
BEGIN
  IF physio_id IS NULL OR NOT public.is_clinic_admin(_clinic_id) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_PHYSIO_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.physiotherapists p
    WHERE p.id = physio_id AND p.clinic_id = _clinic_id
  ) THEN RAISE EXCEPTION 'PHYSIOTHERAPIST_CLINIC_MISMATCH'; END IF;
  IF length(trim(_name)) < 2 THEN RAISE EXCEPTION 'CATEGORY_NAME_REQUIRED'; END IF;

  INSERT INTO public.service_categories(physiotherapist_id,name,sort_order,active)
  VALUES(
    physio_id,
    trim(_name),
    (SELECT count(*) FROM public.service_categories WHERE physiotherapist_id=physio_id),
    true
  ) RETURNING id INTO legacy_id;

  SELECT m.clinic_category_id INTO clinic_category_id
  FROM public.legacy_service_category_mappings m
  WHERE m.legacy_category_id = legacy_id AND m.source_deleted_at IS NULL;
  IF clinic_category_id IS NULL THEN RAISE EXCEPTION 'CATEGORY_SYNC_FAILED'; END IF;
  RETURN clinic_category_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_clinic_service(
  _clinic_id uuid,
  _clinic_category_id uuid,
  _name text,
  _price numeric,
  _duration_minutes integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  physio_id uuid := public.current_physio_id();
  legacy_category_id uuid;
  legacy_service_id uuid;
  clinic_service_id uuid;
BEGIN
  IF physio_id IS NULL OR NOT public.is_clinic_admin(_clinic_id) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_PHYSIO_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.physiotherapists p
    WHERE p.id = physio_id AND p.clinic_id = _clinic_id
  ) THEN RAISE EXCEPTION 'PHYSIOTHERAPIST_CLINIC_MISMATCH'; END IF;
  IF length(trim(_name)) < 2 THEN RAISE EXCEPTION 'SERVICE_NAME_REQUIRED'; END IF;
  IF _price < 0 THEN RAISE EXCEPTION 'SERVICE_PRICE_INVALID'; END IF;
  IF _duration_minutes < 5 OR _duration_minutes > 480 THEN
    RAISE EXCEPTION 'SERVICE_DURATION_INVALID';
  END IF;

  IF _clinic_category_id IS NOT NULL THEN
    SELECT m.legacy_category_id INTO legacy_category_id
    FROM public.legacy_service_category_mappings m
    WHERE m.clinic_category_id = _clinic_category_id
      AND m.clinic_id = _clinic_id
      AND m.physiotherapist_id = physio_id
      AND m.source_deleted_at IS NULL;
    IF legacy_category_id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_AVAILABLE_FOR_PHYSIO'; END IF;
  END IF;

  INSERT INTO public.services(
    physiotherapist_id,category_id,name,price,currency,duration_minutes,active
  ) VALUES(
    physio_id,legacy_category_id,trim(_name),_price,'EUR',_duration_minutes,true
  ) RETURNING id INTO legacy_service_id;

  SELECT m.clinic_service_id INTO clinic_service_id
  FROM public.legacy_service_mappings m
  WHERE m.legacy_service_id = legacy_service_id AND m.source_deleted_at IS NULL;
  IF clinic_service_id IS NULL THEN RAISE EXCEPTION 'SERVICE_SYNC_FAILED'; END IF;
  RETURN clinic_service_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_clinic_service_active(
  _clinic_id uuid,
  _clinic_service_id uuid,
  _active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  physio_id uuid := public.current_physio_id();
  legacy_id uuid;
BEGIN
  IF physio_id IS NULL OR NOT public.is_clinic_admin(_clinic_id) THEN
    RAISE EXCEPTION 'CLINIC_ADMIN_PHYSIO_REQUIRED';
  END IF;
  SELECT m.legacy_service_id INTO legacy_id
  FROM public.legacy_service_mappings m
  WHERE m.clinic_id=_clinic_id AND m.clinic_service_id=_clinic_service_id
    AND m.physiotherapist_id=physio_id AND m.source_deleted_at IS NULL;
  IF legacy_id IS NOT NULL THEN
    UPDATE public.services SET active=_active WHERE id=legacy_id AND physiotherapist_id=physio_id;
  ELSE
    UPDATE public.clinic_services SET active=_active
    WHERE id=_clinic_service_id AND clinic_id=_clinic_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_my_clinic_service_category(uuid,text),
  public.create_my_clinic_service(uuid,uuid,text,numeric,integer),
  public.set_my_clinic_service_active(uuid,uuid,boolean)
  TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.create_my_clinic_service_category(uuid,text),
  public.create_my_clinic_service(uuid,uuid,text,numeric,integer),
  public.set_my_clinic_service_active(uuid,uuid,boolean)
  FROM PUBLIC,anon;
