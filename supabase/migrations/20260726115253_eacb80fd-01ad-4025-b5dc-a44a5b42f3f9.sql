CREATE POLICY "versions_update_production" ON public.estimate_versions
FOR UPDATE TO authenticated
USING (
  snapshot_kind = 'production'
  AND EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_versions.estimate_id)
)
WITH CHECK (
  snapshot_kind = 'production'
  AND EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_versions.estimate_id)
);