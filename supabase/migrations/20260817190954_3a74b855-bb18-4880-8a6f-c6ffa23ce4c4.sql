
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ENUMS
CREATE TYPE public.app_role AS ENUM ('CLIENT','PHYSIOTHERAPIST','ADMIN','SUPER_ADMIN');
CREATE TYPE public.profile_status AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SUSPENDED');
CREATE TYPE public.verification_status AS ENUM ('UNVERIFIED','PENDING','VERIFIED','REJECTED');
CREATE TYPE public.appointment_status AS ENUM ('PENDING','CONFIRMED','REJECTED','CANCELLED','COMPLETED','NO_SHOW');
CREATE TYPE public.subscription_status AS ENUM ('ACTIVE','TRIALING','PAST_DUE','CANCELLED','EXPIRED');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('ADMIN','SUPER_ADMIN'));
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, phone)
  VALUES (NEW.id, NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'phone')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data ->> 'role')::public.app_role, 'CLIENT'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- REGIONS / CITIES
CREATE TABLE public.regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions, public.cities, public.specializations TO anon, authenticated;
GRANT ALL ON public.regions, public.cities, public.specializations TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regions_public_read" ON public.regions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "cities_public_read" ON public.cities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "spec_public_read" ON public.specializations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "regions_admin_all" ON public.regions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "cities_admin_all" ON public.cities FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "spec_admin_all" ON public.specializations FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.regions, public.cities, public.specializations TO authenticated;

-- PHYSIOTHERAPISTS
CREATE TABLE public.physiotherapists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  professional_title TEXT,
  bio TEXT,
  education TEXT,
  experience TEXT,
  certifications TEXT,
  license_number TEXT,
  photo_url TEXT,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  phone TEXT,
  status public.profile_status NOT NULL DEFAULT 'DRAFT',
  verification public.verification_status NOT NULL DEFAULT 'UNVERIFIED',
  rejection_reason TEXT,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  profile_views INTEGER NOT NULL DEFAULT 0,
  min_cancellation_hours INTEGER NOT NULL DEFAULT 2,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  clinic_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.physiotherapists TO anon;
GRANT SELECT, INSERT, UPDATE ON public.physiotherapists TO authenticated;
GRANT ALL ON public.physiotherapists TO service_role;
ALTER TABLE public.physiotherapists ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_physio_updated BEFORE UPDATE ON public.physiotherapists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "physio_public_read_approved" ON public.physiotherapists FOR SELECT TO anon, authenticated USING (status = 'APPROVED');
CREATE POLICY "physio_owner_read" ON public.physiotherapists FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "physio_owner_insert" ON public.physiotherapists FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "physio_owner_update" ON public.physiotherapists FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid())) WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.current_physio_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.physiotherapists WHERE user_id = auth.uid();
$$;

CREATE TABLE public.physiotherapist_specializations (
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  specialization_id UUID NOT NULL REFERENCES public.specializations(id) ON DELETE CASCADE,
  PRIMARY KEY (physiotherapist_id, specialization_id)
);
GRANT SELECT ON public.physiotherapist_specializations TO anon;
GRANT SELECT, INSERT, DELETE ON public.physiotherapist_specializations TO authenticated;
GRANT ALL ON public.physiotherapist_specializations TO service_role;
ALTER TABLE public.physiotherapist_specializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps_public_read" ON public.physiotherapist_specializations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "ps_owner_write" ON public.physiotherapist_specializations FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()));

-- SERVICE CATEGORIES / SERVICES
CREATE TABLE public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  duration_minutes INTEGER NOT NULL DEFAULT 45 CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_categories, public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_categories, public.services TO authenticated;
GRANT ALL ON public.service_categories, public.services TO service_role;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_cat_updated BEFORE UPDATE ON public.service_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_srv_updated BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "cat_public_read" ON public.service_categories FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (SELECT 1 FROM public.physiotherapists p WHERE p.id = physiotherapist_id AND p.status = 'APPROVED'));
CREATE POLICY "cat_owner_all" ON public.service_categories FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id());
CREATE POLICY "srv_public_read" ON public.services FOR SELECT TO anon, authenticated
  USING (active AND EXISTS (SELECT 1 FROM public.physiotherapists p WHERE p.id = physiotherapist_id AND p.status = 'APPROVED'));
CREATE POLICY "srv_owner_all" ON public.services FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id());

-- ownership guard: category must belong to same physio
CREATE OR REPLACE FUNCTION public.check_service_category_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.service_categories c
      WHERE c.id = NEW.category_id AND c.physiotherapist_id = NEW.physiotherapist_id) THEN
      RAISE EXCEPTION 'CATEGORY_OWNERSHIP_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_service_owner BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.check_service_category_owner();

-- WORKING HOURS / EXCEPTIONS / BLOCKED
CREATE TABLE public.working_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (physiotherapist_id, day_of_week)
);
CREATE TABLE public.availability_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  closed BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.blocked_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
GRANT SELECT ON public.working_hours, public.availability_exceptions, public.blocked_times TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.working_hours, public.availability_exceptions, public.blocked_times TO authenticated;
GRANT ALL ON public.working_hours, public.availability_exceptions, public.blocked_times TO service_role;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wh_public_read" ON public.working_hours FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "wh_owner_all" ON public.working_hours FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id());
CREATE POLICY "ae_owner_all" ON public.availability_exceptions FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id());
CREATE POLICY "ae_public_read" ON public.availability_exceptions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "bt_owner_all" ON public.blocked_times FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id());

-- APPOINTMENTS
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  client_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL DEFAULT '',
  client_first_name TEXT NOT NULL DEFAULT '',
  client_last_name TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status public.appointment_status NOT NULL DEFAULT 'PENDING',
  client_message TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    physiotherapist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED'));
CREATE INDEX idx_appt_physio_start ON public.appointments (physiotherapist_id, start_at);
GRANT SELECT, INSERT, UPDATE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_appt_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "appt_read" ON public.appointments FOR SELECT TO authenticated
  USING (client_id = auth.uid() OR physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()));
CREATE POLICY "appt_update" ON public.appointments FOR UPDATE TO authenticated
  USING (client_id = auth.uid() OR physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (client_id = auth.uid() OR physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()));

CREATE TABLE public.appointment_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holds_lookup ON public.appointment_holds (physiotherapist_id, expires_at);
GRANT ALL ON public.appointment_holds TO service_role;
ALTER TABLE public.appointment_holds ENABLE ROW LEVEL SECURITY;

-- NOTIFICATIONS
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- REVIEWS
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rev_public_read" ON public.reviews FOR SELECT TO anon, authenticated USING (hidden = false);
CREATE POLICY "rev_admin_all" ON public.reviews FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT UPDATE, DELETE ON public.reviews TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_physio_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid UUID;
BEGIN
  pid := COALESCE(NEW.physiotherapist_id, OLD.physiotherapist_id);
  UPDATE public.physiotherapists p SET
    rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric,2) FROM public.reviews r WHERE r.physiotherapist_id = pid AND NOT r.hidden),0),
    rating_count = (SELECT COUNT(*) FROM public.reviews r WHERE r.physiotherapist_id = pid AND NOT r.hidden)
  WHERE p.id = pid;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_reviews_rating AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_physio_rating();

-- VERIFICATION REQUESTS
CREATE TABLE public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physiotherapist_id UUID NOT NULL REFERENCES public.physiotherapists(id) ON DELETE CASCADE,
  document_url TEXT,
  note TEXT,
  status public.verification_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vr_owner" ON public.verification_requests FOR ALL TO authenticated
  USING (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()))
  WITH CHECK (physiotherapist_id = public.current_physio_id() OR public.is_admin(auth.uid()));

-- PLANS / SUBSCRIPTIONS
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'ACTIVE',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT SELECT ON public.subscriptions, public.subscription_events TO authenticated;
GRANT ALL ON public.plans, public.subscriptions, public.subscription_events TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_read" ON public.plans FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "plans_admin" ON public.plans FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "subs_own" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "subev_admin" ON public.subscription_events FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- SEED
INSERT INTO public.regions (name, slug) VALUES
 ('Prishtinë','prishtine'),('Prizren','prizren'),('Pejë','peje'),('Gjilan','gjilan'),
 ('Ferizaj','ferizaj'),('Gjakovë','gjakove'),('Mitrovicë','mitrovice');

INSERT INTO public.cities (region_id, name, slug)
SELECT r.id, c.name, c.slug FROM public.regions r
JOIN (VALUES
 ('prishtine','Prishtinë','prishtine-qytet'),
 ('prishtine','Fushë Kosovë','fushe-kosove'),
 ('prishtine','Podujevë','podujeve'),
 ('prishtine','Lipjan','lipjan'),
 ('prizren','Prizren','prizren-qytet'),
 ('prizren','Suharekë','suhareke'),
 ('prizren','Rahovec','rahovec'),
 ('peje','Pejë','peje-qytet'),
 ('peje','Deçan','decan'),
 ('peje','Istog','istog'),
 ('gjilan','Gjilan','gjilan-qytet'),
 ('gjilan','Viti','viti'),
 ('gjilan','Kamenicë','kamenice'),
 ('ferizaj','Ferizaj','ferizaj-qytet'),
 ('ferizaj','Shtime','shtime'),
 ('ferizaj','Kaçanik','kacanik'),
 ('gjakove','Gjakovë','gjakove-qytet'),
 ('gjakove','Malishevë','malisheve'),
 ('mitrovice','Mitrovicë','mitrovice-qytet'),
 ('mitrovice','Vushtrri','vushtrri'),
 ('mitrovice','Skenderaj','skenderaj')
) AS c(region_slug, name, slug) ON c.region_slug = r.slug;

INSERT INTO public.specializations (name, slug) VALUES
 ('Dhimbje shpine','dhimbje-shpine'),
 ('Dhimbje qafe','dhimbje-qafe'),
 ('Rehabilitim sportiv','rehabilitim-sportiv'),
 ('Rehabilitim pas operacionit','rehabilitim-pas-operacionit'),
 ('Terapia manuale','terapia-manuale'),
 ('Rehabilitim neurologjik','rehabilitim-neurologjik'),
 ('Fizioterapi pediatrike','fizioterapi-pediatrike'),
 ('Rehabilitim ortopedik','rehabilitim-ortopedik');

INSERT INTO public.plans (code, name, description, price_monthly, features, sort_order) VALUES
 ('FREE','Falas','Profil publik dhe rezervime bazë',0,'["Profil publik","Listim në direktori","Kategoritë e shërbimeve","Shërbimet","Kalendari","Rezervimet"]',1),
 ('PRO','Pro','Për fizioterapeutë profesionistë',19,'["Gjithçka nga Falas","Kalendar i avancuar","Analitika","Kujtesa automatike","Google Calendar","Personalizim"]',2),
 ('CLINIC','Klinikë','Për klinika me disa fizioterapeutë',49,'["Gjithçka nga Pro","Disa fizioterapeutë","Disa lokacione","Stafi","Kalendarë të shumtë","Analitika e avancuar"]',3);
