
-- ============ ENUMS ============
CREATE TYPE public.integration_status AS ENUM ('disconnected','connecting','active','error','disabled');
CREATE TYPE public.integration_auth_kind AS ENUM ('none','api_key','oauth2','hmac','basic');
CREATE TYPE public.integration_event_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.integration_event_status AS ENUM ('pending','processing','done','failed','dead');
CREATE TYPE public.integration_webhook_direction AS ENUM ('inbound','outbound');

-- ============ PROVIDERS ============
CREATE TABLE public.integration_providers (
  key text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  auth_kind public.integration_auth_kind NOT NULL DEFAULT 'api_key',
  description text,
  config_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  secret_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  supports_inbound boolean NOT NULL DEFAULT false,
  supports_outbound boolean NOT NULL DEFAULT false,
  is_implemented boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_providers TO authenticated;
GRANT ALL ON public.integration_providers TO service_role;
ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "providers_read" ON public.integration_providers FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()) OR public.has_permission(auth.uid(),'integrations','view'));

-- ============ INTEGRATIONS ============
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL REFERENCES public.integration_providers(key) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status public.integration_status NOT NULL DEFAULT 'disconnected',
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrations_read" ON public.integrations FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()) OR public.has_permission(auth.uid(),'integrations','view'));
CREATE POLICY "integrations_write" ON public.integrations FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "integrations_update" ON public.integrations FOR UPDATE TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "integrations_delete" ON public.integrations FOR DELETE TO authenticated
  USING (public.is_access_owner(auth.uid()));
CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SECRET REFS (no values stored) ============
CREATE TABLE public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  secret_key text NOT NULL,
  secret_ref text NOT NULL,
  masked_hint text,
  rotated_at timestamptz,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, secret_key)
);
GRANT SELECT ON public.integration_secrets TO authenticated;
GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_secrets_read" ON public.integration_secrets FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()));
CREATE TRIGGER trg_integration_secrets_updated BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ OAUTH STATE ============
CREATE TABLE public.integration_oauth_states (
  state text PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  code_verifier text,
  redirect_uri text,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_oauth_states TO service_role;
ALTER TABLE public.integration_oauth_states ENABLE ROW LEVEL SECURITY;

-- ============ TOKENS ============
CREATE TABLE public.integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_type text,
  scopes text,
  expires_at timestamptz,
  account_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id)
);
GRANT ALL ON public.integration_tokens TO service_role;
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_integration_tokens_updated BEFORE UPDATE ON public.integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WEBHOOKS ============
CREATE TABLE public.integration_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  direction public.integration_webhook_direction NOT NULL,
  slug text UNIQUE,
  target_url text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_mode text NOT NULL DEFAULT 'hmac_sha256',
  signature_header text,
  secret_ref text,
  enabled boolean NOT NULL DEFAULT true,
  last_call_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_webhooks TO authenticated;
GRANT ALL ON public.integration_webhooks TO service_role;
ALTER TABLE public.integration_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_webhooks_read" ON public.integration_webhooks FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()));
CREATE TRIGGER trg_integration_webhooks_updated BEFORE UPDATE ON public.integration_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EVENT QUEUE ============
CREATE TABLE public.integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  provider_key text,
  direction public.integration_event_direction NOT NULL,
  event_type text NOT NULL,
  status public.integration_event_status NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  idempotency_key text UNIQUE,
  dedup_hash text,
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  entity_type text,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_integration_events_queue ON public.integration_events (status, next_retry_at);
CREATE INDEX idx_integration_events_integration ON public.integration_events (integration_id, created_at DESC);
GRANT SELECT, UPDATE ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_events_read" ON public.integration_events FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()) OR public.has_permission(auth.uid(),'integrations','view'));
CREATE POLICY "integration_events_update" ON public.integration_events FOR UPDATE TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));
CREATE TRIGGER trg_integration_events_updated BEFORE UPDATE ON public.integration_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EVENT ATTEMPT LOG (append-only) ============
CREATE TABLE public.integration_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.integration_events(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  attempt integer NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'info',
  message text,
  http_status integer,
  duration_ms integer,
  request_preview jsonb,
  response_preview jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_integration_event_logs_event ON public.integration_event_logs (event_id, created_at DESC);
GRANT SELECT ON public.integration_event_logs TO authenticated;
GRANT ALL ON public.integration_event_logs TO service_role;
ALTER TABLE public.integration_event_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_event_logs_read" ON public.integration_event_logs FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()) OR public.has_permission(auth.uid(),'integrations','view'));

-- ============ FIELD MAPPINGS ============
CREATE TABLE public.integration_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  direction public.integration_event_direction NOT NULL DEFAULT 'inbound',
  source_field text NOT NULL,
  target_field text NOT NULL,
  transform text,
  default_value text,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_field_mappings TO authenticated;
GRANT ALL ON public.integration_field_mappings TO service_role;
ALTER TABLE public.integration_field_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_mappings_read" ON public.integration_field_mappings FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()) OR public.has_permission(auth.uid(),'integrations','view'));
CREATE POLICY "integration_mappings_write" ON public.integration_field_mappings FOR ALL TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));
CREATE TRIGGER trg_integration_mappings_updated BEFORE UPDATE ON public.integration_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PERMISSIONS ============
INSERT INTO public.access_permissions (module, action, label, is_critical, sort_order) VALUES
  ('integrations','view','Перегляд інтеграцій', false, 900),
  ('integrations','manage','Керування інтеграціями', true, 901),
  ('integrations','secrets','Доступ до ключів і токенів', true, 902),
  ('integrations','retry','Повторна обробка подій', false, 903)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT r.key, p.module, p.action,
       CASE WHEN r.key IN ('owner','ops_admin') THEN true
            WHEN p.action = 'view' AND r.key IN ('director','admin') THEN true
            ELSE false END
FROM public.access_roles r
CROSS JOIN (VALUES ('integrations','view'),('integrations','manage'),('integrations','secrets'),('integrations','retry')) AS p(module, action)
ON CONFLICT DO NOTHING;

-- ============ SEED PROVIDERS (core only, adapters land later) ============
INSERT INTO public.integration_providers (key, name, category, auth_kind, description, supports_inbound, supports_outbound, is_implemented, sort_order) VALUES
  ('echo','Тестовий адаптер (Echo)','test','none','Службовий адаптер для перевірки ядра: черга, повтори, журнал.', true, true, true, 0),
  ('binotel','Binotel','telephony','api_key','Телефонія: дзвінки, записи розмов.', true, true, false, 10),
  ('keycrm','keyCRM','crm','api_key','CRM: ліди, клієнти, замовлення.', true, true, false, 20),
  ('meta','Meta Ads','ads','oauth2','Ліди та рекламні кампанії Facebook/Instagram.', true, false, false, 30),
  ('google_ads','Google Ads','ads','oauth2','Рекламні кампанії та ліди Google.', true, false, false, 40),
  ('wordpress','WordPress','website','api_key','Форми та заявки з сайту.', true, false, false, 50),
  ('telegram','Telegram','messaging','api_key','Сповіщення та повідомлення.', true, true, false, 60)
ON CONFLICT (key) DO NOTHING;
