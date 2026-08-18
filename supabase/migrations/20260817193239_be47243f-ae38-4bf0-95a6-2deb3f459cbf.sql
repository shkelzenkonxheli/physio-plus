INSERT INTO public.user_roles (user_id, role)
SELECT id, 'SUPER_ADMIN'::public.app_role FROM public.profiles WHERE email = 'physioplus26@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;