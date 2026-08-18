CREATE OR REPLACE FUNCTION public.create_my_physio_profile(
  _first_name text,
  _last_name text,
  _phone text,
  _region_id uuid,
  _city_id uuid,
  _professional_title text DEFAULT NULL,
  _license_number text DEFAULT NULL,
  _bio text DEFAULT NULL
) RETURNS public.physiotherapists
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.physiotherapists;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _row FROM public.physiotherapists WHERE user_id = _uid;
  IF FOUND THEN
    RETURN _row;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'PHYSIOTHERAPIST')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.physiotherapists (
    user_id, slug, first_name, last_name, phone, professional_title,
    license_number, region_id, city_id, bio, status
  ) VALUES (
    _uid, '', trim(_first_name), trim(_last_name), NULLIF(trim(_phone), ''),
    NULLIF(trim(_professional_title), ''), NULLIF(trim(_license_number), ''),
    _region_id, _city_id, NULLIF(trim(coalesce(_bio,'')), ''), 'DRAFT'
  ) RETURNING * INTO _row;

  RETURN _row;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_my_physio_profile(text,text,text,uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_physio_profile(text,text,text,uuid,uuid,text,text,text) TO authenticated;