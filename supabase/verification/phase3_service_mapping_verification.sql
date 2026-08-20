-- Phase 3 legacy -> tenant service mapping verification (read-only).

SELECT 'legacy_categories' AS metric, count(*)::bigint AS value FROM public.service_categories
UNION ALL SELECT 'mapped_categories', count(*) FROM public.legacy_service_category_mappings WHERE source_deleted_at IS NULL
UNION ALL SELECT 'skipped_categories', count(*)
  FROM public.service_categories sc
  JOIN public.physiotherapists p ON p.id = sc.physiotherapist_id
  LEFT JOIN public.legacy_service_category_mappings m ON m.legacy_category_id = sc.id AND m.source_deleted_at IS NULL
  WHERE p.clinic_id IS NULL OR m.legacy_category_id IS NULL
UNION ALL SELECT 'legacy_services', count(*) FROM public.services
UNION ALL SELECT 'mapped_services', count(*) FROM public.legacy_service_mappings WHERE source_deleted_at IS NULL
UNION ALL SELECT 'skipped_services', count(*)
  FROM public.services s
  JOIN public.physiotherapists p ON p.id = s.physiotherapist_id
  LEFT JOIN public.legacy_service_mappings m ON m.legacy_service_id = s.id AND m.source_deleted_at IS NULL
  WHERE p.clinic_id IS NULL OR m.legacy_service_id IS NULL
UNION ALL SELECT 'physiotherapist_service_assignments', count(*) FROM public.physiotherapist_services
UNION ALL SELECT 'duplicate_category_sources', count(*) FROM (
  SELECT legacy_category_id FROM public.legacy_service_category_mappings GROUP BY legacy_category_id HAVING count(*) > 1
) d
UNION ALL SELECT 'duplicate_category_targets', count(*) FROM (
  SELECT clinic_category_id FROM public.legacy_service_category_mappings GROUP BY clinic_category_id HAVING count(*) > 1
) d
UNION ALL SELECT 'duplicate_service_sources', count(*) FROM (
  SELECT legacy_service_id FROM public.legacy_service_mappings GROUP BY legacy_service_id HAVING count(*) > 1
) d
UNION ALL SELECT 'duplicate_service_targets', count(*) FROM (
  SELECT clinic_service_id FROM public.legacy_service_mappings GROUP BY clinic_service_id HAVING count(*) > 1
) d
UNION ALL SELECT 'orphan_category_mappings', count(*)
  FROM public.legacy_service_category_mappings m
  LEFT JOIN public.clinic_service_categories c ON c.id = m.clinic_category_id AND c.clinic_id = m.clinic_id
  WHERE c.id IS NULL
UNION ALL SELECT 'orphan_service_mappings', count(*)
  FROM public.legacy_service_mappings m
  LEFT JOIN public.clinic_services s ON s.id = m.clinic_service_id AND s.clinic_id = m.clinic_id
  WHERE s.id IS NULL
UNION ALL SELECT 'service_category_mapping_errors', count(*)
  FROM public.legacy_service_mappings sm
  LEFT JOIN public.legacy_service_category_mappings cm
    ON cm.legacy_category_id = sm.legacy_category_id
   AND cm.clinic_category_id = sm.clinic_category_id
   AND cm.clinic_id = sm.clinic_id
  WHERE sm.legacy_category_id IS NOT NULL AND cm.legacy_category_id IS NULL
UNION ALL SELECT 'cross_clinic_mapping_errors', count(*) FROM (
  SELECT m.legacy_category_id
  FROM public.legacy_service_category_mappings m
  JOIN public.physiotherapists p ON p.id = m.physiotherapist_id
  JOIN public.clinic_service_categories c ON c.id = m.clinic_category_id
  WHERE p.clinic_id <> m.clinic_id OR c.clinic_id <> m.clinic_id
  UNION ALL
  SELECT m.legacy_service_id
  FROM public.legacy_service_mappings m
  JOIN public.physiotherapists p ON p.id = m.physiotherapist_id
  JOIN public.clinic_services s ON s.id = m.clinic_service_id
  WHERE p.clinic_id <> m.clinic_id OR s.clinic_id <> m.clinic_id
) x
UNION ALL SELECT 'physiotherapists_without_service_assignments', count(*)
  FROM public.physiotherapists p
  WHERE p.clinic_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.services s WHERE s.physiotherapist_id = p.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.physiotherapist_services ps
      WHERE ps.physiotherapist_id = p.id AND ps.clinic_id = p.clinic_id
    );

-- Any returned row is a migration problem requiring review.
SELECT 'CATEGORY_NOT_MAPPED' AS issue, sc.id AS legacy_id, p.clinic_id, sc.name AS detail
FROM public.service_categories sc
JOIN public.physiotherapists p ON p.id = sc.physiotherapist_id
LEFT JOIN public.legacy_service_category_mappings m
  ON m.legacy_category_id = sc.id AND m.source_deleted_at IS NULL
WHERE p.clinic_id IS NULL OR m.legacy_category_id IS NULL
UNION ALL
SELECT 'SERVICE_NOT_MAPPED', s.id, p.clinic_id, s.name
FROM public.services s
JOIN public.physiotherapists p ON p.id = s.physiotherapist_id
LEFT JOIN public.legacy_service_mappings m
  ON m.legacy_service_id = s.id AND m.source_deleted_at IS NULL
WHERE p.clinic_id IS NULL OR m.legacy_service_id IS NULL
ORDER BY issue, legacy_id;

