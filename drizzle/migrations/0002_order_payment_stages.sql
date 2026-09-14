CREATE TABLE public.order_payment_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  amount numeric,
  percent numeric,
  planned_date date,
  due_date date,
  trigger_note text,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_payment_stages TO authenticated;
GRANT ALL ON public.order_payment_stages TO service_role;

ALTER TABLE public.order_payment_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance users read payment stages"
  ON public.order_payment_stages FOR SELECT TO authenticated
  USING (public.is_finance_user(auth.uid()));

CREATE POLICY "finance users insert payment stages"
  ON public.order_payment_stages FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_user(auth.uid()));

CREATE POLICY "finance users update payment stages"
  ON public.order_payment_stages FOR UPDATE TO authenticated
  USING (public.is_finance_user(auth.uid()))
  WITH CHECK (public.is_finance_user(auth.uid()));

CREATE POLICY "finance users delete payment stages"
  ON public.order_payment_stages FOR DELETE TO authenticated
  USING (public.is_finance_user(auth.uid()));

CREATE INDEX order_payment_stages_order_idx ON public.order_payment_stages (order_id, position);

CREATE TRIGGER order_payment_stages_updated_at
  BEFORE UPDATE ON public.order_payment_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();