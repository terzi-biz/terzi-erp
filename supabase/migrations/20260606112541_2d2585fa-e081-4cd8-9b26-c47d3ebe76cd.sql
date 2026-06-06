
-- 1. Promote both TERZI users to admin (keep manager too)
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a89f1688-2e30-4c83-9e84-e8bdeeb7c61f', 'admin'),
  ('70263a75-33eb-4bbf-a2b5-66c4e91972ce', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. user_roles policies (admins can manage all roles)
CREATE POLICY "Admins manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'lead',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or admin/director sees clients" ON public.clients FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));
CREATE POLICY "Auth users insert own clients" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner or admin update clients" ON public.clients FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owner or admin delete clients" ON public.clients FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. ESTIMATES
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  number text NOT NULL UNIQUE,
  module text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  client_name text,
  client_phone text,
  address text,
  manager text,
  area numeric,
  thickness_cm numeric,
  total_client numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  margin_percent numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or admin/director/finance read" ON public.estimates FOR SELECT TO authenticated
  USING (owner_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'director')
         OR public.has_role(auth.uid(),'finance'));
CREATE POLICY "Auth insert own estimates" ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner or admin update estimates" ON public.estimates FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owner or admin delete estimates" ON public.estimates FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_estimates_updated BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX estimates_owner_idx ON public.estimates(owner_id);
CREATE INDEX estimates_client_idx ON public.estimates(client_id);

-- 5. CATALOG_ITEMS — unified table for materials, works, equipment per module
CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL, -- screed | roofing | insulation | demolition | common
  kind text NOT NULL,   -- material | work | equipment
  code text,            -- system key (e.g. 'sand'); NULL for custom
  name text NOT NULL,
  unit text NOT NULL,
  buy_price numeric NOT NULL DEFAULT 0,   -- material: buy; work: contractor pay; equipment: purchase cost
  sell_price numeric NOT NULL DEFAULT 0,  -- material: sell; work: client price; equipment: monthly amort
  lifetime_months integer,                -- equipment only
  is_custom boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_items TO authenticated;
GRANT ALL ON public.catalog_items TO service_role;
ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read catalog" ON public.catalog_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/director manage catalog" ON public.catalog_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));
CREATE TRIGGER trg_catalog_updated BEFORE UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX catalog_module_kind_idx ON public.catalog_items(module, kind);
