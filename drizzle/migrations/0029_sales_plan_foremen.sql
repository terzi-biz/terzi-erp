CREATE TABLE public.sales_plan_foremen (
  month date NOT NULL,
  foreman_name text NOT NULL,
  target numeric(16,2) NOT NULL DEFAULT 0,
  target_orders integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (month, foreman_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_plan_foremen TO authenticated;
GRANT ALL ON public.sales_plan_foremen TO service_role;
ALTER TABLE public.sales_plan_foremen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_plan_foremen_select" ON public.sales_plan_foremen FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_plan_foremen_write" ON public.sales_plan_foremen FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'finance'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'director') OR has_role(auth.uid(),'finance'));