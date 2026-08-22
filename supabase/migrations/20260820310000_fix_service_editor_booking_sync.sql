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
  created_legacy_service_id uuid;
  created_clinic_service_id uuid;
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
  ) RETURNING id INTO created_legacy_service_id;

  SELECT m.clinic_service_id INTO created_clinic_service_id
  FROM public.legacy_service_mappings m
  WHERE m.legacy_service_id = created_legacy_service_id
    AND m.source_deleted_at IS NULL;
  IF created_clinic_service_id IS NULL THEN RAISE EXCEPTION 'SERVICE_SYNC_FAILED'; END IF;
  RETURN created_clinic_service_id;
END;
$$;
