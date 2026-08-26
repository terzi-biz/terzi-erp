-- brigade_rates: restrict read to finance/admin/director
DROP POLICY IF EXISTS "brigade rates read" ON public.brigade_rates;
CREATE POLICY "brigade rates read" ON public.brigade_rates FOR SELECT TO authenticated
USING (private.is_finance());

-- invoice_lines: scope read to finance or order viewers via parent invoice
DROP POLICY IF EXISTS "invoice lines read" ON public.invoice_lines;
CREATE POLICY "invoice lines read" ON public.invoice_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.invoices i
  WHERE i.id = invoice_lines.invoice_id
    AND (private.is_finance() OR private.can_view_object(i.order_id))
));

-- marketing tables: restrict writes to CRM/marketing managers
DROP POLICY IF EXISTS "mkt alerts write" ON public.marketing_alerts;
CREATE POLICY "mkt alerts write" ON public.marketing_alerts FOR ALL TO authenticated
USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

DROP POLICY IF EXISTS "mkt rec write" ON public.marketing_recommendations;
CREATE POLICY "mkt rec write" ON public.marketing_recommendations FOR ALL TO authenticated
USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

DROP POLICY IF EXISTS "mkt touch write" ON public.marketing_touchpoints;
CREATE POLICY "mkt touch write" ON public.marketing_touchpoints FOR ALL TO authenticated
USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

-- roofing_actuals: scope writes to order managers/admins
DROP POLICY IF EXISTS "roofing_actuals_insert_auth" ON public.roofing_actuals;
CREATE POLICY "roofing_actuals_insert_auth" ON public.roofing_actuals FOR INSERT TO authenticated
WITH CHECK (private.can_manage_object(order_id) OR private.can_view_object(order_id));

DROP POLICY IF EXISTS "roofing_actuals_update_auth" ON public.roofing_actuals;
CREATE POLICY "roofing_actuals_update_auth" ON public.roofing_actuals FOR UPDATE TO authenticated
USING (private.can_manage_object(order_id) OR private.can_view_object(order_id))
WITH CHECK (private.can_manage_object(order_id) OR private.can_view_object(order_id));

DROP POLICY IF EXISTS "roofing_actuals_select_auth" ON public.roofing_actuals;
CREATE POLICY "roofing_actuals_select_auth" ON public.roofing_actuals FOR SELECT TO authenticated
USING (private.can_view_object(order_id) OR private.has_any_role(ARRAY['admin','director','manager']::public.app_role[]));

-- roofing_cut_plans: same scoping
DROP POLICY IF EXISTS "roofing_cut_plans_write_auth" ON public.roofing_cut_plans;
CREATE POLICY "roofing_cut_plans_write_auth" ON public.roofing_cut_plans FOR INSERT TO authenticated
WITH CHECK (private.can_manage_object(order_id) OR private.can_view_object(order_id));

DROP POLICY IF EXISTS "roofing_cut_plans_update_auth" ON public.roofing_cut_plans;
CREATE POLICY "roofing_cut_plans_update_auth" ON public.roofing_cut_plans FOR UPDATE TO authenticated
USING (private.can_manage_object(order_id) OR private.can_view_object(order_id))
WITH CHECK (private.can_manage_object(order_id) OR private.can_view_object(order_id));

DROP POLICY IF EXISTS "roofing_cut_plans_select_auth" ON public.roofing_cut_plans;
CREATE POLICY "roofing_cut_plans_select_auth" ON public.roofing_cut_plans FOR SELECT TO authenticated
USING (private.can_view_object(order_id) OR private.has_any_role(ARRAY['admin','director','manager']::public.app_role[]));

-- stock tables: restrict cost/pricing reads to stock managers or finance
DROP POLICY IF EXISTS "stock items read" ON public.stock_items;
CREATE POLICY "stock items read" ON public.stock_items FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());

DROP POLICY IF EXISTS "stock balances read" ON public.stock_balances;
CREATE POLICY "stock balances read" ON public.stock_balances FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());

DROP POLICY IF EXISTS "stock docs read" ON public.stock_documents;
CREATE POLICY "stock docs read" ON public.stock_documents FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());

DROP POLICY IF EXISTS "stock doc lines read" ON public.stock_document_lines;
CREATE POLICY "stock doc lines read" ON public.stock_document_lines FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());

DROP POLICY IF EXISTS "stock counts read" ON public.stock_counts;
CREATE POLICY "stock counts read" ON public.stock_counts FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());

DROP POLICY IF EXISTS "stock count lines read" ON public.stock_count_lines;
CREATE POLICY "stock count lines read" ON public.stock_count_lines FOR SELECT TO authenticated
USING (private.is_stock_manager() OR private.is_finance());