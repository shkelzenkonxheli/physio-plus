# PhysioPlus Architecture Audit

Date: 2026-08-19
Scope: Phase 1 audit for the final multi-tenant clinic architecture

## 1. Current Architecture

The application currently contains two parallel models:

- **Physiotherapist model**: the active model used by the directory, public profiles, services, schedules, booking, and appointments.
- **Clinic model**: partially implemented and currently used mainly for public clinic content and admin management.

Clinics are not yet complete tenants with members, locations, and integrated booking.

## 2. Current Tables and Responsibilities

| Area | Tables |
|---|---|
| Authentication | `profiles`, `user_roles` |
| Physiotherapists | `physiotherapists`, `physiotherapist_specializations` |
| Services | `service_categories`, `services` |
| Availability | `working_hours`, `availability_exceptions`, `blocked_times` |
| Booking | `appointments`, `appointment_holds` |
| Clinics | `clinics` |
| Clinic content | `clinic_service_categories`, `clinic_services`, `clinic_working_hours`, `clinic_days_off` |
| Gallery | `profile_gallery_images` |
| Billing | `plans`, `subscriptions`, `subscription_events` |
| Reviews | `reviews` |
| Notifications | `notifications` |
| Auditing | `audit_logs` |

The base schema is defined in `supabase/migrations/20260817190954_3a74b855-bb18-4880-8a6f-c6ffa23ce4c4.sql`.

## 3. Existing Clinic Architecture

Existing clinic tables are:

- `clinics`
- `clinic_service_categories`
- `clinic_services`
- `clinic_working_hours`
- `clinic_days_off`
- `profile_gallery_images`

Missing pieces:

- `clinic_memberships`
- clinic roles
- `clinic_locations`
- clinic staff access
- clinic-aware booking
- complete tenant isolation

The current clinic tables are primarily accessible through global admin workflows and do not yet form a complete tenant model.

## 4. Existing Physiotherapist-Centric Architecture

The active application path is physiotherapist-centric. These concepts are connected directly to `physiotherapist_id`:

- `services`
- `service_categories`
- `working_hours`
- `availability_exceptions`
- `blocked_times`
- `appointments`
- `reviews`
- public profiles
- booking RPCs

Frontend dependencies include:

- `src/lib/queries.ts`
- `src/routes/rezervo.$slug.tsx`
- `src/components/panel/ServicesTab.tsx`
- `src/components/panel/HoursTab.tsx`
- `src/components/panel/CalendarTab.tsx`

## 5. Duplicate or Overlapping Models

The following concepts exist twice:

- `service_categories` and `clinic_service_categories`
- `services` and `clinic_services`
- `working_hours` and `clinic_working_hours`
- `availability_exceptions` and `clinic_days_off`

None of these tables should be deleted yet. The current frontend still depends on the physiotherapist-owned model.

## 6. Current Role and Permission Model

Current roles:

- `CLIENT`
- `PHYSIOTHERAPIST`
- `ADMIN`
- `SUPER_ADMIN`

Missing tenant roles:

- `CLINIC_ADMIN`
- `RECEPTIONIST`

`ADMIN` is currently a platform-level role and should not be reused as clinic staff access.

The security hardening migration prevents signup from creating `ADMIN` or `SUPER_ADMIN`, but physiotherapist onboarding still needs a stronger server-controlled workflow in a later phase.

## 7. Booking Engine Dependencies

The booking engine depends on:

- `available_slots()`
- `hold_slot()`
- `book_appointment()`
- `working_hours`
- `availability_exceptions`
- `blocked_times`
- `appointment_holds`
- `pg_advisory_xact_lock`
- `appointments_no_overlap` exclusion constraint

`book_appointment()` currently:

1. checks that the physiotherapist is approved;
2. checks the service relationship;
3. calculates service duration;
4. uses an advisory transaction lock;
5. verifies slot availability;
6. inserts the appointment transaction-safely;
7. catches exclusion violations.

These protections must remain in place during the tenant migration.

## 8. Security and RLS Concerns

Important concerns:

- Clinic tenant isolation does not exist yet.
- Clinic RLS currently relies mainly on `is_admin(auth.uid())`.
- There is no membership-based authorization function such as `is_clinic_member(clinic_id)`.
- Existing policies allow direct physiotherapist inserts for a user's own `user_id`.
- `clinic_services.category_id` does not guarantee that the category belongs to the same clinic.
- `profile_gallery_images` uses polymorphic `owner_type/owner_id` without foreign keys.
- `subscriptions` belong to `user_id`, not a tenant.
- `reviews` belong to physiotherapists, not clinics.
- `available_slots()` does not consistently verify approval status.
- `hold_slot()` has weaker locking and validation than `book_appointment()`.
- Appointment overlap protection is keyed only by `physiotherapist_id`, not by clinic location or room.

## 9. What Must Be Preserved

The following should remain unchanged during the first tenant foundation phase:

- public physiotherapist profiles;
- public directory and slugs;
- guest booking;
- `available_slots()`;
- `book_appointment()`;
- appointment holds;
- advisory locking;
- PostgreSQL exclusion protection;
- appointment status transitions;
- working hours and availability logic;
- existing authentication;
- current physiotherapist RLS;
- service duration and price snapshots stored in appointments.

## 10. What Should Be Refactored Later

Later phases should:

- make services clinic-owned;
- assign physiotherapists to clinic services;
- support clinic and physiotherapist schedules;
- add `clinic_id` and `location_id` to appointments;
- add tenant identity to reviews;
- move billing to tenant level;
- separate platform admin from clinic staff;
- migrate frontend queries gradually;
- remove legacy tables only after all code has migrated away from them.

## 11. Proposed Final Schema

```text
clinics
├── clinic_locations
├── clinic_memberships
│   ├── CLINIC_ADMIN
│   ├── PHYSIOTHERAPIST
│   └── RECEPTIONIST
├── physiotherapists
├── clinic_service_categories
├── clinic_services
├── physiotherapist_services
├── working_schedules
├── availability_exceptions
├── blocked_times
├── patients
├── appointments
├── appointment_holds
├── reviews
├── subscriptions
└── website_settings
```

Every tenant-owned table should carry `clinic_id` directly or derive it through a constrained relationship with foreign keys and ownership checks.

An individual physiotherapist should be represented by a clinic tenant with one member.

## 12. Safe Migration and Refactor Plan

### Phase 1: Additive foundation

Create only:

- `clinic_memberships`
- `clinic_locations`
- clinic role enum
- `is_clinic_member()` helper
- `is_clinic_admin()` helper
- indexes and unique constraints
- backfill support for existing physiotherapists

Do not change the current booking engine.

### Phase 2: Backfill

For each existing physiotherapist:

- create a personal clinic if no `clinic_id` exists;
- assign the physiotherapist as `CLINIC_ADMIN`;
- create a default location;
- preserve existing slug and profile data.

### Phase 3: Tenant-safe clinic tables

- add membership-based RLS;
- ensure categories and services belong to the same clinic;
- add ownership constraints for clinic relationships.

### Phase 4: Booking integration

- add `clinic_id` and `location_id` to appointments;
- add `physiotherapist_services`;
- update `available_slots()` and `book_appointment()`;
- preserve advisory locking and exclusion protection.

### Phase 5: Frontend migration

Migrate gradually:

1. profile queries;
2. service queries;
3. schedule queries;
4. booking queries;
5. panel workflows.

Do not redesign the Clinic Panel during Phase 1.

### Phase 6: Legacy cleanup

Only after all frontend queries have migrated:

- deprecate `services`;
- deprecate `service_categories`;
- deprecate duplicate schedule tables;
- remove legacy tables only through separate migrations.

## 13. Migration Risks

- Incorrect backfill could detach a physiotherapist from their clinic.
- Booking RPC changes could break guest booking.
- Incorrect RLS could permit cross-tenant reads or writes.
- A poorly designed exclusion constraint could block valid bookings.
- Replacing service IDs could affect existing appointments.
- Subscription migration could create duplicate billing records.
- Changing slugs could break existing public profile links.

## Current Audit Status

No destructive schema changes or UI changes were made during this audit.

The next safe implementation step is an additive foundation migration containing:

1. `clinic_memberships`;
2. `clinic_locations`;
3. tenant authorization helper functions;
4. indexes and constraints;
5. a controlled backfill strategy for individual physiotherapists.

The current booking engine and legacy physiotherapist model should remain active until later migration phases are complete.
