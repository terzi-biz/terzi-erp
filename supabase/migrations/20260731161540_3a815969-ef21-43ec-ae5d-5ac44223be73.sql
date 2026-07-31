UPDATE public.integration_sync_settings s
SET mode = 'bidirectional', poll_enabled = true
FROM public.integrations i
WHERE i.id = s.integration_id AND i.provider_key = 'keycrm'
  AND s.entity IN ('pipelines','pipeline_statuses','lead_cards','buyers');