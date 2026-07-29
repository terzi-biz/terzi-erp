CREATE POLICY "objects_delete_own_or_manager" ON public.objects
FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR manager_id = auth.uid());