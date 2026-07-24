
CREATE TABLE public.estimate_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX estimate_audit_log_estimate_idx ON public.estimate_audit_log(estimate_id, created_at DESC);

GRANT SELECT, INSERT ON public.estimate_audit_log TO authenticated;
GRANT ALL ON public.estimate_audit_log TO service_role;

ALTER TABLE public.estimate_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read audit log" ON public.estimate_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = estimate_audit_log.estimate_id
        AND (e.owner_id = auth.uid()
             OR has_role(auth.uid(), 'admin'::app_role)
             OR has_role(auth.uid(), 'director'::app_role)
             OR has_role(auth.uid(), 'finance'::app_role))
    )
  );

CREATE POLICY "Auth insert own audit entries" ON public.estimate_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
