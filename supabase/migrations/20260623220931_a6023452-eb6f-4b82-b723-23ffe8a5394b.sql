
-- 1) Convert has_role from SECURITY DEFINER to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- 2) Tighten EXECUTE: revoke from PUBLIC and anon, keep authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3) Defense-in-depth: restrictive policy blocking non-admins from writing to user_roles
DROP POLICY IF EXISTS "Only admins can modify roles" ON public.user_roles;
CREATE POLICY "Only admins can modify roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
