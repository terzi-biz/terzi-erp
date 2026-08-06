-- ============ MARKETING MODULE ============

CREATE TABLE public.marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE,
  name text NOT NULL,
  channel_type text NOT NULL DEFAULT 'paid',
  platform text,
  status text NOT NULL DEFAULT 'active',
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_channels TO authenticated;
GRANT ALL ON public.marketing_channels TO service_role;
ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt channels read" ON public.marketing_channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt channels write" ON public.marketing_channels FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  name text NOT NULL,
  external_account_id text,
  currency text NOT NULL DEFAULT 'UAH',
  timezone text NOT NULL DEFAULT 'Europe/Kyiv',
  connection_status text NOT NULL DEFAULT 'not_connected',
  last_sync_at timestamptz,
  sync_error text,
  responsible_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_accounts TO authenticated;
GRANT ALL ON public.marketing_accounts TO service_role;
ALTER TABLE public.marketing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt accounts read" ON public.marketing_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt accounts write" ON public.marketing_accounts FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  domain text,
  service text,
  language text NOT NULL DEFAULT 'uk',
  status text NOT NULL DEFAULT 'active',
  form_id text,
  ga4_property_id text,
  gtm_container_id text,
  pixel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  responsible_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landing_pages TO authenticated;
GRANT ALL ON public.landing_pages TO service_role;
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "landing read" ON public.landing_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "landing write" ON public.landing_pages FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.marketing_accounts(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  external_id text,
  name text NOT NULL,
  service text,
  client_type text NOT NULL DEFAULT 'B2C',
  campaign_type text NOT NULL DEFAULT 'search',
  objective text,
  status text NOT NULL DEFAULT 'active',
  start_date date,
  end_date date,
  daily_budget numeric(14,2),
  monthly_budget numeric(14,2),
  currency text NOT NULL DEFAULT 'UAH',
  landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  responsible_user_id uuid,
  external_updated_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mkt_campaigns_ext ON public.marketing_campaigns(account_id, external_id) WHERE external_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt campaigns read" ON public.marketing_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt campaigns write" ON public.marketing_campaigns FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_ad_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  external_id text,
  name text NOT NULL,
  targeting_summary text,
  audience_type text,
  optimization_goal text,
  budget numeric(14,2),
  status text NOT NULL DEFAULT 'active',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ad_groups TO authenticated;
GRANT ALL ON public.marketing_ad_groups TO service_role;
ALTER TABLE public.marketing_ad_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt adgroups read" ON public.marketing_ad_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt adgroups write" ON public.marketing_ad_groups FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  file_url text,
  preview_url text,
  primary_text text,
  headline text,
  description text,
  cta text,
  language text NOT NULL DEFAULT 'uk',
  format text,
  service text,
  advertising_angle text,
  pain_point text,
  author_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_creatives TO authenticated;
GRANT ALL ON public.marketing_creatives TO service_role;
ALTER TABLE public.marketing_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt creatives read" ON public.marketing_creatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt creatives write" ON public.marketing_creatives FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_group_id uuid REFERENCES public.marketing_ad_groups(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  external_id text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  destination_url text,
  external_updated_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ads TO authenticated;
GRANT ALL ON public.marketing_ads TO service_role;
ALTER TABLE public.marketing_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt ads read" ON public.marketing_ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt ads write" ON public.marketing_ads FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_campaign_creatives (
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  creative_id uuid NOT NULL REFERENCES public.marketing_creatives(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, creative_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_creatives TO authenticated;
GRANT ALL ON public.marketing_campaign_creatives TO service_role;
ALTER TABLE public.marketing_campaign_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt cc read" ON public.marketing_campaign_creatives FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt cc write" ON public.marketing_campaign_creatives FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.marketing_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  ad_group_id uuid REFERENCES public.marketing_ad_groups(id) ON DELETE CASCADE,
  ad_id uuid REFERENCES public.marketing_ads(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'UAH',
  spend numeric(14,2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  link_clicks bigint NOT NULL DEFAULT 0,
  sessions bigint NOT NULL DEFAULT 0,
  platform_leads bigint NOT NULL DEFAULT 0,
  website_leads bigint NOT NULL DEFAULT 0,
  calls bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  conversion_value numeric(14,2) NOT NULL DEFAULT 0,
  raw_payload_hash text,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mkt_metrics_uniq ON public.marketing_daily_metrics
  (date, COALESCE(channel_id,'00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(account_id,'00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(ad_group_id,'00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(ad_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX mkt_metrics_date ON public.marketing_daily_metrics(date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_daily_metrics TO authenticated;
GRANT ALL ON public.marketing_daily_metrics TO service_role;
ALTER TABLE public.marketing_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt metrics read" ON public.marketing_daily_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt metrics write" ON public.marketing_daily_metrics FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  ad_group_id uuid REFERENCES public.marketing_ad_groups(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.marketing_ads(id) ON DELETE SET NULL,
  creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  session_id text,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  referrer text,
  device text,
  gclid text, gbraid text, wbraid text, fbclid text, ttclid text,
  call_id uuid,
  external_message_id text,
  touchpoint_type text NOT NULL DEFAULT 'visit',
  is_first_touch boolean NOT NULL DEFAULT false,
  is_last_touch boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_touch_lead ON public.marketing_touchpoints(crm_lead_id, occurred_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_touchpoints TO authenticated;
GRANT ALL ON public.marketing_touchpoints TO service_role;
ALTER TABLE public.marketing_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt touch read" ON public.marketing_touchpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt touch write" ON public.marketing_touchpoints FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.marketing_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL,
  channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.marketing_accounts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  planned_amount numeric(14,2) NOT NULL DEFAULT 0,
  actual_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'UAH',
  daily_limit numeric(14,2),
  warning_threshold_percent int NOT NULL DEFAULT 80,
  hard_limit_percent int NOT NULL DEFAULT 100,
  payment_status text NOT NULL DEFAULT 'ok',
  next_payment_date date,
  responsible_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_budgets TO authenticated;
GRANT ALL ON public.marketing_budgets TO service_role;
ALTER TABLE public.marketing_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt budgets read" ON public.marketing_budgets FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt budgets write" ON public.marketing_budgets FOR ALL TO authenticated USING (private.crm_is_manager() OR private.is_finance()) WITH CHECK (private.crm_is_manager() OR private.is_finance());

CREATE TABLE public.marketing_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  title text NOT NULL,
  connection_status text NOT NULL DEFAULT 'not_connected',
  account_name text,
  external_account_id text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  token_expiry timestamptz,
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read_only boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_integrations TO authenticated;
GRANT ALL ON public.marketing_integrations TO service_role;
ALTER TABLE public.marketing_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt int read" ON public.marketing_integrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt int write" ON public.marketing_integrations FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

CREATE TABLE public.marketing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  description text,
  entity_type text,
  entity_id uuid,
  metric_name text,
  current_value numeric(14,2),
  threshold_value numeric(14,2),
  status text NOT NULL DEFAULT 'open',
  dedup_key text UNIQUE,
  assigned_user_id uuid,
  linked_task_id uuid REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_alerts TO authenticated;
GRANT ALL ON public.marketing_alerts TO service_role;
ALTER TABLE public.marketing_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt alerts read" ON public.marketing_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt alerts write" ON public.marketing_alerts FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.marketing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_type text NOT NULL DEFAULT 'optimization',
  title text NOT NULL,
  problem text,
  evidence text,
  current_metric text,
  target_metric text,
  recommended_action text,
  expected_effect text,
  risk text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'new',
  entity_type text,
  entity_id uuid,
  assigned_user_id uuid,
  linked_task_id uuid REFERENCES public.crm_tasks(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz,
  result_after_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_recommendations TO authenticated;
GRANT ALL ON public.marketing_recommendations TO service_role;
ALTER TABLE public.marketing_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt rec read" ON public.marketing_recommendations FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt rec write" ON public.marketing_recommendations FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE public.marketing_lead_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_lead_reasons TO authenticated;
GRANT ALL ON public.marketing_lead_reasons TO service_role;
ALTER TABLE public.marketing_lead_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt reasons read" ON public.marketing_lead_reasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt reasons write" ON public.marketing_lead_reasons FOR ALL TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());

-- updated_at triggers
CREATE TRIGGER t_mkt_channels_upd BEFORE UPDATE ON public.marketing_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_accounts_upd BEFORE UPDATE ON public.marketing_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_campaigns_upd BEFORE UPDATE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_adgroups_upd BEFORE UPDATE ON public.marketing_ad_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_creatives_upd BEFORE UPDATE ON public.marketing_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_ads_upd BEFORE UPDATE ON public.marketing_ads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_metrics_upd BEFORE UPDATE ON public.marketing_daily_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_budgets_upd BEFORE UPDATE ON public.marketing_budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_int_upd BEFORE UPDATE ON public.marketing_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_alerts_upd BEFORE UPDATE ON public.marketing_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_rec_upd BEFORE UPDATE ON public.marketing_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_mkt_reasons_upd BEFORE UPDATE ON public.marketing_lead_reasons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_landing_upd BEFORE UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CRM lead marketing fields
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS marketing_channel_id uuid REFERENCES public.marketing_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_creative_id uuid REFERENCES public.marketing_creatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_quality text,
  ADD COLUMN IF NOT EXISTS disqualify_reason_id uuid REFERENCES public.marketing_lead_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_touch_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;

-- Seed channels
INSERT INTO public.marketing_channels (key, name, channel_type, platform, sort_order) VALUES
 ('google_ads','Google Ads','paid','google',10),
 ('meta_ads','Meta Ads','paid','meta',20),
 ('tiktok_ads','TikTok Ads','paid','tiktok',30),
 ('olx','OLX','paid','olx',40),
 ('seo','SEO','organic','site',50),
 ('gbp','Google Business Profile','organic','google',60),
 ('instagram','Instagram','organic','meta',70),
 ('facebook','Facebook','organic','meta',80),
 ('tiktok_organic','TikTok Organic','organic','tiktok',90),
 ('telegram','Telegram','messenger','telegram',100),
 ('viber','Viber','messenger','viber',110),
 ('whatsapp','WhatsApp','messenger','whatsapp',120),
 ('binotel','Binotel','offline','binotel',130),
 ('site_forms','Форми сайту','organic','site',140),
 ('adsquiz','AdsQuiz','paid','adsquiz',150),
 ('email','Email','organic','email',160),
 ('partners','Партнери','partner',NULL,170),
 ('referrals','Рекомендації','referral',NULL,180),
 ('repeat','Повторні клієнти','referral',NULL,190),
 ('outdoor','Зовнішня реклама','offline',NULL,200),
 ('flyers','Флаєри','offline',NULL,210),
 ('qr','QR-коди','offline',NULL,220),
 ('car_branding','Брендування авто','offline',NULL,230),
 ('other','Інше','offline',NULL,999)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.marketing_lead_reasons (name, sort_order) VALUES
 ('Занадто мала площа',10),('Поза зоною роботи',20),('Інша послуга',30),('Шукає матеріали',40),
 ('Шукає роботу',50),('Помилковий номер',60),('Дублікат',70),('Дорого',80),
 ('Консультація без об''єкта',90),('Конкурент',100),('Спам',110),('Терміни невідомі',120),('Інше',999)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.marketing_integrations (provider, title, priority, is_read_only) VALUES
 ('ga4','Google Analytics 4',10,true),
 ('google_ads','Google Ads',20,true),
 ('meta_ads','Meta Ads',30,true),
 ('site_forms','Форми сайту TERZI',40,true),
 ('adsquiz','AdsQuiz',50,true),
 ('binotel','Binotel',60,true),
 ('instagram','Instagram',70,true),
 ('facebook','Facebook Messenger',80,true),
 ('whatsapp','WhatsApp Business',90,true),
 ('telegram','Telegram',100,true),
 ('viber','Viber Business',110,true),
 ('tiktok_ads','TikTok Ads',120,true),
 ('olx','OLX',130,true),
 ('gtm','Google Tag Manager',140,true),
 ('gsc','Google Search Console',150,true),
 ('email','Email',160,true)
ON CONFLICT (provider) DO NOTHING;