CREATE OR REPLACE FUNCTION public.is_access_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
  ELSE EXISTS (
    SELECT 1 FROM public.user_access ua
    WHERE ua.user_id = _user_id AND ua.status = 'active' AND ua.role_key = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('admin','director')
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
  ELSE public.is_access_owner(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_access ua
    WHERE ua.user_id = _user_id AND ua.status = 'active' AND ua.role_key = 'ops_admin'
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.access_status;
  v_role text;
  v_expires timestamptz;
  v_override public.permission_effect;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT status, role_key, access_expires_at INTO v_status, v_role, v_expires
  FROM public.user_access WHERE user_id = _user_id;

  IF v_status IS NULL THEN
    RETURN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role IN ('admin','director'));
  END IF;

  IF v_status <> 'active' THEN RETURN false; END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;

  SELECT effect INTO v_override FROM public.user_permission_overrides o
  WHERE o.user_id = _user_id AND o.module = _module AND o.action = _action
    AND (o.expires_at IS NULL OR o.expires_at > now());
  IF v_override = 'deny' THEN RETURN false; END IF;
  IF v_override = 'allow' THEN RETURN true; END IF;

  SELECT allowed INTO v_allowed FROM public.role_permissions rp
  WHERE rp.role_key = v_role AND rp.module = _module AND rp.action = _action;
  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_access_owner(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_access_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, service_role;