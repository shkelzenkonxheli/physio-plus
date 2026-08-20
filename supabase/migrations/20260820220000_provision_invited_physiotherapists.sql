-- Provision the professional record required by booking/scheduling when a
-- PHYSIOTHERAPIST invitation is accepted. Invited staff stay staff; they do not
-- receive a personal clinic or CLINIC_ADMIN membership.

CREATE OR REPLACE FUNCTION public.provision_invited_physiotherapist(
  _clinic_id uuid,
  _user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles;
  existing public.physiotherapists;
  created_id uuid;
BEGIN
  SELECT * INTO existing FROM public.physiotherapists WHERE user_id = _user_id;
  IF existing.id IS NOT NULL THEN
    IF existing.clinic_id IS DISTINCT FROM _clinic_id THEN
      RAISE EXCEPTION 'PHYSIOTHERAPIST_ALREADY_BELONGS_TO_ANOTHER_CLINIC';
    END IF;
    RETURN existing.id;
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = _user_id;
  INSERT INTO public.user_roles(user_id, role)
  VALUES(_user_id, 'PHYSIOTHERAPIST')
  ON CONFLICT(user_id, role) DO NOTHING;

  INSERT INTO public.physiotherapists(
    user_id, first_name, last_name, phone, photo_url, professional_title,
    clinic_id, status, verification
  ) VALUES(
    _user_id,
    COALESCE(profile_row.first_name, ''),
    COALESCE(profile_row.last_name, ''),
    profile_row.phone,
    profile_row.avatar_url,
    'Fizioterapeut',
    _clinic_id,
    'DRAFT',
    'UNVERIFIED'
  ) RETURNING id INTO created_id;
  RETURN created_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_clinic_invitation(_token text)
RETURNS public.clinic_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,extensions
AS $$
DECLARE
  invitation public.clinic_invitations;
  result public.clinic_memberships;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id=auth.uid();
  SELECT * INTO invitation
  FROM public.clinic_invitations
  WHERE token_hash=encode(digest(_token,'sha256'),'hex')
  FOR UPDATE;
  IF invitation.id IS NULL OR invitation.revoked_at IS NOT NULL OR invitation.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'INVITATION_INVALID';
  END IF;
  IF invitation.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_EXPIRED'; END IF;
  IF lower(user_email)<>invitation.email THEN RAISE EXCEPTION 'INVITATION_EMAIL_MISMATCH'; END IF;

  INSERT INTO public.clinic_memberships(clinic_id,user_id,role,active)
  VALUES(invitation.clinic_id,auth.uid(),invitation.role,true)
  ON CONFLICT(clinic_id,user_id,role) DO UPDATE SET active=true
  RETURNING * INTO result;

  IF invitation.role = 'PHYSIOTHERAPIST' THEN
    PERFORM public.provision_invited_physiotherapist(invitation.clinic_id, auth.uid());
  END IF;

  UPDATE public.clinic_invitations SET accepted_at=now() WHERE id=invitation.id;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid(),'TEAM_INVITATION_ACCEPTED','clinic_invitation',invitation.id,
         jsonb_build_object('clinic_id',invitation.clinic_id,'role',invitation.role));
  RETURN result;
END;
$$;

-- Repair already accepted/internally-created PHYSIOTHERAPIST memberships that
-- predate automatic provisioning. Skip conflicts instead of moving ownership.
DO $$
DECLARE member record;
BEGIN
  FOR member IN
    SELECT m.clinic_id, m.user_id
    FROM public.clinic_memberships m
    WHERE m.role='PHYSIOTHERAPIST' AND m.active
      AND NOT EXISTS(SELECT 1 FROM public.physiotherapists p WHERE p.user_id=m.user_id)
  LOOP
    PERFORM public.provision_invited_physiotherapist(member.clinic_id, member.user_id);
  END LOOP;
END $$;

DROP POLICY IF EXISTS physio_clinic_member_read ON public.physiotherapists;
CREATE POLICY physio_clinic_member_read ON public.physiotherapists
FOR SELECT TO authenticated
USING (
  (clinic_id IS NOT NULL AND public.is_clinic_member(clinic_id))
  OR public.is_admin(auth.uid())
);

GRANT EXECUTE ON FUNCTION public.accept_clinic_invitation(text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.accept_clinic_invitation(text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.provision_invited_physiotherapist(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_invited_physiotherapist(uuid,uuid) TO service_role;
