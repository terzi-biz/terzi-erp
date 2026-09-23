CREATE TABLE public.brigades (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,47}$'),
  label text NOT NULL,
  module text NOT NULL CHECK (module IN ('screed','roofing','general','demolition','insulation')),
  payroll_id text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brigades TO authenticated;
GRANT ALL ON public.brigades TO service_role;
ALTER TABLE public.brigades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Brigades readable by signed-in" ON public.brigades FOR SELECT TO authenticated USING (true);
CREATE TRIGGER brigades_updated_at BEFORE UPDATE ON public.brigades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.brigades (key,label,module,payroll_id,sort_order) VALUES
 ('screed_lesha','Льоша · стяжка','screed','crew-alex',10),
 ('screed_vitya','Вітя · стяжка','screed','screed_vitya',20),
 ('roofing_1','Покрівля №1','roofing','roofing_1',30),
 ('roofing_2','Покрівля №2','roofing','roofing_2',40),
 ('roofing_3','Покрівля №3','roofing','roofing_3',50),
 ('roofing_4','Покрівля №4','roofing','roofing_4',60),
 ('general_1','Різноробочі / демонтаж','general',NULL,70);

CREATE TABLE public.brigade_work_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigade_key text NOT NULL REFERENCES public.brigades(key) ON UPDATE CASCADE,
  service_code text NOT NULL CHECK (service_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  unit text NOT NULL,
  rate numeric NOT NULL CHECK (rate > 0),
  effective_from date NOT NULL,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brigade_work_rates_lookup ON public.brigade_work_rates (brigade_key, service_code, effective_from);
GRANT SELECT ON public.brigade_work_rates TO authenticated;
GRANT ALL ON public.brigade_work_rates TO service_role;
ALTER TABLE public.brigade_work_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rates finance read" ON public.brigade_work_rates FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()));

CREATE TABLE public.work_code_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_module text NOT NULL,
  line_code text NOT NULL,
  service_code text NOT NULL CHECK (service_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  unit text,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estimate_module, line_code)
);
GRANT SELECT ON public.work_code_mappings TO authenticated;
GRANT ALL ON public.work_code_mappings TO service_role;
ALTER TABLE public.work_code_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mappings finance read" ON public.work_code_mappings FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()));

CREATE TABLE public.order_brigades (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brigade_key text NOT NULL REFERENCES public.brigades(key) ON UPDATE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, brigade_key)
);
GRANT SELECT ON public.order_brigades TO authenticated;
GRANT ALL ON public.order_brigades TO service_role;
ALTER TABLE public.order_brigades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Order brigades readable by order viewers" ON public.order_brigades FOR SELECT TO authenticated
USING (private.can_manage_access(auth.uid()) OR private.has_permission(auth.uid(),'orders','view') OR public.is_finance_user(auth.uid()));

CREATE TABLE public.order_work_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brigade_key text NOT NULL REFERENCES public.brigades(key) ON UPDATE CASCADE,
  service_code text NOT NULL CHECK (service_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  kind text NOT NULL CHECK (kind IN ('plan','fact')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text,
  source text NOT NULL CHECK (source IN ('estimate','measurement','manual','payroll_site')),
  source_ref text,
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  voided boolean NOT NULL DEFAULT false,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_work_volumes_order ON public.order_work_volumes (order_id, kind);
GRANT SELECT ON public.order_work_volumes TO authenticated;
GRANT ALL ON public.order_work_volumes TO service_role;
ALTER TABLE public.order_work_volumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Work volumes finance read" ON public.order_work_volumes FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()));
CREATE TRIGGER order_work_volumes_updated_at BEFORE UPDATE ON public.order_work_volumes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.order_brigade_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brigade_key text NOT NULL REFERENCES public.brigades(key) ON UPDATE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  period text NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  source text NOT NULL CHECK (source IN ('manual','payroll_site','finmap')),
  source_ref text,
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  voided boolean NOT NULL DEFAULT false,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_brigade_payouts_order ON public.order_brigade_payouts (order_id);
GRANT SELECT ON public.order_brigade_payouts TO authenticated;
GRANT ALL ON public.order_brigade_payouts TO service_role;
ALTER TABLE public.order_brigade_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Payouts finance read" ON public.order_brigade_payouts FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()));