-- 1. Provider manifest
ALTER TABLE public.integration_providers ADD COLUMN IF NOT EXISTS manifest jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.integration_providers ADD COLUMN IF NOT EXISTS docs_url text;

-- webhook endpoint token (keyCRM has no signature; secret token in URL/header)
ALTER TABLE public.integration_webhooks ADD COLUMN IF NOT EXISTS endpoint_token text;

-- 2. Sync settings (direction per entity)
CREATE TABLE IF NOT EXISTS public.integration_sync_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  mode text NOT NULL DEFAULT 'off',
  poll_enabled boolean NOT NULL DEFAULT false,
  poll_interval_min integer NOT NULL DEFAULT 15,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, entity),
  CONSTRAINT integration_sync_settings_mode_chk CHECK (mode IN ('off','erp_master','external_master','bidirectional'))
);
GRANT SELECT ON public.integration_sync_settings TO authenticated;
GRANT ALL ON public.integration_sync_settings TO service_role;
ALTER TABLE public.integration_sync_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_settings_read" ON public.integration_sync_settings FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 3. Sync state (polling cursors)
CREATE TABLE IF NOT EXISTS public.integration_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  last_sync_at timestamptz,
  last_run_at timestamptz,
  cursor text,
  last_page integer NOT NULL DEFAULT 1,
  last_status text,
  last_error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, entity)
);
GRANT SELECT ON public.integration_sync_state TO authenticated;
GRANT ALL ON public.integration_sync_state TO service_role;
ALTER TABLE public.integration_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_state_read" ON public.integration_sync_state FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 4. Record links (dedup + loop protection)
CREATE TABLE IF NOT EXISTS public.integration_sync_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  external_id text NOT NULL,
  internal_id text,
  internal_table text,
  external_hash text,
  internal_hash text,
  last_direction text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  external_updated_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, entity, external_id)
);
CREATE INDEX IF NOT EXISTS integration_sync_links_internal_idx ON public.integration_sync_links (integration_id, entity, internal_id);
GRANT SELECT ON public.integration_sync_links TO authenticated;
GRANT ALL ON public.integration_sync_links TO service_role;
ALTER TABLE public.integration_sync_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_links_read" ON public.integration_sync_links FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 5. Conflict queue
CREATE TABLE IF NOT EXISTS public.integration_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  external_id text,
  internal_id text,
  reason text,
  external_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  internal_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_conflicts_status_chk CHECK (status IN ('open','resolved','ignored'))
);
GRANT SELECT ON public.integration_conflicts TO authenticated;
GRANT ALL ON public.integration_conflicts TO service_role;
ALTER TABLE public.integration_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts_read" ON public.integration_conflicts FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 6. Rate limiting counters (per integration / api key)
CREATE TABLE IF NOT EXISTS public.integration_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'default',
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  retry_after_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, bucket)
);
GRANT SELECT ON public.integration_rate_limits TO authenticated;
GRANT ALL ON public.integration_rate_limits TO service_role;
ALTER TABLE public.integration_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_limits_read" ON public.integration_rate_limits FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 7. Telephony internal lines -> employees
CREATE TABLE IF NOT EXISTS public.integration_line_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  extension text NOT NULL,
  user_id uuid,
  display_name text,
  company_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, extension)
);
GRANT SELECT ON public.integration_line_map TO authenticated;
GRANT ALL ON public.integration_line_map TO service_role;
ALTER TABLE public.integration_line_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_map_read" ON public.integration_line_map FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

-- 8. updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS t_sync_settings_updated ON public.integration_sync_settings;
CREATE TRIGGER t_sync_settings_updated BEFORE UPDATE ON public.integration_sync_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_sync_state_updated ON public.integration_sync_state;
CREATE TRIGGER t_sync_state_updated BEFORE UPDATE ON public.integration_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_sync_links_updated ON public.integration_sync_links;
CREATE TRIGGER t_sync_links_updated BEFORE UPDATE ON public.integration_sync_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_conflicts_updated ON public.integration_conflicts;
CREATE TRIGGER t_conflicts_updated BEFORE UPDATE ON public.integration_conflicts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_rate_limits_updated ON public.integration_rate_limits;
CREATE TRIGGER t_rate_limits_updated BEFORE UPDATE ON public.integration_rate_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_line_map_updated ON public.integration_line_map;
CREATE TRIGGER t_line_map_updated BEFORE UPDATE ON public.integration_line_map FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. External reference columns on CRM entities (dedup / linkage)
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS external_id text;
CREATE INDEX IF NOT EXISTS crm_leads_external_idx ON public.crm_leads (external_source, external_id);
CREATE INDEX IF NOT EXISTS crm_contacts_external_idx ON public.crm_contacts (external_source, external_id);
CREATE INDEX IF NOT EXISTS clients_external_idx ON public.clients (external_source, external_id);

-- 10. Provider metadata
UPDATE public.integration_providers SET
  is_implemented = true,
  docs_url = 'https://docs.keycrm.app/',
  description = 'keyCRM Open API v1: воронки, ліди, покупці, компанії, замовлення, статуси, оплати, джерела, коментарі.',
  secret_keys = '["api_key","webhook_token"]'::jsonb,
  manifest = jsonb_build_object(
    'base_url','https://openapi.keycrm.app/v1',
    'auth', jsonb_build_object('kind','api_key','header','Authorization','prefix','Bearer '),
    'credential_fields', jsonb_build_array(
      jsonb_build_object('key','api_key','label','API-ключ keyCRM','required',true,'secret',true),
      jsonb_build_object('key','webhook_token','label','Секретний токен вебхука','required',false,'secret',true)
    ),
    'rate_limits', jsonb_build_object('requests_per_minute',60),
    'webhook_events', jsonb_build_array('order.change_order_status','order.change_payment_status','lead.change_lead_status')
  )
WHERE key = 'keycrm';

UPDATE public.integration_providers SET
  is_implemented = true,
  description = 'Binotel — телефонія. Адаптер у режимі підготовки: очікує офіційну документацію та доступи.',
  secret_keys = '[]'::jsonb,
  manifest = jsonb_build_object(
    'status','awaiting_documentation',
    'base_url', null,
    'credential_fields', jsonb_build_array(),
    'rest_endpoints', jsonb_build_object(),
    'webhook_events', jsonb_build_array(),
    'websocket_events', jsonb_build_array(),
    'signature_validation', jsonb_build_object('mode','unknown'),
    'rate_limits', jsonb_build_object(),
    'retry_policy', jsonb_build_object('backoff_minutes', jsonb_build_array(1,5,30,120,360)),
    'call_field_mapping', jsonb_build_object(),
    'recording_configuration', jsonb_build_object(),
    'click_to_call_configuration', jsonb_build_object('enabled', false)
  )
WHERE key = 'binotel';