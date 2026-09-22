-- Пакет А: реквізити ФОП, причини закриття, контрагент із кількома ролями.
-- Усе адитивно: наявні дані й кошториси не змінюються.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT ARRAY['client']::text[];
CREATE INDEX IF NOT EXISTS clients_company_idx ON public.clients (lower(company));
CREATE INDEX IF NOT EXISTS clients_roles_idx ON public.clients USING gin (roles);

-- Реквізити компанії (два ФОП). Версіонування: нова версія замість перезапису.
CREATE TABLE IF NOT EXISTS public.company_requisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  legal_name text NOT NULL,
  short_name text,
  tax_id text,
  registry_id text,
  tax_group text,
  address text,
  bank_name text,
  iban text,
  phone text,
  email text,
  signer_name text,
  signer_position text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

GRANT SELECT, INSERT, UPDATE ON public.company_requisites TO authenticated;
GRANT ALL ON public.company_requisites TO service_role;
ALTER TABLE public.company_requisites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_requisites_select" ON public.company_requisites
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "company_requisites_insert" ON public.company_requisites
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "company_requisites_update" ON public.company_requisites
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));

CREATE TRIGGER company_requisites_set_updated_at
  BEFORE UPDATE ON public.company_requisites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Причини закриття (ліди, замовлення). Архівування замість видалення.
CREATE TABLE IF NOT EXISTS public.close_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'lead',
  code text NOT NULL,
  label text NOT NULL,
  description text,
  is_negative boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, code)
);

GRANT SELECT, INSERT, UPDATE ON public.close_reasons TO authenticated;
GRANT ALL ON public.close_reasons TO service_role;
ALTER TABLE public.close_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "close_reasons_select" ON public.close_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "close_reasons_insert" ON public.close_reasons
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));
CREATE POLICY "close_reasons_update" ON public.close_reasons
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director') OR public.has_role(auth.uid(), 'finance'));

CREATE TRIGGER close_reasons_set_updated_at
  BEFORE UPDATE ON public.close_reasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();