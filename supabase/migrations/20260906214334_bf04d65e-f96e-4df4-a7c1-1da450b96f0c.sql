ALTER TABLE public.marketing_daily_metrics
  ADD COLUMN IF NOT EXISTS spend_original numeric,
  ADD COLUMN IF NOT EXISTS currency_original text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric;