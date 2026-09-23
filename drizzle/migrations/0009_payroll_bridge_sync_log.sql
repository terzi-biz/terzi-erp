CREATE TABLE public.payroll_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','error','skipped')),
  http_status integer,
  message text,
  payload_hash text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payroll_sync_log_order_idx ON public.payroll_sync_log(order_id, created_at DESC);
CREATE INDEX payroll_sync_log_created_idx ON public.payroll_sync_log(created_at DESC);
GRANT SELECT ON public.payroll_sync_log TO authenticated;
GRANT ALL ON public.payroll_sync_log TO service_role;
ALTER TABLE public.payroll_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance roles read payroll sync log" ON public.payroll_sync_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));