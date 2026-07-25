
-- Helper: can current user manage an object?
CREATE OR REPLACE FUNCTION public.can_manage_object(_object_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.objects o
    WHERE o.id = _object_id
      AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid()
           OR public.has_role(auth.uid(),'admin')
           OR public.has_role(auth.uid(),'director'))
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_object(uuid) TO authenticated;

-- Replace permissive policies
DROP POLICY IF EXISTS "obj_services_all_auth" ON public.object_services;
CREATE POLICY "obj_services_read" ON public.object_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_services_write" ON public.object_services FOR ALL TO authenticated
  USING (public.can_manage_object(object_id)) WITH CHECK (public.can_manage_object(object_id));

DROP POLICY IF EXISTS "obj_zones_all_auth" ON public.object_zones;
CREATE POLICY "obj_zones_read" ON public.object_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_zones_write" ON public.object_zones FOR ALL TO authenticated
  USING (public.can_manage_object(object_id)) WITH CHECK (public.can_manage_object(object_id));

DROP POLICY IF EXISTS "obj_meas_all_auth" ON public.object_measurements;
CREATE POLICY "obj_meas_read" ON public.object_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_meas_write" ON public.object_measurements FOR ALL TO authenticated
  USING (public.can_manage_object(object_id) OR surveyor_id = auth.uid())
  WITH CHECK (public.can_manage_object(object_id) OR surveyor_id = auth.uid());

DROP POLICY IF EXISTS "obj_assign_all_auth" ON public.object_assignments;
CREATE POLICY "obj_assign_read" ON public.object_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_assign_write" ON public.object_assignments FOR ALL TO authenticated
  USING (public.can_manage_object(object_id)) WITH CHECK (public.can_manage_object(object_id));

DROP POLICY IF EXISTS "obj_files_all_auth" ON public.object_files;
CREATE POLICY "obj_files_read" ON public.object_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_files_insert" ON public.object_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() OR public.can_manage_object(object_id));
CREATE POLICY "obj_files_update" ON public.object_files FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_manage_object(object_id))
  WITH CHECK (uploaded_by = auth.uid() OR public.can_manage_object(object_id));
CREATE POLICY "obj_files_delete" ON public.object_files FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_manage_object(object_id));

DROP POLICY IF EXISTS "obj_comments_all_auth" ON public.object_comments;
CREATE POLICY "obj_comments_read" ON public.object_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_comments_insert" ON public.object_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "obj_comments_update" ON public.object_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_manage_object(object_id))
  WITH CHECK (author_id = auth.uid() OR public.can_manage_object(object_id));
CREATE POLICY "obj_comments_delete" ON public.object_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_manage_object(object_id));

DROP POLICY IF EXISTS "obj_hist_insert" ON public.object_status_history;
CREATE POLICY "obj_hist_insert" ON public.object_status_history FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() OR public.can_manage_object(object_id));
