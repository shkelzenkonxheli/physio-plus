-- Phase 1 tenant-foundation verification (read-only).
-- Run this in the Supabase SQL editor after applying
-- 20260819100000_clinic_tenant_foundation.sql.

WITH
physios_without_clinic AS (
  SELECT p.id
  FROM public.physiotherapists p
  WHERE p.clinic_id IS NULL
),
physios_with_missing_clinic AS (
  SELECT p.id
  FROM public.physiotherapists p
  LEFT JOIN public.clinics c ON c.id = p.clinic_id
  WHERE p.clinic_id IS NOT NULL
    AND c.id IS NULL
),
physios_without_membership AS (
  SELECT p.id
  FROM public.physiotherapists p
  WHERE p.clinic_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.clinic_memberships m
      WHERE m.clinic_id = p.clinic_id
        AND m.user_id = p.user_id
    )
),
clinics_without_default_location AS (
  SELECT c.id
  FROM public.clinics c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.clinic_locations l
    WHERE l.clinic_id = c.id
      AND l.is_default
  )
),
duplicate_membership_groups AS (
  SELECT m.clinic_id, m.user_id, m.role
  FROM public.clinic_memberships m
  GROUP BY m.clinic_id, m.user_id, m.role
  HAVING count(*) > 1
),
duplicate_default_location_groups AS (
  SELECT l.clinic_id
  FROM public.clinic_locations l
  WHERE l.is_default
  GROUP BY l.clinic_id
  HAVING count(*) > 1
)
SELECT
  (SELECT count(*) FROM public.clinics) AS clinics,
  (SELECT count(*) FROM public.clinic_memberships) AS clinic_memberships,
  (SELECT count(*) FROM public.clinic_locations) AS clinic_locations,
  (SELECT count(*) FROM physios_without_clinic) AS physiotherapists_without_clinic_id,
  (SELECT count(*) FROM physios_without_membership) AS physiotherapists_without_membership,
  (SELECT count(*) FROM clinics_without_default_location) AS clinics_without_default_location,
  (SELECT count(*) FROM duplicate_membership_groups) AS duplicate_membership_groups,
  (SELECT count(*) FROM duplicate_default_location_groups) AS duplicate_default_location_groups,
  (SELECT count(*) FROM physios_with_missing_clinic) AS physiotherapists_with_missing_clinic,
  (
    (SELECT count(*) FROM physios_without_clinic)
    + (SELECT count(*) FROM physios_with_missing_clinic)
    + (SELECT count(*) FROM physios_without_membership)
    + (SELECT count(*) FROM clinics_without_default_location)
    + (SELECT count(*) FROM duplicate_membership_groups)
    + (SELECT count(*) FROM duplicate_default_location_groups)
  ) AS incomplete_backfill_issue_count;

-- Details are returned only when an inconsistency exists.
SELECT 'PHYSIOTHERAPIST_WITHOUT_CLINIC' AS issue, p.id AS entity_id,
       p.user_id::text AS detail
FROM public.physiotherapists p
WHERE p.clinic_id IS NULL
UNION ALL
SELECT 'PHYSIOTHERAPIST_WITH_MISSING_CLINIC', p.id,
       p.clinic_id::text
FROM public.physiotherapists p
LEFT JOIN public.clinics c ON c.id = p.clinic_id
WHERE p.clinic_id IS NOT NULL AND c.id IS NULL
UNION ALL
SELECT 'PHYSIOTHERAPIST_WITHOUT_MEMBERSHIP', p.id,
       concat('clinic=', p.clinic_id, ', user=', p.user_id)
FROM public.physiotherapists p
WHERE p.clinic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.clinic_memberships m
    WHERE m.clinic_id = p.clinic_id
      AND m.user_id = p.user_id
  )
UNION ALL
SELECT 'CLINIC_WITHOUT_DEFAULT_LOCATION', c.id, c.name
FROM public.clinics c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.clinic_locations l
  WHERE l.clinic_id = c.id AND l.is_default
)
UNION ALL
SELECT 'DUPLICATE_MEMBERSHIP', min(m.id),
       concat('clinic=', m.clinic_id, ', user=', m.user_id, ', role=', m.role,
              ', count=', count(*))
FROM public.clinic_memberships m
GROUP BY m.clinic_id, m.user_id, m.role
HAVING count(*) > 1
UNION ALL
SELECT 'DUPLICATE_DEFAULT_LOCATION', min(l.id),
       concat('clinic=', l.clinic_id, ', count=', count(*))
FROM public.clinic_locations l
WHERE l.is_default
GROUP BY l.clinic_id
HAVING count(*) > 1
ORDER BY issue, entity_id;
