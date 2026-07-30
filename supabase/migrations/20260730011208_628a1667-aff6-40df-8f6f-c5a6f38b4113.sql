CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_name text;
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email);

  INSERT INTO public.profiles (user_id, email, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, v_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  INSERT INTO public.registration_approvals (user_id, email, display_name, avatar_url, status)
  VALUES (NEW.id, NEW.email, v_name, NEW.raw_user_meta_data->>'avatar_url', 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_access (user_id, role_key, scope, status)
  VALUES (NEW.id, NULL, 'own', 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.access_requests (user_id, email, display_name, kind, status)
  VALUES (NEW.id, NEW.email, v_name, 'registration', 'pending');

  RETURN NEW;
END;
$function$;