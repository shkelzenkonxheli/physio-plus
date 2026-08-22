-- The first local application of 20260820320000 used ONLINE. Keep that
-- already-installed function executable; fresh databases use PUBLIC_BOOKING.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_source_valid;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_source_valid
  CHECK (source IN ('PUBLIC_BOOKING','ONLINE','RECEPTION','PHONE','MANUAL'));
