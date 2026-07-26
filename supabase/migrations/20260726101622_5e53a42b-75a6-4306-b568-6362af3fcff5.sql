
-- 1) client_groups directory
CREATE TABLE public.client_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.client_groups TO authenticated;
GRANT ALL ON public.client_groups TO service_role;

ALTER TABLE public.client_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_groups read authenticated" ON public.client_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_groups admin manage" ON public.client_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));

CREATE TRIGGER trg_client_groups_updated_at
  BEFORE UPDATE ON public.client_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.client_groups (key, name, sort_order) VALUES
  ('prep',      'Підготовчі роботи', 10),
  ('demo',     'Демонтаж', 20),
  ('mat_rough','Матеріали чорнові', 30),
  ('mat_fin',  'Матеріали фінішні', 40),
  ('works',    'Основні роботи', 50),
  ('insul',    'Утеплення', 60),
  ('waterp',   'Гідроізоляція', 70),
  ('logistics','Логістика і підйом', 80),
  ('equip',    'Обладнання', 90),
  ('other',    'Інше', 100);

-- 2) show_in_client mode enum + catalog_items.show_in_client + client_group_key
DO $$ BEGIN
  CREATE TYPE public.show_in_client_mode AS ENUM ('always','detailed_only','condensed_only','never');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.catalog_items
  ADD COLUMN IF NOT EXISTS show_in_client public.show_in_client_mode NOT NULL DEFAULT 'always',
  ADD COLUMN IF NOT EXISTS client_group_key TEXT NULL;

-- No boolean flag exists on catalog_items — default 'always' is fine.

-- 3) estimates.client_view_mode
DO $$ BEGIN
  CREATE TYPE public.client_view_mode AS ENUM ('detailed','condensed','turnkey');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS client_view_mode public.client_view_mode NOT NULL DEFAULT 'detailed';
