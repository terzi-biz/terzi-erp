
DROP VIEW IF EXISTS public.staff_directory;

CREATE OR REPLACE FUNCTION public.can_view_object(_object_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT _object_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.objects o WHERE o.id = _object_id)
    OR EXISTS (
      SELECT 1 FROM public.object_assignments a
      WHERE a.object_id = _object_id AND a.user_id = auth.uid()
    )
  );
$$;

DROP POLICY IF EXISTS "objects_read_scoped" ON public.objects;
DROP FUNCTION IF EXISTS public.is_object_assignee(uuid);

CREATE POLICY "objects_read_scoped" ON public.objects FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR manager_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'director')
);

DROP POLICY IF EXISTS "obj_assign_read" ON public.object_assignments;
CREATE POLICY "obj_assign_read" ON public.object_assignments FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.objects o WHERE o.id = object_assignments.object_id)
);
