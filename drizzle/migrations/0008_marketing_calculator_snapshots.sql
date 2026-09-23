CREATE TABLE public.marketing_calculator_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_month text NOT NULL CHECK (plan_month ~ '^\d{4}-\d{2}$'),
  version integer NOT NULL,
  inputs jsonb NOT NULL,
  outputs jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine_version text NOT NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_month, version)
);
GRANT SELECT, INSERT ON public.marketing_calculator_snapshots TO authenticated;
GRANT ALL ON public.marketing_calculator_snapshots TO service_role;
ALTER TABLE public.marketing_calculator_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcs select" ON public.marketing_calculator_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "mcs insert" ON public.marketing_calculator_snapshots FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());