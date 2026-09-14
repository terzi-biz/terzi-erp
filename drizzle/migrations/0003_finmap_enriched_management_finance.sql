-- Етап 2: збагачені дані Finmap (касова дата vs управлінський період, планові операції,
-- розподіли по проєктах/статтях, теги, рахунки постачальників, зобовʼязання).

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'actual',
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS approved boolean,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS allocation_status text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  ALTER TABLE public.finance_transactions
    ADD CONSTRAINT finance_transactions_state_chk CHECK (state IN ('actual','scheduled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.finance_transactions
    ADD CONSTRAINT finance_transactions_alloc_chk CHECK (allocation_status IN ('none','partial','full','manual','needs_review'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS finance_transactions_state_idx ON public.finance_transactions (state, op_date);
CREATE INDEX IF NOT EXISTS finance_transactions_period_idx ON public.finance_transactions (period_start, period_end);

-- Бек-філ: історичні операції лишаються фактичними; управлінський період = касова дата.
UPDATE public.finance_transactions
   SET payment_date = COALESCE(payment_date, op_date)
 WHERE payment_date IS NULL;

-- ---------- Розподіли операції по проєктах / статтях / послугах ----------
CREATE TABLE IF NOT EXISTS public.finance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.finance_transactions(id) ON DELETE CASCADE,
  dimension text NOT NULL CHECK (dimension IN ('project','category','service')),
  ref_finmap_id text,
  ref_name text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  service text,
  amount numeric NOT NULL DEFAULT 0,
  share numeric,
  source text NOT NULL DEFAULT 'finmap' CHECK (source IN ('finmap','manual','deterministic')),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','needs_review')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_allocations_uniq
  ON public.finance_allocations (transaction_id, dimension, COALESCE(ref_finmap_id,''), COALESCE(service,''));
CREATE INDEX IF NOT EXISTS finance_allocations_order_idx ON public.finance_allocations (order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_allocations TO authenticated;
GRANT ALL ON public.finance_allocations TO service_role;
ALTER TABLE public.finance_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_allocations_finance_only" ON public.finance_allocations
  FOR ALL TO authenticated USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));

-- ---------- Теги Finmap ----------
CREATE TABLE IF NOT EXISTS public.finance_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finmap_id text UNIQUE,
  name text NOT NULL,
  source text NOT NULL DEFAULT 'finmap',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_tags TO authenticated;
GRANT ALL ON public.finance_tags TO service_role;
ALTER TABLE public.finance_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance_tags_read" ON public.finance_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "finance_tags_write" ON public.finance_tags FOR ALL TO authenticated
  USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));

-- ---------- Рахунки постачальників із Finmap ----------
CREATE TABLE IF NOT EXISTS public.finmap_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finmap_id text UNIQUE,
  number text,
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  counterparty_name text,
  issue_date date,
  due_date date,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UAH',
  amount_uah numeric,
  vat_amount numeric,
  discount_amount numeric,
  delivery_amount numeric,
  status text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched','matched','needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finmap_invoices TO authenticated;
GRANT ALL ON public.finmap_invoices TO service_role;
ALTER TABLE public.finmap_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finmap_invoices_finance_only" ON public.finmap_invoices
  FOR ALL TO authenticated USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));

-- ---------- Зобовʼязання перед постачальниками (ERP) ----------
CREATE TABLE IF NOT EXISTS public.supplier_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id uuid REFERENCES public.finance_counterparties(id) ON DELETE SET NULL,
  supplier_name text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  finmap_invoice_id uuid REFERENCES public.finmap_invoices(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','invoice','procurement')),
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UAH',
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','closed','cancelled')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_obligations_invoice_uniq
  ON public.supplier_obligations (finmap_invoice_id) WHERE finmap_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_obligations_cp_idx ON public.supplier_obligations (counterparty_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_obligations TO authenticated;
GRANT ALL ON public.supplier_obligations TO service_role;
ALTER TABLE public.supplier_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supplier_obligations_finance_only" ON public.supplier_obligations
  FOR ALL TO authenticated USING (public.is_finance_user(auth.uid())) WITH CHECK (public.is_finance_user(auth.uid()));

-- Оновлення updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.finance_allocations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.finance_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.finmap_invoices;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.finmap_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_obligations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_obligations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();