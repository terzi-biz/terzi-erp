DROP POLICY IF EXISTS "Authenticated can create calendar events" ON public.calendar_events;
CREATE POLICY "Authenticated can create calendar events"
ON public.calendar_events FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (object_id IS NULL OR private.can_view_object(object_id))
);

DROP POLICY IF EXISTS "Authenticated can insert bookings" ON public.crew_bookings;
CREATE POLICY "Authenticated can insert bookings"
ON public.crew_bookings FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (object_id IS NULL OR private.can_manage_object(object_id))
);

DROP POLICY IF EXISTS "obj_comments_insert" ON public.object_comments;
CREATE POLICY "obj_comments_insert"
ON public.object_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND private.can_view_object(object_id)
);

DROP POLICY IF EXISTS "Auth insert own audit entries" ON public.estimate_audit_log;
CREATE POLICY "Auth insert own audit entries"
ON public.estimate_audit_log FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.estimates e
    WHERE e.id = estimate_audit_log.estimate_id
      AND (
        e.owner_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
        OR has_role(auth.uid(), 'director'::app_role)
        OR has_role(auth.uid(), 'finance'::app_role)
      )
  )
);