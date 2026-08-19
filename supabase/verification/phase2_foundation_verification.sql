-- Phase 2 foundation verification (read-only).
-- Run after 20260819200000_tenant_service_staff_foundation.sql.

SELECT
  to_regclass('public.physiotherapist_services') IS NOT NULL
    AS physiotherapist_services_exists,
  to_regclass('public.physiotherapist_locations') IS NOT NULL
    AS physiotherapist_locations_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clinics'
      AND column_name = 'public_listing_enabled'
  ) AS public_listing_enabled_exists;

SELECT
  (SELECT count(*) FROM public.physiotherapist_services)
    AS physiotherapist_service_assignments,
  (SELECT count(*) FROM public.physiotherapist_locations)
    AS physiotherapist_location_assignments,
  (SELECT count(*)
   FROM public.physiotherapist_services ps
   JOIN public.physiotherapists p ON p.id = ps.physiotherapist_id
   WHERE p.clinic_id IS DISTINCT FROM ps.clinic_id)
    AS cross_clinic_physio_service_assignments,
  (SELECT count(*)
   FROM public.physiotherapist_services ps
   JOIN public.clinic_services s ON s.id = ps.clinic_service_id
   WHERE s.clinic_id IS DISTINCT FROM ps.clinic_id)
    AS cross_clinic_service_assignments,
  (SELECT count(*)
   FROM public.physiotherapist_locations pl
   JOIN public.physiotherapists p ON p.id = pl.physiotherapist_id
   WHERE p.clinic_id IS DISTINCT FROM pl.clinic_id)
    AS cross_clinic_physio_location_assignments,
  (SELECT count(*)
   FROM public.physiotherapist_locations pl
   JOIN public.clinic_locations l ON l.id = pl.clinic_location_id
   WHERE l.clinic_id IS DISTINCT FROM pl.clinic_id)
    AS cross_clinic_location_assignments,
  (SELECT count(*)
   FROM public.clinic_services s
   JOIN public.clinic_service_categories c ON c.id = s.category_id
   WHERE c.clinic_id IS DISTINCT FROM s.clinic_id)
    AS cross_clinic_service_categories,
  (SELECT count(*)
   FROM public.physiotherapist_services ps
   JOIN public.physiotherapists p ON p.id = ps.physiotherapist_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.clinic_memberships m
     WHERE m.clinic_id = ps.clinic_id
       AND m.user_id = p.user_id
       AND m.active
   )) AS service_assignments_without_active_membership,
  (SELECT count(*)
   FROM public.physiotherapist_locations pl
   JOIN public.physiotherapists p ON p.id = pl.physiotherapist_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.clinic_memberships m
     WHERE m.clinic_id = pl.clinic_id
       AND m.user_id = p.user_id
       AND m.active
   )) AS location_assignments_without_active_membership;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'physiotherapist_services',
    'physiotherapist_locations',
    'clinic_service_categories',
    'clinic_services'
  )
ORDER BY tablename, policyname;

SELECT conrelid::regclass::text AS table_name,
       conname AS constraint_name,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid IN (
    'public.physiotherapist_services'::regclass,
    'public.physiotherapist_locations'::regclass,
    'public.clinic_services'::regclass
  )
ORDER BY conrelid::regclass::text, conname;

