INSERT INTO public.integrations (provider_key, name, slug, status, enabled, config)
VALUES ('keycrm', 'keyCRM TERZI', 'keycrm-terzi', 'connecting', true,
  jsonb_build_object('base_url','https://openapi.keycrm.app/v1','rpm',60,'page_size',50,'account_url','https://terzi-biz.keycrm.app/app/'))
ON CONFLICT (slug) DO UPDATE SET config = EXCLUDED.config, enabled = true;

INSERT INTO public.integration_secrets (integration_id, secret_key, secret_ref, masked_hint, rotated_at)
SELECT id, 'api_key', 'KEYCRM_API_KEY', 'YTM…ODUzYw', now() FROM public.integrations WHERE slug = 'keycrm-terzi'
ON CONFLICT (integration_id, secret_key) DO UPDATE SET secret_ref = EXCLUDED.secret_ref, masked_hint = EXCLUDED.masked_hint, rotated_at = now();

INSERT INTO public.integration_sync_settings (integration_id, entity, mode, poll_enabled)
SELECT i.id, e.entity, 'off', false
FROM public.integrations i
CROSS JOIN (VALUES ('pipelines'),('pipeline_statuses'),('order_statuses'),('sources'),('managers'),('custom_fields'),('companies'),('buyers'),('lead_cards'),('orders'),('payments'),('comments')) AS e(entity)
WHERE i.slug = 'keycrm-terzi'
ON CONFLICT (integration_id, entity) DO NOTHING;