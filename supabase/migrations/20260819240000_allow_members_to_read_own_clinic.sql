-- Clinic members must be able to open their own tenant workspace even while
-- the clinic is still inactive/private and awaiting platform approval.
-- Public access remains limited to operational clinics.
DROP POLICY IF EXISTS clinics_public_read ON public.clinics;

CREATE POLICY clinics_public_read ON public.clinics
  FOR SELECT TO anon, authenticated
  USING (
    active
    OR public.is_clinic_member(id)
    OR public.is_admin(auth.uid())
  );

