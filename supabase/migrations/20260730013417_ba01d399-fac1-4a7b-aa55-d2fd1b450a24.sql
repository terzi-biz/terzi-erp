ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS sell_price_t50 numeric,
  ADD COLUMN IF NOT EXISTS sell_price_t100 numeric,
  ADD COLUMN IF NOT EXISTS sell_price_t250 numeric,
  ADD COLUMN IF NOT EXISTS sell_price_t500 numeric,
  ADD COLUMN IF NOT EXISTS manual_t50 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_t100 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_t250 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_t500 boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.catalog_tier_margins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  kind text NOT NULL,
  tier text NOT NULL,
  margin_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, kind, tier)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_tier_margins TO authenticated;
GRANT ALL ON public.catalog_tier_margins TO service_role;

ALTER TABLE public.catalog_tier_margins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tier margins"
  ON public.catalog_tier_margins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert tier margins"
  ON public.catalog_tier_margins FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tier margins"
  ON public.catalog_tier_margins FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tier margins"
  ON public.catalog_tier_margins FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_catalog_tier_margins_updated_at
  BEFORE UPDATE ON public.catalog_tier_margins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();