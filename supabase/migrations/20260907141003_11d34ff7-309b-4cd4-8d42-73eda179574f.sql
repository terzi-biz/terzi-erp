ALTER TABLE public.finance_projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_score integer,
  ADD COLUMN IF NOT EXISTS match_source text;

ALTER TABLE public.finance_counterparties
  ADD COLUMN IF NOT EXISTS match_score integer,
  ADD COLUMN IF NOT EXISTS match_source text;

ALTER TABLE public.finance_categories
  ADD COLUMN IF NOT EXISTS cost_class text;

ALTER TABLE public.payroll_payments
  ADD COLUMN IF NOT EXISTS finmap_external_id text,
  ADD COLUMN IF NOT EXISTS finmap_status text;

CREATE INDEX IF NOT EXISTS finance_projects_order_idx ON public.finance_projects(order_id);
CREATE INDEX IF NOT EXISTS finance_counterparties_client_idx ON public.finance_counterparties(client_id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_payments_finmap_ext_key ON public.payroll_payments(finmap_external_id) WHERE finmap_external_id IS NOT NULL;