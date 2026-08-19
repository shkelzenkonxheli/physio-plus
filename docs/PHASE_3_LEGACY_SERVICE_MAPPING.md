# Phase 3 legacy service mapping proposal

Phase 2 intentionally creates no service, staff-service, or staff-location data.
The existing booking engine remains authoritative until the mapping is reviewed
and Phase 3 is explicitly approved.

## Proposed mapping

| Current source | Phase 3 target | Mapping rule |
|---|---|---|
| `service_categories` | `clinic_service_categories` | Group by clinic plus normalized category name. Preserve source-to-target IDs in a temporary mapping table; do not merge merely by name across clinics. |
| `services` | `clinic_services` | Group only after comparing clinic, normalized name, duration, price, currency, description, and mapped category. Any disagreement remains a separate candidate requiring review. |
| `services` | `physiotherapist_services` | Create one assignment from every legacy service to its source physiotherapist and the approved clinic-service target. |
| `working_hours` | future location-aware staff schedule | Keep the physiotherapist schedule unchanged initially. Attach it to an explicitly approved `physiotherapist_locations` row only after location selection. |
| Phase 1 default location | `physiotherapist_locations` | Do not assign automatically. Clinic admins must confirm which physiotherapists work at which locations. |

## Required pre-migration report

Before writing production rows, Phase 3 should generate a dry-run report with:

- every legacy category and proposed clinic category;
- every legacy service and proposed clinic service;
- conflicts where similar services differ in price, duration, currency, category,
  active state, or description;
- physiotherapists lacking an approved location assignment;
- proposed inserts, proposed reuses, and rows requiring manual decisions;
- stable source-to-target identifiers so reruns cannot generate duplicates.

The approved migration should be transactional and idempotent. Existing
`services`, `service_categories`, `working_hours`, booking functions,
appointments, and holds must remain in place until a separately approved
booking cutover and rollback plan exist.
