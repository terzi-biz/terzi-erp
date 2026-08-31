ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS work_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON public.orders (ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_work_tags ON public.orders USING gin (work_tags);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external ON public.orders (external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_files_order ON public.order_files (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_tasks_external_key ON public.crm_tasks (external_key)
  WHERE external_key IS NOT NULL;