DO $$
DECLARE keep uuid := 'a89f1688-2e30-4c83-9e84-e8bdeeb7c61f';
BEGIN
  UPDATE public.profiles SET display_name = 'Малюта Олег', position = 'CEO / Генеральний директор' WHERE user_id = keep;
  UPDATE public.user_access SET role_key = 'owner', status = 'active' WHERE user_id = keep;

  DELETE FROM public.user_permission_overrides WHERE user_id <> keep;
  DELETE FROM public.user_roles WHERE user_id <> keep;
  DELETE FROM public.user_access WHERE user_id <> keep;
  DELETE FROM public.registration_approvals WHERE user_id <> keep;
  DELETE FROM public.profiles WHERE user_id <> keep;
  DELETE FROM auth.users WHERE id <> keep;
END $$;