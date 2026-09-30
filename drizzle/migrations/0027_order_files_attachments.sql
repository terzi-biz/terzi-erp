ALTER TABLE public.order_files ADD COLUMN IF NOT EXISTS measurement_id uuid REFERENCES public.order_measurements(id) ON DELETE SET NULL;
ALTER TABLE public.order_files ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL;
ALTER TABLE public.order_files ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.order_files ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.order_files ADD COLUMN IF NOT EXISTS size_bytes bigint;
CREATE INDEX IF NOT EXISTS idx_order_files_measurement ON public.order_files(measurement_id);
CREATE INDEX IF NOT EXISTS idx_order_files_estimate ON public.order_files(estimate_id);

CREATE POLICY "order_files_obj_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-files' AND private.can_view_object(((storage.foldername(name))[1])::uuid));
CREATE POLICY "order_files_obj_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-files' AND private.can_view_object(((storage.foldername(name))[1])::uuid));
CREATE POLICY "order_files_obj_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-files' AND (owner = auth.uid() OR private.can_manage_object(((storage.foldername(name))[1])::uuid)));