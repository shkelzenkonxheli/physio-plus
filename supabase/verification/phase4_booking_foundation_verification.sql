-- Phase 4 tenant/location booking verification (read-only and idempotent).
WITH appointment_issues AS (
  SELECT a.id,
         (a.clinic_id IS NULL) AS missing_clinic,
         (a.location_id IS NULL) AS missing_location,
         (a.clinic_service_id IS NULL) AS missing_service_mapping,
         NOT EXISTS (
           SELECT 1
           FROM public.physiotherapists p
           WHERE p.id = a.physiotherapist_id AND p.clinic_id = a.clinic_id
         ) AS invalid_physio_clinic,
         NOT EXISTS (
           SELECT 1
           FROM public.clinic_locations l
           WHERE l.id = a.location_id AND l.clinic_id = a.clinic_id
         ) AS invalid_location_clinic,
         NOT EXISTS (
           SELECT 1
           FROM public.legacy_service_mappings m
           WHERE m.legacy_service_id = a.service_id
             AND m.clinic_service_id = a.clinic_service_id
             AND m.clinic_id = a.clinic_id
             AND m.source_deleted_at IS NULL
         ) AS invalid_service_mapping
  FROM public.appointments a
), hold_issues AS (
  SELECT h.id,
         h.clinic_id IS NULL AS missing_clinic,
         h.location_id IS NULL AS missing_location,
         NOT EXISTS (
           SELECT 1 FROM public.physiotherapists p
           WHERE p.id = h.physiotherapist_id AND p.clinic_id = h.clinic_id
         ) AS invalid_physio_clinic,
         NOT EXISTS (
           SELECT 1 FROM public.clinic_locations l
           WHERE l.id = h.location_id AND l.clinic_id = h.clinic_id
         ) AS invalid_location_clinic
  FROM public.appointment_holds h
)
SELECT
  (SELECT count(*) FROM public.appointments) AS appointments_total,
  (SELECT count(*) FROM public.appointments WHERE clinic_id IS NOT NULL) AS appointments_mapped_to_clinic,
  (SELECT count(*) FROM public.appointments WHERE location_id IS NOT NULL) AS appointments_mapped_to_location,
  (SELECT count(*) FROM public.appointments WHERE clinic_service_id IS NOT NULL) AS appointments_with_service_mapping,
  (SELECT count(*) FROM public.appointments WHERE duration_minutes IS NOT NULL) AS appointments_with_duration_snapshot,
  (SELECT count(*) FROM public.appointment_holds) AS holds_total,
  (SELECT count(*) FROM public.appointment_holds WHERE clinic_id IS NOT NULL AND location_id IS NOT NULL) AS holds_mapped,
  (SELECT count(*) FROM appointment_issues WHERE missing_clinic OR missing_location) AS unmapped_appointments,
  (SELECT count(*) FROM appointment_issues WHERE invalid_physio_clinic OR invalid_location_clinic) AS invalid_appointment_assignments,
  (SELECT count(*) FROM appointment_issues WHERE invalid_service_mapping) AS appointments_without_valid_service_mapping,
  (SELECT count(*) FROM hold_issues WHERE missing_clinic OR missing_location) AS unmapped_holds,
  (SELECT count(*) FROM hold_issues WHERE invalid_physio_clinic OR invalid_location_clinic) AS invalid_hold_assignments;

SELECT 'APPOINTMENT_MISSING_CLINIC' AS issue, a.id AS entity_id
FROM public.appointments a WHERE a.clinic_id IS NULL
UNION ALL
SELECT 'APPOINTMENT_MISSING_LOCATION', a.id
FROM public.appointments a WHERE a.location_id IS NULL
UNION ALL
SELECT 'APPOINTMENT_INVALID_PHYSIO_CLINIC', a.id
FROM public.appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM public.physiotherapists p
  WHERE p.id = a.physiotherapist_id AND p.clinic_id = a.clinic_id
)
UNION ALL
SELECT 'APPOINTMENT_INVALID_LOCATION_CLINIC', a.id
FROM public.appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM public.clinic_locations l
  WHERE l.id = a.location_id AND l.clinic_id = a.clinic_id
)
UNION ALL
SELECT 'APPOINTMENT_INVALID_SERVICE_MAPPING', a.id
FROM public.appointments a
WHERE NOT EXISTS (
  SELECT 1 FROM public.legacy_service_mappings m
  WHERE m.legacy_service_id = a.service_id
    AND m.clinic_service_id = a.clinic_service_id
    AND m.clinic_id = a.clinic_id
    AND m.source_deleted_at IS NULL
)
ORDER BY issue, entity_id;

-- The human-resource overlap constraint must remain location-independent.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.appointments'::regclass
  AND conname = 'appointments_no_overlap';
