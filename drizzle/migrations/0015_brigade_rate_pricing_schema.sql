ALTER TABLE public.brigade_work_rates
  ADD COLUMN IF NOT EXISTS pricing text NOT NULL DEFAULT 'per_unit',
  ADD COLUMN IF NOT EXISTS minimum_amount numeric,
  ADD COLUMN IF NOT EXISTS threshold_qty numeric;
ALTER TABLE public.brigade_work_rates DROP CONSTRAINT IF EXISTS brigade_work_rates_pricing_chk;
ALTER TABLE public.brigade_work_rates ADD CONSTRAINT brigade_work_rates_pricing_chk CHECK (
  (pricing = 'per_unit')
  OR (pricing = 'minimum' AND minimum_amount IS NOT NULL AND minimum_amount >= 0)
  OR (pricing = 'fixed_until_threshold' AND minimum_amount IS NOT NULL AND minimum_amount >= 0 AND threshold_qty IS NOT NULL AND threshold_qty > 0)
);
COMMENT ON COLUMN public.brigade_work_rates.pricing IS 'per_unit: qty*rate; minimum: max(minimum_amount, qty*rate); fixed_until_threshold: qty<=threshold_qty → minimum_amount, інакше qty*rate';