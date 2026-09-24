CREATE OR REPLACE FUNCTION private.is_active_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_access ua WHERE ua.user_id = auth.uid() AND ua.status = 'active'
            AND (ua.access_expires_at IS NULL OR ua.access_expires_at > now()))
    OR (NOT EXISTS (SELECT 1 FROM public.user_access ua2 WHERE ua2.user_id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()))
  );
$$;
GRANT EXECUTE ON FUNCTION private.is_active_staff() TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
      AND tablename = ANY (ARRAY['access_permissions','access_roles','analytics_targets','brigades','client_groups','coefficients','company_requisites','crm_pipelines','crm_stages','direction_versions','directions','estimate_sections','finance_reason_codes','finance_tags','formulas','input_fields','marketing_accounts','marketing_ad_groups','marketing_ads','marketing_alerts','marketing_budgets','marketing_calculator_snapshots','marketing_campaign_creatives','marketing_campaigns','marketing_channels','marketing_creatives','marketing_daily_metrics','marketing_integrations','marketing_lead_reasons','marketing_manual_spend','marketing_recommendations','marketing_source_map','marketing_touchpoints','role_permissions','stock_item_applications','stock_item_attributes','stock_item_pack_units','warehouses','assets','roofing_config','screed_config','close_reasons','landing_pages'])
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (private.is_active_staff())', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER POLICY esh_insert ON public.entity_status_history WITH CHECK (changed_by = auth.uid() AND private.is_active_staff());