DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compensation_scheme_versions','compensation_role_rules','finance_core_settings','finance_monthly_snapshots','object_economics','asset_register','kpi_results_shadow','payroll_shadow_calculations','cash_reserve_policy','finance_cost_class_map','finance_reconciliation_issues','eligible_gross_profit_attribution','asset_depreciation_entries']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Finance roles read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Finance roles read" ON public.%I FOR SELECT TO authenticated USING (public.is_finance_user(auth.uid()))', t);
  END LOOP;
END $$;