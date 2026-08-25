-- ============ Wave 3: direction builder ============
ALTER TABLE public.directions
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS is_addon boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS current_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.input_fields
  ADD COLUMN IF NOT EXISTS min_value numeric,
  ADD COLUMN IF NOT EXISTS max_value numeric,
  ADD COLUMN IF NOT EXISTS visible_if text,
  ADD COLUMN IF NOT EXISTS group_label text,
  ADD COLUMN IF NOT EXISTS placeholder text;

CREATE TABLE IF NOT EXISTS public.direction_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction_id text NOT NULL REFERENCES public.directions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  config jsonb NOT NULL,
  engine_version text NOT NULL,
  note text,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (direction_id, version)
);

GRANT SELECT, INSERT ON public.direction_versions TO authenticated;
GRANT ALL ON public.direction_versions TO service_role;
ALTER TABLE public.direction_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "direction_versions_select_auth" ON public.direction_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "direction_versions_insert_admin" ON public.direction_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

-- ============ Wave 4: lead intake ============
CREATE TABLE IF NOT EXISTS public.lead_intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  source text,
  campaign text,
  ip_hash text,
  signature_ok boolean NOT NULL DEFAULT false,
  dedupe_hash text NOT NULL,
  contact_name text,
  phone_norm text,
  email text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  gclid text,
  fbclid text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'accepted',
  error text,
  request_id uuid REFERENCES public.crm_requests(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_events_dedupe_key ON public.lead_intake_events(dedupe_hash);
CREATE INDEX IF NOT EXISTS lead_intake_events_created_idx ON public.lead_intake_events(created_at DESC);
CREATE INDEX IF NOT EXISTS lead_intake_events_ip_idx ON public.lead_intake_events(ip_hash, created_at DESC);

GRANT SELECT ON public.lead_intake_events TO authenticated;
GRANT ALL ON public.lead_intake_events TO service_role;
ALTER TABLE public.lead_intake_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_intake_select_admin" ON public.lead_intake_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE TRIGGER update_lead_intake_events_updated_at
  BEFORE UPDATE ON public.lead_intake_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
