CREATE INDEX IF NOT EXISTS idx_crm_calls_external_id ON public.crm_calls (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_calls_created_at ON public.crm_calls (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tx_payment_date ON public.finance_transactions (state, payment_date);
CREATE INDEX IF NOT EXISTS idx_finance_tx_kind ON public.finance_transactions (kind);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON public.clients (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_created_at ON public.crm_leads (created_at DESC);
DROP INDEX IF EXISTS public.crm_calls_started_at_idx;