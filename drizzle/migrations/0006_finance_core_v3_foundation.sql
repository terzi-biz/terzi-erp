-- Finance Core v3: versioned rules, asset register, reserves, reason codes.

CREATE TABLE public.finance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,                 -- compensation | overhead | reserve | tax | amortization
  code TEXT NOT NULL,                  -- sales_base, foreman_gp_percent, fnz_target_months ...
  label TEXT,
  value_num NUMERIC(18,6),
  value_text TEXT,
  value_json JSONB,
  unit TEXT,                           -- uah | percent | months | ratio
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  engine_version TEXT NOT NULL DEFAULT 'finance-core-3.0.0',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX finance_rules_lookup_idx ON public.finance_rules (scope, code, effective_from DESC);
GRANT SELECT ON public.finance_rules TO authenticated;
GRANT ALL ON public.finance_rules TO service_role;
ALTER TABLE public.finance_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_rules_select" ON public.finance_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "finance_rules_insert" ON public.finance_rules FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "finance_rules_update" ON public.finance_rules FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));

CREATE TABLE public.finance_reason_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  applies_to TEXT NOT NULL DEFAULT 'transaction',
  is_excluded_from_pnl BOOLEAN NOT NULL DEFAULT false,
  is_one_off BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finance_reason_codes TO authenticated;
GRANT ALL ON public.finance_reason_codes TO service_role;
ALTER TABLE public.finance_reason_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_reason_codes_select" ON public.finance_reason_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_reason_codes_write" ON public.finance_reason_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));

CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'equipment',   -- equipment | vehicle | tool | other
  inventory_no TEXT,
  purchase_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  salvage_value NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'UAH',
  commissioned_at DATE,
  method TEXT NOT NULL DEFAULT 'months',          -- months | hours | shifts | m2 | orders | fixed | manual
  life_units NUMERIC(18,4),
  used_units NUMERIC(18,4) NOT NULL DEFAULT 0,
  direction_key TEXT,
  responsible_id UUID,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX assets_status_idx ON public.assets (status);
GRANT SELECT, INSERT, UPDATE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets_select" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_write" ON public.assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));

CREATE TABLE public.asset_depreciation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                  -- YYYY-MM
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  units NUMERIC(18,4),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  direction_key TEXT,
  allocation_basis TEXT NOT NULL DEFAULT 'overhead',  -- direct | overhead
  engine_version TEXT NOT NULL DEFAULT 'finance-core-3.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period, order_id)
);
CREATE INDEX asset_depreciation_period_idx ON public.asset_depreciation (period);
GRANT SELECT, INSERT, UPDATE ON public.asset_depreciation TO authenticated;
GRANT ALL ON public.asset_depreciation TO service_role;
ALTER TABLE public.asset_depreciation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asset_depreciation_select" ON public.asset_depreciation FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "asset_depreciation_write" ON public.asset_depreciation FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));

CREATE TABLE public.finance_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                     -- fnz | warranty | capex
  period TEXT NOT NULL,                   -- YYYY-MM
  target_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  top_up NUMERIC(18,2) NOT NULL DEFAULT 0,
  used NUMERIC(18,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  reason_code TEXT,
  notes TEXT,
  engine_version TEXT NOT NULL DEFAULT 'finance-core-3.0.0',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, period)
);
GRANT SELECT, INSERT, UPDATE ON public.finance_reserves TO authenticated;
GRANT ALL ON public.finance_reserves TO service_role;
ALTER TABLE public.finance_reserves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_reserves_select" ON public.finance_reserves FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "finance_reserves_write" ON public.finance_reserves FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director') OR public.has_role(auth.uid(),'finance'));
