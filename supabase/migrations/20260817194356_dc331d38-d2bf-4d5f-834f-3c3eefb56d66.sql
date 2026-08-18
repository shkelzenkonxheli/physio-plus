-- Clinics
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  region_id uuid REFERENCES public.regions(id),
  city_id uuid REFERENCES public.cities(id),
  address text,
  phone text,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.clinics TO anon;
GRANT SELECT ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinics_public_read ON public.clinics;
CREATE POLICY clinics_public_read ON public.clinics FOR SELECT USING (active OR public.is_admin(auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'physiotherapists_clinic_id_fkey'
  ) THEN
    ALTER TABLE public.physiotherapists
      ADD CONSTRAINT physiotherapists_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Admin: create/update/delete clinic
CREATE OR REPLACE FUNCTION public.admin_upsert_clinic(
  _id uuid, _name text, _city_id uuid, _address text, _phone text, _email text, _active boolean
) RETURNS public.clinics
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE res public.clinics; reg uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(coalesce(_name,'')) < 2 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT region_id INTO reg FROM public.cities WHERE id = _city_id;
  IF _id IS NULL THEN
    INSERT INTO public.clinics (name, slug, city_id, region_id, address, phone, email, active)
    VALUES (_name, public.generate_unique_clinic_slug(_name), _city_id, reg, _address, _phone, _email, coalesce(_active,true))
    RETURNING * INTO res;
  ELSE
    UPDATE public.clinics SET name=_name, city_id=_city_id, region_id=reg, address=_address,
      phone=_phone, email=_email, active=coalesce(_active,true), updated_at=now()
    WHERE id=_id RETURNING * INTO res;
  END IF;
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_unique_clinic_slug(_base text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE base TEXT; candidate TEXT; i INT := 1;
BEGIN
  base := NULLIF(public.slugify(_base), '');
  IF base IS NULL THEN base := 'klinike'; END IF;
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.clinics WHERE slug = candidate) LOOP
    i := i + 1; candidate := base || '-' || i;
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_clinic(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.clinics WHERE id = _id;
END; $$;

-- Admin: create physiotherapist for an existing registered user (by email)
CREATE OR REPLACE FUNCTION public.admin_create_physio(
  _email text, _first_name text, _last_name text, _city_id uuid, _clinic_id uuid, _phone text
) RETURNS public.physiotherapists
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid; reg uuid; res public.physiotherapists;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT id INTO uid FROM public.profiles WHERE lower(email) = lower(trim(_email));
  IF uid IS NULL THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.physiotherapists WHERE user_id = uid) THEN
    RAISE EXCEPTION 'PHYSIO_EXISTS';
  END IF;
  SELECT region_id INTO reg FROM public.cities WHERE id = _city_id;
  INSERT INTO public.physiotherapists (user_id, first_name, last_name, city_id, region_id, clinic_id, phone, status)
  VALUES (uid, trim(_first_name), trim(_last_name), _city_id, reg, _clinic_id, _phone, 'APPROVED')
  RETURNING * INTO res;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'PHYSIOTHERAPIST') ON CONFLICT DO NOTHING;
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_physio(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.physiotherapists WHERE id = _id;
END; $$;

-- Admin: assign / remove subscription for a physiotherapist's user
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _physio_id uuid, _plan_code text, _status public.subscription_status, _expires_at timestamptz
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid; pid uuid; res public.subscriptions;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT user_id INTO uid FROM public.physiotherapists WHERE id = _physio_id;
  IF uid IS NULL THEN RAISE EXCEPTION 'PHYSIOTHERAPIST_NOT_FOUND'; END IF;
  SELECT id INTO pid FROM public.plans WHERE code = _plan_code AND active;
  IF pid IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;

  UPDATE public.subscriptions SET plan_id = pid, status = _status, expires_at = _expires_at, updated_at = now()
  WHERE user_id = uid RETURNING * INTO res;
  IF res.id IS NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status, expires_at)
    VALUES (uid, pid, _status, _expires_at) RETURNING * INTO res;
  END IF;
  INSERT INTO public.subscription_events (subscription_id, event, metadata)
  VALUES (res.id, 'ADMIN_SET', jsonb_build_object('plan', _plan_code, 'status', _status));
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_subscription(_physio_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT user_id INTO uid FROM public.physiotherapists WHERE id = _physio_id;
  DELETE FROM public.subscription_events e USING public.subscriptions s
    WHERE e.subscription_id = s.id AND s.user_id = uid;
  DELETE FROM public.subscriptions WHERE user_id = uid;
END; $$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_clinic(uuid,text,uuid,text,text,text,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_clinic(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_physio(text,text,text,uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_physio(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid,text,public.subscription_status,timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_unique_clinic_slug(text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_upsert_clinic(uuid,text,uuid,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_clinic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_physio(text,text,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_physio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid,text,public.subscription_status,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_subscription(uuid) TO authenticated;