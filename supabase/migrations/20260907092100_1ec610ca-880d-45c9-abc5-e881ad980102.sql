-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.is_finance_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'director') OR public.has_role(_uid,'finance')
$$;
REVOKE ALL ON FUNCTION public.is_finance_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_finance_user(uuid) TO authenticated, service_role;

-- ============ finance_accounts extension ============
ALTER TABLE public.finance_accounts
  ADD COLUMN IF NOT EXISTS finmap_id text,
  ADD COLUMN IF NOT EXISTS actual_balance numeric,
  ADD COLUMN IF NOT EXISTS balance_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX IF NOT EXISTS finance_accounts_finmap_id_key ON public.finance_accounts(finmap_id) WHERE finmap_id IS NOT NULL;

-- ============ finance_categories ============
CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'expense',
  parent_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  plan_article text,
  finmap_id text,
  source text NOT NULL DEFAULT 'manual',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_finmap_id_key ON public.finance_categories(finmap_id) WHERE finmap_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT ALL ON public.finance_categories TO service_role;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_categories_rw" ON public.finance_categories FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finance_categories_updated BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finance_counterparties ============
CREATE TABLE IF NOT EXISTS public.finance_counterparties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'other',
  name text NOT NULL,
  phone text,
  email text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  finmap_id text,
  finmap_kind text,
  source text NOT NULL DEFAULT 'manual',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_counterparties_finmap_key ON public.finance_counterparties(finmap_kind, finmap_id) WHERE finmap_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_counterparties TO authenticated;
GRANT ALL ON public.finance_counterparties TO service_role;
ALTER TABLE public.finance_counterparties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_counterparties_rw" ON public.finance_counterparties FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finance_counterparties_updated BEFORE UPDATE ON public.finance_counterparties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finance_projects (Finmap projects) ============
CREATE TABLE IF NOT EXISTS public.finance_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  finmap_id text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'finmap',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_projects_finmap_id_key ON public.finance_projects(finmap_id) WHERE finmap_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_projects TO authenticated;
GRANT ALL ON public.finance_projects TO service_role;
ALTER TABLE public.finance_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_projects_rw" ON public.finance_projects FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finance_projects_updated BEFORE UPDATE ON public.finance_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finance_transactions ============
CREATE TABLE IF NOT EXISTS public.finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  op_date date NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'UAH',
  amount_uah numeric,
  fx_rate numeric,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  finance_project_id uuid REFERENCES public.finance_projects(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  comment text,
  source text NOT NULL DEFAULT 'finmap',
  external_id text,
  finmap_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_status text NOT NULL DEFAULT 'unmatched',
  sync_status text NOT NULL DEFAULT 'synced',
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_finmap_id_key ON public.finance_transactions(finmap_id) WHERE finmap_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_external_id_key ON public.finance_transactions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS finance_transactions_date_idx ON public.finance_transactions(op_date DESC);
CREATE INDEX IF NOT EXISTS finance_transactions_order_idx ON public.finance_transactions(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;
GRANT ALL ON public.finance_transactions TO service_role;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_transactions_rw" ON public.finance_transactions FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finance_transactions_updated BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finance_transaction_links ============
CREATE TABLE IF NOT EXISTS public.finance_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.finance_transactions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  amount numeric,
  confidence numeric,
  status text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transaction_links TO authenticated;
GRANT ALL ON public.finance_transaction_links TO service_role;
ALTER TABLE public.finance_transaction_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_transaction_links_rw" ON public.finance_transaction_links FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finance_transaction_links_updated BEFORE UPDATE ON public.finance_transaction_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finmap_entity_mappings ============
CREATE TABLE IF NOT EXISTS public.finmap_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finmap_kind text NOT NULL,
  finmap_id text NOT NULL,
  finmap_name text,
  erp_entity text,
  erp_id uuid,
  status text NOT NULL DEFAULT 'unmatched',
  confidence numeric,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finmap_kind, finmap_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finmap_entity_mappings TO authenticated;
GRANT ALL ON public.finmap_entity_mappings TO service_role;
ALTER TABLE public.finmap_entity_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finmap_entity_mappings_rw" ON public.finmap_entity_mappings FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER finmap_entity_mappings_updated BEFORE UPDATE ON public.finmap_entity_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finmap_sync_state ============
CREATE TABLE IF NOT EXISTS public.finmap_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL UNIQUE,
  cursor text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  items_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.finmap_sync_state TO authenticated;
GRANT ALL ON public.finmap_sync_state TO service_role;
ALTER TABLE public.finmap_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finmap_sync_state_read" ON public.finmap_sync_state FOR SELECT TO authenticated
  USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER finmap_sync_state_updated BEFORE UPDATE ON public.finmap_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ finmap_sync_log ============
CREATE TABLE IF NOT EXISTS public.finmap_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  mode text NOT NULL DEFAULT 'incremental',
  status text NOT NULL DEFAULT 'ok',
  http_status integer,
  fetched integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  updated integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  duration_ms integer,
  message text,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finmap_sync_log_created_idx ON public.finmap_sync_log(created_at DESC);
GRANT SELECT ON public.finmap_sync_log TO authenticated;
GRANT ALL ON public.finmap_sync_log TO service_role;
ALTER TABLE public.finmap_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finmap_sync_log_read" ON public.finmap_sync_log FOR SELECT TO authenticated
  USING (public.is_finance_user(auth.uid()));

-- ============ finmap_webhook_events ============
CREATE TABLE IF NOT EXISTS public.finmap_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text,
  provider_event_id text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finmap_webhook_events_hash_key ON public.finmap_webhook_events(payload_hash);
CREATE UNIQUE INDEX IF NOT EXISTS finmap_webhook_events_provider_key ON public.finmap_webhook_events(provider_event_id) WHERE provider_event_id IS NOT NULL;
GRANT SELECT ON public.finmap_webhook_events TO authenticated;
GRANT ALL ON public.finmap_webhook_events TO service_role;
ALTER TABLE public.finmap_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finmap_webhook_events_read" ON public.finmap_webhook_events FOR SELECT TO authenticated
  USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER finmap_webhook_events_updated BEFORE UPDATE ON public.finmap_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payroll_profiles ============
CREATE TABLE IF NOT EXISTS public.payroll_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  role_key text,
  payroll_group text NOT NULL DEFAULT 'administrative',
  base_salary numeric NOT NULL DEFAULT 0,
  advance_percent numeric NOT NULL DEFAULT 50,
  kpi_scheme jsonb NOT NULL DEFAULT '[]'::jsonb,
  bonus_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_profiles_employee_idx ON public.payroll_profiles(employee_id, valid_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_profiles TO authenticated;
GRANT ALL ON public.payroll_profiles TO service_role;
ALTER TABLE public.payroll_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_profiles_rw" ON public.payroll_profiles FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER payroll_profiles_updated BEFORE UPDATE ON public.payroll_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payroll_calculations ============
CREATE TABLE IF NOT EXISTS public.payroll_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.payroll_profiles(id) ON DELETE SET NULL,
  payroll_group text NOT NULL DEFAULT 'administrative',
  base_amount numeric NOT NULL DEFAULT 0,
  advance_amount numeric NOT NULL DEFAULT 0,
  kpi_amount numeric NOT NULL DEFAULT 0,
  bonus_amount numeric NOT NULL DEFAULT 0,
  deduction_amount numeric NOT NULL DEFAULT 0,
  reimbursement_amount numeric NOT NULL DEFAULT 0,
  total_payable numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'calculated',
  engine_version text,
  computed_at timestamptz,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_calculations TO authenticated;
GRANT ALL ON public.payroll_calculations TO service_role;
ALTER TABLE public.payroll_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_calculations_rw" ON public.payroll_calculations FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER payroll_calculations_updated BEFORE UPDATE ON public.payroll_calculations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payroll_items ============
CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.payroll_calculations(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  name text NOT NULL,
  qty numeric,
  rate numeric,
  amount numeric NOT NULL DEFAULT 0,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_items_calc_idx ON public.payroll_items(calculation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_items TO authenticated;
GRANT ALL ON public.payroll_items TO service_role;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_items_rw" ON public.payroll_items FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER payroll_items_updated BEFORE UPDATE ON public.payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payroll_kpis ============
CREATE TABLE IF NOT EXISTS public.payroll_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.payroll_calculations(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  kpi_type text NOT NULL DEFAULT 'FIXED_KPI',
  target numeric,
  actual numeric,
  weight numeric,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  result numeric,
  bonus numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'calculated',
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_kpis_calc_idx ON public.payroll_kpis(calculation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_kpis TO authenticated;
GRANT ALL ON public.payroll_kpis TO service_role;
ALTER TABLE public.payroll_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_kpis_rw" ON public.payroll_kpis FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER payroll_kpis_updated BEFORE UPDATE ON public.payroll_kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ payroll_approvals ============
CREATE TABLE IF NOT EXISTS public.payroll_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid REFERENCES public.payroll_calculations(id) ON DELETE CASCADE,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_id uuid,
  comment text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_approvals_calc_idx ON public.payroll_approvals(calculation_id, created_at DESC);
GRANT SELECT, INSERT ON public.payroll_approvals TO authenticated;
GRANT ALL ON public.payroll_approvals TO service_role;
ALTER TABLE public.payroll_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_approvals_read" ON public.payroll_approvals FOR SELECT TO authenticated
  USING (public.is_finance_user(auth.uid()));
CREATE POLICY "payroll_approvals_insert" ON public.payroll_approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_user(auth.uid()));

-- ============ payroll_payments ============
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid REFERENCES public.payroll_calculations(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.payroll_employees(id) ON DELETE SET NULL,
  period_id uuid REFERENCES public.payroll_periods(id) ON DELETE SET NULL,
  payment_kind text NOT NULL DEFAULT 'salary',
  amount numeric NOT NULL DEFAULT 0,
  paid_at date,
  transaction_id uuid REFERENCES public.finance_transactions(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_payments_calc_idx ON public.payroll_payments(calculation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_payments TO authenticated;
GRANT ALL ON public.payroll_payments TO service_role;
ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_payments_rw" ON public.payroll_payments FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));
CREATE TRIGGER payroll_payments_updated BEFORE UPDATE ON public.payroll_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
