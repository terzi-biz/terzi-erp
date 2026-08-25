-- 1. price history trigger for catalog_items
CREATE OR REPLACE FUNCTION public.log_catalog_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  ov numeric;
  nv numeric;
BEGIN
  FOREACH f IN ARRAY ARRAY['buy_price','sell_price','sell_price_t50','sell_price_t100','sell_price_t250','sell_price_t500'] LOOP
    ov := (to_jsonb(OLD) ->> f)::numeric;
    nv := (to_jsonb(NEW) ->> f)::numeric;
    IF COALESCE(ov, -1) IS DISTINCT FROM COALESCE(nv, -1) THEN
      INSERT INTO public.price_history (item_id, item_kind, field, old_value, new_value, changed_by)
      VALUES (NEW.id, 'catalog_item', f, ov, nv, auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_price_history ON public.catalog_items;
CREATE TRIGGER trg_catalog_price_history
AFTER UPDATE ON public.catalog_items
FOR EACH ROW EXECUTE FUNCTION public.log_catalog_price_change();

-- 2. dry-run audit runs
CREATE TABLE public.data_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_key text NOT NULL,
  mode text NOT NULL DEFAULT 'dry_run',
  status text NOT NULL DEFAULT 'reported',
  affected_count integer NOT NULL DEFAULT 0,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_count integer NOT NULL DEFAULT 0,
  applied_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_audit_runs TO authenticated;
GRANT ALL ON public.data_audit_runs TO service_role;

ALTER TABLE public.data_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Privileged roles read audit runs"
ON public.data_audit_runs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'director')
  OR public.has_role(auth.uid(), 'finance')
);

CREATE POLICY "Privileged roles create audit runs"
ON public.data_audit_runs FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'director')
    OR public.has_role(auth.uid(), 'finance')
  )
);

CREATE POLICY "Privileged roles update audit runs"
ON public.data_audit_runs FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'director')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'director')
);

CREATE INDEX idx_data_audit_runs_key ON public.data_audit_runs (check_key, created_at DESC);

CREATE TRIGGER update_data_audit_runs_updated_at
BEFORE UPDATE ON public.data_audit_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();