ALTER TABLE public.crm_calls
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS measurement_id uuid REFERENCES public.order_measurements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_calls_order_id_idx ON public.crm_calls (order_id);
CREATE INDEX IF NOT EXISTS crm_calls_measurement_id_idx ON public.crm_calls (measurement_id);

-- Backfill 1: замовлення через лід дзвінка.
UPDATE public.crm_calls c
SET order_id = l.order_id
FROM public.crm_leads l
WHERE c.order_id IS NULL
  AND c.lead_id = l.id
  AND l.order_id IS NOT NULL;

-- Backfill 2: замовлення через клієнта, якщо в нього рівно одне замовлення.
UPDATE public.crm_calls c
SET order_id = s.order_id
FROM (
  SELECT client_id, (array_agg(id ORDER BY created_at))[1] AS order_id
  FROM public.orders
  WHERE client_id IS NOT NULL
  GROUP BY client_id
  HAVING count(*) = 1
) s
WHERE c.order_id IS NULL
  AND c.client_id = s.client_id;

-- Backfill 3: найсвіжіший замір замовлення.
UPDATE public.crm_calls c
SET measurement_id = m.measurement_id
FROM (
  SELECT DISTINCT ON (order_id) order_id, id AS measurement_id
  FROM public.order_measurements
  WHERE order_id IS NOT NULL
  ORDER BY order_id, coalesce(scheduled_at, measured_at, created_at) DESC
) m
WHERE c.measurement_id IS NULL
  AND c.order_id = m.order_id;

-- Налаштування автоматичного створення заміру з дзвінка.
ALTER TABLE public.binotel_settings
  ADD COLUMN IF NOT EXISTS auto_create_measurement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS measurement_min_duration_sec integer NOT NULL DEFAULT 60;