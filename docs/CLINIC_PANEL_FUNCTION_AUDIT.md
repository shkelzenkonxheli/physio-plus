# Clinic Panel visible-function audit

Audit date: 2026-08-22. Scope: current Clinic Panel only; no UI redesign and no booking-engine redesign.

`PASS` means the visible action is backed by tenant-scoped database data and its supported workflow passed code/database verification. `FIXED` means broken or misleading wiring was corrected and then verified. `BLOCKED` means the UI is now explicitly disabled because the required backend does not exist yet.

| Section / function | Status | Tested or fixed | Remaining dependency |
| --- | --- | --- | --- |
| Global clinic/location selectors | FIXED | Location selection now scopes dashboard, calendar, appointments and reports; query loading/error states are visible. | None. |
| Global patient/appointment search | PASS | Filters the real tenant appointment and patient data in the relevant views. | None. |
| Header/dashboard “Termin i ri” | FIXED | Both open the real appointment editor instead of a placeholder message. | None. |
| Dashboard “Pacient i ri” | FIXED | Opens the real patient editor; disabled with explanation for PHYSIOTHERAPIST. | None. |
| Paneli metrics, upcoming appointments and status actions | FIXED | Real tenant data, location scope, controlled status RPC, activity audit and errors verified. | None. |
| Kalendari navigation/filter/new appointment | FIXED | Real appointments and location scope; new appointment opens the editor. | None. |
| Terminet list/filter/create/edit/reschedule/status | FIXED | Existing/new patient, date, time, physio, location and service persist. Invalid status transitions are rejected. Unsupported staff/service combinations are visibly unavailable. | DRAFT staff need approval plus service/location assignments before booking. |
| Pacientët create/edit/search/history toggle | FIXED | Create/edit and clinic/patient history settings persist; role restrictions are explicit. | None. |
| Historia e seancave | FIXED | Enabled clinic + patient, appointment completion, note creation and history visibility verified. RECEPTIONIST sees zero clinical notes under RLS. | A PHYSIOTHERAPIST profile is required to author a clinical note. |
| Ekipi roster | FIXED | Clinic-wide RPC now lists memberships, including invited/non-profile members; loading/error states added. | None. |
| Ekipi invitation/acceptance/roles | FIXED | Invitation, one-time acceptance, profile provisioning and role restrictions verified. | Automatic invitation email delivery does not exist; the secure invitation link must be copied and sent manually. |
| Staff location assignment | PASS | Admin assignment and tenant/membership constraints verified. | None. |
| Shërbimet categories/services CRUD | FIXED | Mutations have busy/success/error states and tenant-admin RLS; protected booking fields cannot be changed unsafely. | None. |
| Clinic gallery upload/delete row | FIXED | Private `profiles` bucket created; 5 MB JPG/PNG/WEBP limit; own-clinic upload and cross-tenant rejection verified. | Deleting a gallery row does not yet garbage-collect the stored object because legacy rows store only signed URLs. |
| Legacy clinic-wide hours/days-off controls | BLOCKED | Clearly disabled because these legacy tables do not drive the current booking engine. | Requires an approved booking migration; use Orari & Disponueshmëria now. |
| Lokacionet create/edit/reactivate | FIXED | Real CRUD, timezone preservation, loading/errors and reactivation added. | Destructive deletion remains represented as safe deactivation. |
| Orari & Disponueshmëria | FIXED | Admin can edit assigned staff; PHYSIOTHERAPIST can edit only their own assigned schedule, including breaks. Existing breaks load into the form. | Staff must first have an active clinic membership and location assignment. |
| Njoftimet list/read/navigation | FIXED | Real notifications load, mark-read persists, appointment links route correctly. | External push/email notification delivery is outside the current backend. |
| Website clinic profile | PASS | Real clinic fields save through tenant RLS; settings shortcut routes here. | Public publication continues to follow the existing approved public behavior. |
| Raportet filters/metrics | FIXED | Calculations use real tenant/location-scoped appointment data. | Export/PDF is not present in the current UI. |
| Abonimi | PASS | Displays the real current subscription as read-only. | Checkout, plan change and billing portal backend do not exist in this panel. |
| Cilësimet navigation tiles | FIXED | Profile, locations, team, booking, notifications, website and subscription open their real sections. | None. |
| Language / Security settings | BLOCKED | Explicitly disabled with explanation instead of pretending to save. | Locale/account-security backend is required. |
| Professional profile shortcut | FIXED | Available only when the member has a physiotherapist profile; otherwise visibly disabled. | None. |
| Help shortcut | BLOCKED | Explicitly disabled. | No help/support destination is configured. |
| Logout and responsive navigation | PASS | Query cache is cleared, auth sign-out runs and routing returns to login. | None. |

## Verification executed

- TypeScript: `npx tsc --noEmit` — PASS.
- Changed-file ESLint — PASS with one existing Fast Refresh warning for the exported `useGallery` hook; zero errors.
- Production build: `npm run build` — PASS.
- Database lint: `npx supabase db lint --local --level warning` — PASS, no schema errors.
- Clinic workflow regression: `phase5_workflow_regression.sql` — PASS and rolled back.
- Clinic A / Clinic B RLS regression: `clinic_panel_rls_regression.sql` — PASS and rolled back.
- Gallery Storage/RLS regression: `clinic_gallery_storage_regression.sql` — PASS and rolled back.
- Booking regression: `phase4_booking_regression.sql` — PASS and rolled back.

## Manual-browser limitation

All visible handlers were traced to their real query/mutation and the supported workflows were executed transactionally against the local Supabase database. This environment did not expose a browser-automation driver, so a literal automated mouse-click pass across every rendered control was not possible. A final human browser smoke pass is still recommended for visual focus, modal closing and responsive behavior; it should not require database changes.
