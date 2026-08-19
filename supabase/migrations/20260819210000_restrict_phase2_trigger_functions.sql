-- Phase 2 security follow-up.
-- Trigger functions are invoked by PostgreSQL triggers and must not be
-- callable directly by application roles.

REVOKE EXECUTE
  ON FUNCTION public.validate_physio_clinic_assignment_membership()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.protect_assigned_physio_membership()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.protect_phase2_assignment_tenant()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.protect_clinic_service_tenant()
  FROM PUBLIC, anon, authenticated;
