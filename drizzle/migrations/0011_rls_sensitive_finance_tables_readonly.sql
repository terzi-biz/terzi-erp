DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compensation_scheme_versions','compensation_role_rules','finance_core_settings','finance_monthly_snapshots','object_economics','asset_register','kpi_results_shadow','payroll_shadow_calculations','cash_reserve_policy','finance_cost_class_map','finance_reconciliation_issues','eligible_gross_profit_attribution','asset_depreciation_entries']
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
  END LOOP;
END $$;