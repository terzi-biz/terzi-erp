ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS management_data jsonb NOT NULL DEFAULT '{}'::jsonb;