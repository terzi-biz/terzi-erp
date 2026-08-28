ALTER TABLE public.integration_events
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS event_ts timestamptz,
  ADD COLUMN IF NOT EXISTS correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsupported boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_integration_events_provider_event
  ON public.integration_events (integration_id, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_correlation
  ON public.integration_events (correlation_id);

ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.crm_calls ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS phone_e164 text;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone_e164 ON public.crm_contacts (phone_e164);
CREATE INDEX IF NOT EXISTS idx_crm_calls_phone_e164 ON public.crm_calls (phone_e164);