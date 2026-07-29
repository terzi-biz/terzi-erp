
-- Helper: can current user view an object (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.can_view_object(_object_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _object_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.objects o
      WHERE o.id = _object_id
        AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.object_assignments a
      WHERE a.object_id = _object_id AND a.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'director')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_object_assignee(_object_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.object_assignments a
    WHERE a.object_id = _object_id AND a.user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_object(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_object_assignee(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_view_object(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_object_assignee(uuid) TO authenticated;

-- objects: scoped read
DROP POLICY IF EXISTS "objects_read_all_auth" ON public.objects;
CREATE POLICY "objects_read_scoped" ON public.objects FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR manager_id = auth.uid()
  OR public.is_object_assignee(id)
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'director')
);

-- object child tables: scoped read
DROP POLICY IF EXISTS "obj_assign_read" ON public.object_assignments;
CREATE POLICY "obj_assign_read" ON public.object_assignments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_comments_read" ON public.object_comments;
CREATE POLICY "obj_comments_read" ON public.object_comments FOR SELECT TO authenticated
USING (author_id = auth.uid() OR public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_files_read" ON public.object_files;
CREATE POLICY "obj_files_read" ON public.object_files FOR SELECT TO authenticated
USING (uploaded_by = auth.uid() OR public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_meas_read" ON public.object_measurements;
CREATE POLICY "obj_meas_read" ON public.object_measurements FOR SELECT TO authenticated
USING (surveyor_id = auth.uid() OR public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_services_read" ON public.object_services;
CREATE POLICY "obj_services_read" ON public.object_services FOR SELECT TO authenticated
USING (public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_zones_read" ON public.object_zones;
CREATE POLICY "obj_zones_read" ON public.object_zones FOR SELECT TO authenticated
USING (public.can_view_object(object_id));

DROP POLICY IF EXISTS "obj_hist_read" ON public.object_status_history;
CREATE POLICY "obj_hist_read" ON public.object_status_history FOR SELECT TO authenticated
USING (changed_by = auth.uid() OR public.can_view_object(object_id));

DROP POLICY IF EXISTS "Authenticated can read bookings" ON public.crew_bookings;
CREATE POLICY "crew_bookings_read_scoped" ON public.crew_bookings FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_view_object(object_id)
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'director')
  OR public.has_role(auth.uid(),'manager')
);

DROP POLICY IF EXISTS "Authenticated can read calendar events" ON public.calendar_events;
CREATE POLICY "calendar_events_read_scoped" ON public.calendar_events FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR responsible_user_id = auth.uid()
  OR employee_id = auth.uid()
  OR manager_id = auth.uid()
  OR auth.uid() = ANY (participants)
  OR public.can_view_object(object_id)
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'director')
  OR public.has_role(auth.uid(),'manager')
);

-- estimate_versions: ownership / role scoped
DROP POLICY IF EXISTS "versions_select_via_estimate" ON public.estimate_versions;
DROP POLICY IF EXISTS "versions_insert_via_estimate" ON public.estimate_versions;
DROP POLICY IF EXISTS "versions_update_production" ON public.estimate_versions;

CREATE POLICY "versions_select_owner_or_role" ON public.estimate_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.estimates e
  WHERE e.id = estimate_versions.estimate_id
    AND (e.owner_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'director')
      OR public.has_role(auth.uid(),'finance'))
));

CREATE POLICY "versions_insert_owner_or_role" ON public.estimate_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.estimates e
  WHERE e.id = estimate_versions.estimate_id
    AND (e.owner_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'director')
      OR public.has_role(auth.uid(),'finance'))
));

CREATE POLICY "versions_update_production_owner_or_role" ON public.estimate_versions FOR UPDATE TO authenticated
USING (snapshot_kind = 'production'::snapshot_kind AND EXISTS (
  SELECT 1 FROM public.estimates e
  WHERE e.id = estimate_versions.estimate_id
    AND (e.owner_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'director')
      OR public.has_role(auth.uid(),'finance'))
))
WITH CHECK (snapshot_kind = 'production'::snapshot_kind AND EXISTS (
  SELECT 1 FROM public.estimates e
  WHERE e.id = estimate_versions.estimate_id
    AND (e.owner_id = auth.uid()
      OR public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'director')
      OR public.has_role(auth.uid(),'finance'))
));

-- profiles: contact details restricted; name directory for display
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "profiles_read_self_or_admin" ON public.profiles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'director')
);

CREATE OR REPLACE VIEW public.staff_directory AS
  SELECT user_id, display_name, avatar_url, department, "position", is_active
  FROM public.profiles;

REVOKE ALL ON public.staff_directory FROM anon;
GRANT SELECT ON public.staff_directory TO authenticated;
GRANT ALL ON public.staff_directory TO service_role;
