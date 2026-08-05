-- helpers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.has_any_role(_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = ANY(_roles)
  );
$$;
REVOKE ALL ON FUNCTION private.has_any_role(public.app_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_any_role(public.app_role[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_finance() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.has_any_role(ARRAY['admin','director','finance']::public.app_role[]);
$$;
REVOKE ALL ON FUNCTION private.is_finance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_finance() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_stock_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.has_any_role(ARRAY['admin','director','manager']::public.app_role[]);
$$;
REVOKE ALL ON FUNCTION private.is_stock_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_stock_manager() TO authenticated, service_role;

-- enums ----------------------------------------------------------------
CREATE TYPE public.stock_doc_type AS ENUM ('in','out','transfer','writeoff','return');
CREATE TYPE public.stock_doc_status AS ENUM ('draft','posted','cancelled');
CREATE TYPE public.invoice_kind AS ENUM ('advance','stage','final','other');
CREATE TYPE public.invoice_status AS ENUM ('draft','issued','partial','paid','overdue','cancelled');
CREATE TYPE public.money_direction AS ENUM ('in','out');

-- warehouses -----------------------------------------------------------
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'main',
  address text,
  responsible_id uuid,
  is_default boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses read" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "warehouses write" ON public.warehouses FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE TABLE public.stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  unit text NOT NULL DEFAULT 'шт',
  category text,
  module text,
  catalog_item_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL,
  min_qty numeric(14,3) NOT NULL DEFAULT 0,
  avg_cost numeric(14,2) NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_items_name_idx ON public.stock_items (lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock items read" ON public.stock_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock items write" ON public.stock_items FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE TABLE public.stock_balances (
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  reserved_qty numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, item_id)
);
GRANT SELECT ON public.stock_balances TO authenticated;
GRANT ALL ON public.stock_balances TO service_role;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock balances read" ON public.stock_balances FOR SELECT TO authenticated USING (true);

CREATE SEQUENCE public.stock_document_seq;
CREATE TABLE public.stock_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  doc_type public.stock_doc_type NOT NULL,
  status public.stock_doc_status NOT NULL DEFAULT 'draft',
  doc_date date NOT NULL DEFAULT current_date,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  target_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier text,
  note text,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid,
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_documents_order_idx ON public.stock_documents (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_documents TO authenticated;
GRANT ALL ON public.stock_documents TO service_role;
ALTER TABLE public.stock_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock docs read" ON public.stock_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock docs write" ON public.stock_documents FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE TABLE public.stock_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.stock_documents(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  price numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_doc_lines_doc_idx ON public.stock_document_lines (document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_document_lines TO authenticated;
GRANT ALL ON public.stock_document_lines TO service_role;
ALTER TABLE public.stock_document_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock doc lines read" ON public.stock_document_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock doc lines write" ON public.stock_document_lines FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE TABLE public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  issued_qty numeric(14,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_reservations_order_idx ON public.stock_reservations (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_reservations TO authenticated;
GRANT ALL ON public.stock_reservations TO service_role;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservations read" ON public.stock_reservations FOR SELECT TO authenticated
  USING (private.can_view_object(order_id) OR private.is_stock_manager());
CREATE POLICY "reservations write" ON public.stock_reservations FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE SEQUENCE public.stock_count_seq;
CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status public.stock_doc_status NOT NULL DEFAULT 'draft',
  note text,
  created_by uuid,
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock counts read" ON public.stock_counts FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock counts write" ON public.stock_counts FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

CREATE TABLE public.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  expected_qty numeric(14,3) NOT NULL DEFAULT 0,
  actual_qty numeric(14,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_count_lines_idx ON public.stock_count_lines (count_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_count_lines TO service_role;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock count lines read" ON public.stock_count_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock count lines write" ON public.stock_count_lines FOR ALL TO authenticated
  USING (private.is_stock_manager()) WITH CHECK (private.is_stock_manager());

-- finance ---------------------------------------------------------------
CREATE TABLE public.finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash',
  currency text NOT NULL DEFAULT 'UAH',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;
GRANT ALL ON public.finance_accounts TO service_role;
ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "finance accounts finance only" ON public.finance_accounts FOR ALL TO authenticated
  USING (private.is_finance()) WITH CHECK (private.is_finance());

CREATE SEQUENCE public.invoice_number_seq;
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  kind public.invoice_kind NOT NULL DEFAULT 'advance',
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoices_order_idx ON public.invoices (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices read" ON public.invoices FOR SELECT TO authenticated
  USING (private.is_finance() OR private.can_view_object(order_id));
CREATE POLICY "invoices write" ON public.invoices FOR ALL TO authenticated
  USING (private.is_finance()) WITH CHECK (private.is_finance());

CREATE TABLE public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'шт',
  qty numeric(14,3) NOT NULL DEFAULT 1,
  price numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invoice_lines_idx ON public.invoice_lines (invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice lines read" ON public.invoice_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id));
CREATE POLICY "invoice lines write" ON public.invoice_lines FOR ALL TO authenticated
  USING (private.is_finance()) WITH CHECK (private.is_finance());

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  direction public.money_direction NOT NULL DEFAULT 'in',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_at date NOT NULL DEFAULT current_date,
  method text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON public.payments (order_id);
CREATE INDEX payments_invoice_idx ON public.payments (invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments finance only" ON public.payments FOR ALL TO authenticated
  USING (private.is_finance()) WITH CHECK (private.is_finance());

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'other',
  name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  spent_at date NOT NULL DEFAULT current_date,
  supplier text,
  note text,
  source text NOT NULL DEFAULT 'manual',
  source_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_order_idx ON public.expenses (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses finance only" ON public.expenses FOR ALL TO authenticated
  USING (private.is_finance()) WITH CHECK (private.is_finance());

-- numbering + updated_at triggers ---------------------------------------
CREATE OR REPLACE FUNCTION public.set_stock_document_number() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'SKL-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.stock_document_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_stock_doc_number BEFORE INSERT ON public.stock_documents
FOR EACH ROW EXECUTE FUNCTION public.set_stock_document_number();

CREATE OR REPLACE FUNCTION public.set_stock_count_number() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.stock_count_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_stock_count_number BEFORE INSERT ON public.stock_counts
FOR EACH ROW EXECUTE FUNCTION public.set_stock_count_number();

CREATE OR REPLACE FUNCTION public.set_invoice_number() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'РАХ-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_invoice_number BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

CREATE TRIGGER trg_warehouses_updated BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stock_items_updated BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stock_documents_updated BEFORE UPDATE ON public.stock_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stock_reservations_updated BEFORE UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_stock_counts_updated BEFORE UPDATE ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_finance_accounts_updated BEFORE UPDATE ON public.finance_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- posting logic ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_stock_document(_doc_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.stock_documents; l record; sign int; total numeric(14,2) := 0; cur_qty numeric; cur_cost numeric;
BEGIN
  IF NOT private.is_stock_manager() THEN RAISE EXCEPTION 'Недостатньо прав для проведення документа'; END IF;
  SELECT * INTO d FROM public.stock_documents WHERE id = _doc_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Документ не знайдено'; END IF;
  IF d.status = 'posted' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  sign := CASE WHEN d.doc_type IN ('in','return') THEN 1 ELSE -1 END;

  FOR l IN SELECT * FROM public.stock_document_lines WHERE document_id = _doc_id LOOP
    total := total + (l.qty * l.price);

    INSERT INTO public.stock_balances (warehouse_id, item_id, qty)
    VALUES (d.warehouse_id, l.item_id, sign * l.qty)
    ON CONFLICT (warehouse_id, item_id)
    DO UPDATE SET qty = public.stock_balances.qty + sign * l.qty, updated_at = now();

    IF d.doc_type = 'transfer' AND d.target_warehouse_id IS NOT NULL THEN
      INSERT INTO public.stock_balances (warehouse_id, item_id, qty)
      VALUES (d.target_warehouse_id, l.item_id, l.qty)
      ON CONFLICT (warehouse_id, item_id)
      DO UPDATE SET qty = public.stock_balances.qty + l.qty, updated_at = now();
    END IF;

    -- weighted average cost on receipts
    IF d.doc_type = 'in' AND l.price > 0 THEN
      SELECT COALESCE(SUM(qty),0) INTO cur_qty FROM public.stock_balances WHERE item_id = l.item_id;
      SELECT avg_cost INTO cur_cost FROM public.stock_items WHERE id = l.item_id;
      UPDATE public.stock_items
         SET avg_cost = CASE WHEN cur_qty > 0
              THEN round(((cur_qty - l.qty) * COALESCE(cur_cost,0) + l.qty * l.price) / cur_qty, 2)
              ELSE l.price END
       WHERE id = l.item_id;
    END IF;

    -- release reservations on issue to an order
    IF d.doc_type = 'out' AND d.order_id IS NOT NULL THEN
      UPDATE public.stock_reservations r
         SET issued_qty = LEAST(r.qty, r.issued_qty + l.qty),
             status = CASE WHEN r.issued_qty + l.qty >= r.qty THEN 'issued' ELSE r.status END,
             updated_at = now()
       WHERE r.order_id = d.order_id AND r.item_id = l.item_id AND r.status = 'active';
    END IF;
  END LOOP;

  UPDATE public.stock_documents
     SET status = 'posted', posted_at = now(), posted_by = auth.uid(), total_cost = total
   WHERE id = _doc_id;

  -- issue/writeoff creates a real expense record
  IF d.doc_type IN ('out','writeoff') AND total > 0 THEN
    INSERT INTO public.expenses (order_id, category, name, amount, spent_at, source, source_id, created_by)
    VALUES (d.order_id, 'materials', 'Списання зі складу ' || d.number, total, d.doc_date, 'stock', d.id, auth.uid());
  END IF;

  RETURN jsonb_build_object('ok', true, 'total', total);
END; $$;
REVOKE ALL ON FUNCTION public.post_stock_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_stock_document(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_stock_document(_doc_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.stock_documents; l record; sign int;
BEGIN
  IF NOT private.is_stock_manager() THEN RAISE EXCEPTION 'Недостатньо прав для скасування документа'; END IF;
  SELECT * INTO d FROM public.stock_documents WHERE id = _doc_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Документ не знайдено'; END IF;
  IF d.status <> 'posted' THEN RETURN jsonb_build_object('ok', true, 'skipped', true); END IF;

  sign := CASE WHEN d.doc_type IN ('in','return') THEN -1 ELSE 1 END;
  FOR l IN SELECT * FROM public.stock_document_lines WHERE document_id = _doc_id LOOP
    UPDATE public.stock_balances SET qty = qty + sign * l.qty, updated_at = now()
     WHERE warehouse_id = d.warehouse_id AND item_id = l.item_id;
    IF d.doc_type = 'transfer' AND d.target_warehouse_id IS NOT NULL THEN
      UPDATE public.stock_balances SET qty = qty - l.qty, updated_at = now()
       WHERE warehouse_id = d.target_warehouse_id AND item_id = l.item_id;
    END IF;
  END LOOP;

  DELETE FROM public.expenses WHERE source = 'stock' AND source_id = d.id;
  UPDATE public.stock_documents SET status = 'cancelled' WHERE id = _doc_id;
  RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.cancel_stock_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_stock_document(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.post_stock_count(_count_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.stock_counts; l record; adjusted int := 0;
BEGIN
  IF NOT private.is_stock_manager() THEN RAISE EXCEPTION 'Недостатньо прав для затвердження інвентаризації'; END IF;
  SELECT * INTO c FROM public.stock_counts WHERE id = _count_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Акт не знайдено'; END IF;
  IF c.status = 'posted' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;

  FOR l IN SELECT * FROM public.stock_count_lines WHERE count_id = _count_id LOOP
    IF l.actual_qty IS DISTINCT FROM l.expected_qty THEN
      INSERT INTO public.stock_balances (warehouse_id, item_id, qty)
      VALUES (c.warehouse_id, l.item_id, l.actual_qty)
      ON CONFLICT (warehouse_id, item_id)
      DO UPDATE SET qty = l.actual_qty, updated_at = now();
      adjusted := adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.stock_counts SET status = 'posted', posted_at = now(), posted_by = auth.uid() WHERE id = _count_id;
  RETURN jsonb_build_object('ok', true, 'adjusted', adjusted);
END; $$;
REVOKE ALL ON FUNCTION public.post_stock_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_stock_count(uuid) TO authenticated, service_role;

-- keep reserved_qty in sync
CREATE OR REPLACE FUNCTION public.sync_stock_reserved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE w uuid; i uuid;
BEGIN
  w := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  i := COALESCE(NEW.item_id, OLD.item_id);
  INSERT INTO public.stock_balances (warehouse_id, item_id, qty) VALUES (w, i, 0)
  ON CONFLICT (warehouse_id, item_id) DO NOTHING;
  UPDATE public.stock_balances b
     SET reserved_qty = COALESCE((
           SELECT SUM(GREATEST(r.qty - r.issued_qty, 0)) FROM public.stock_reservations r
            WHERE r.warehouse_id = w AND r.item_id = i AND r.status = 'active'), 0),
         updated_at = now()
   WHERE b.warehouse_id = w AND b.item_id = i;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_reservations_sync AFTER INSERT OR UPDATE OR DELETE ON public.stock_reservations
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_reserved();

-- invoice paid amount follows payments
CREATE OR REPLACE FUNCTION public.sync_invoice_paid() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv uuid; s numeric(14,2); t numeric(14,2);
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF inv IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(amount),0) INTO s FROM public.payments WHERE invoice_id = inv AND direction = 'in';
  SELECT total INTO t FROM public.invoices WHERE id = inv;
  UPDATE public.invoices
     SET paid = s,
         status = CASE WHEN s <= 0 THEN 'issued' WHEN s >= t THEN 'paid' ELSE 'partial' END
   WHERE id = inv AND status <> 'cancelled';
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_payments_sync_invoice AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_paid();