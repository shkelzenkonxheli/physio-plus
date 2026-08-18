CREATE OR REPLACE FUNCTION public.set_my_physio_slug(_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
  clean text;
BEGIN
  SELECT id INTO pid FROM public.physiotherapists WHERE user_id = auth.uid() LIMIT 1;
  IF pid IS NULL THEN
    RAISE EXCEPTION 'NO_PROFILE';
  END IF;

  clean := lower(btrim(coalesce(_slug, '')));
  clean := regexp_replace(clean, '\s+', '-', 'g');
  clean := regexp_replace(clean, '[^a-z0-9-]', '', 'g');
  clean := regexp_replace(clean, '-+', '-', 'g');
  clean := btrim(clean, '-');

  IF length(clean) < 3 OR length(clean) > 60 THEN
    RAISE EXCEPTION 'SLUG_INVALID';
  END IF;

  IF clean IN ('admin','paneli','llogaria','hyr','regjistrohu','rezervo','fizioterapeutet','api','auth','klinikat','kontakt') THEN
    RAISE EXCEPTION 'SLUG_RESERVED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.physiotherapists WHERE slug = clean AND id <> pid)
     OR EXISTS (SELECT 1 FROM public.clinics WHERE slug = clean) THEN
    RAISE EXCEPTION 'SLUG_TAKEN';
  END IF;

  UPDATE public.physiotherapists SET slug = clean, updated_at = now() WHERE id = pid;
  RETURN clean;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_physio_slug(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_physio_slug(text) TO authenticated;