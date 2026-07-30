
-- 1) Ownership-aware object visibility
CREATE OR REPLACE FUNCTION public.can_view_object(_object_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _object_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.objects o
      WHERE o.id = _object_id
        AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.object_assignments a
      WHERE a.object_id = _object_id AND a.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','director')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_object(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_object(uuid) TO authenticated;

-- 2) can_manage_object hardened the same way (avoid RLS-recursion, definer)
CREATE OR REPLACE FUNCTION public.can_manage_object(_object_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _object_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.objects o
      WHERE o.id = _object_id
        AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','director')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_object(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_object(uuid) TO authenticated;

-- 3) Assignments must not be world-readable
DROP POLICY IF EXISTS obj_assign_read ON public.object_assignments;
CREATE POLICY obj_assign_read ON public.object_assignments
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_view_object(object_id));

-- 4) Assigned staff should also see the object row itself
DROP POLICY IF EXISTS objects_read_scoped ON public.objects;
CREATE POLICY objects_read_scoped ON public.objects
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR manager_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.object_assignments a
    WHERE a.object_id = objects.id AND a.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'director')
);

-- 5) price_history: append-only via service role, immutable
DROP POLICY IF EXISTS price_history_insert_service ON public.price_history;
CREATE POLICY price_history_insert_service ON public.price_history
FOR INSERT TO service_role
WITH CHECK (true);
GRANT INSERT ON public.price_history TO service_role;
