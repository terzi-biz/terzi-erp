CREATE TABLE public.roofing_config (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.roofing_config TO authenticated;
GRANT ALL ON public.roofing_config TO service_role;

ALTER TABLE public.roofing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roofing_config_select_auth" ON public.roofing_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "roofing_config_insert_admin" ON public.roofing_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE POLICY "roofing_config_update_admin" ON public.roofing_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE TRIGGER update_roofing_config_updated_at
  BEFORE UPDATE ON public.roofing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.roofing_cut_plans (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'quick',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_cut_plans TO authenticated;
GRANT ALL ON public.roofing_cut_plans TO service_role;

ALTER TABLE public.roofing_cut_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roofing_cut_plans_select_auth" ON public.roofing_cut_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "roofing_cut_plans_write_auth" ON public.roofing_cut_plans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "roofing_cut_plans_update_auth" ON public.roofing_cut_plans
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "roofing_cut_plans_delete_admin" ON public.roofing_cut_plans
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE TRIGGER update_roofing_cut_plans_updated_at
  BEFORE UPDATE ON public.roofing_cut_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_roofing_cut_plans_estimate ON public.roofing_cut_plans(estimate_id);
CREATE INDEX idx_roofing_cut_plans_order ON public.roofing_cut_plans(order_id);

CREATE TABLE public.roofing_actuals (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  estimate_id UUID REFERENCES public.estimates(id) ON DELETE SET NULL,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'шт',
  plan_qty NUMERIC NOT NULL DEFAULT 0,
  fact_qty NUMERIC NOT NULL DEFAULT 0,
  offcut_qty NUMERIC NOT NULL DEFAULT 0,
  writeoff_qty NUMERIC NOT NULL DEFAULT 0,
  labor_hours NUMERIC NOT NULL DEFAULT 0,
  deviation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_actuals TO authenticated;
GRANT ALL ON public.roofing_actuals TO service_role;

ALTER TABLE public.roofing_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roofing_actuals_select_auth" ON public.roofing_actuals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "roofing_actuals_insert_auth" ON public.roofing_actuals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "roofing_actuals_update_auth" ON public.roofing_actuals
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "roofing_actuals_delete_admin" ON public.roofing_actuals
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE TRIGGER update_roofing_actuals_updated_at
  BEFORE UPDATE ON public.roofing_actuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_roofing_actuals_order ON public.roofing_actuals(order_id);