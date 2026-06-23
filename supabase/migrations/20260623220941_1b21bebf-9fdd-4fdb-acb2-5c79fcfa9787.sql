
DROP POLICY IF EXISTS "Only admins can modify roles" ON public.user_roles;

CREATE POLICY "Only admins can insert roles"
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can update roles"
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Only admins can delete roles"
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
