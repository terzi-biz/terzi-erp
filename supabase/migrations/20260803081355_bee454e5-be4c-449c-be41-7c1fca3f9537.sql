-- 1) Restrict cost/price reads to privileged roles
DROP POLICY IF EXISTS "Auth read catalog" ON public.catalog_items;
CREATE POLICY "Staff read catalog" ON public.catalog_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Authenticated can read tier margins" ON public.catalog_tier_margins;
CREATE POLICY "Staff read tier margins" ON public.catalog_tier_margins FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "material_items read auth" ON public.material_items;
CREATE POLICY "material_items read staff" ON public.material_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "work_items read auth" ON public.work_items;
CREATE POLICY "work_items read staff" ON public.work_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "logistics_items read auth" ON public.logistics_items;
CREATE POLICY "logistics_items read staff" ON public.logistics_items FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "additional_services read auth" ON public.additional_services;
CREATE POLICY "additional_services read staff" ON public.additional_services FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'manager'));

-- 2) Move SECURITY DEFINER helpers out of the exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.can_manage_access(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_manage_object(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_object(uuid) SET SCHEMA private;
ALTER FUNCTION public.crm_is_manager() SET SCHEMA private;
ALTER FUNCTION public.has_permission(uuid, text, text) SET SCHEMA private;
ALTER FUNCTION public.is_access_owner(uuid) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.can_manage_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_object(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_view_object(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.crm_is_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_access_owner(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.can_manage_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_object(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_view_object(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.crm_is_manager() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_permission(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_access_owner(uuid) TO authenticated, service_role;