REVOKE EXECUTE ON FUNCTION public.is_access_owner(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon, PUBLIC;