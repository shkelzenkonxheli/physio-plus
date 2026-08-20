ALTER FUNCTION public.create_clinic_invitation(uuid,text,public.clinic_role)
  SET search_path = public, extensions;
ALTER FUNCTION public.accept_clinic_invitation(text)
  SET search_path = public, extensions;
