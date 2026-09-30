ALTER TABLE public.finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_state_chk;
ALTER TABLE public.finance_transactions ADD CONSTRAINT finance_transactions_state_chk CHECK (state = ANY (ARRAY['actual'::text, 'scheduled'::text, 'deleted_in_finmap'::text]));
CREATE INDEX IF NOT EXISTS finance_transactions_state_op_date_idx ON public.finance_transactions (state, op_date);
COMMENT ON COLUMN public.finance_transactions.state IS 'actual | scheduled | deleted_in_finmap (soft delete: операції більше немає у Finmap; виключена з усіх звітів, відновлюється при появі)';