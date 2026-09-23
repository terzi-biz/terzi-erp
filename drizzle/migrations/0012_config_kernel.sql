CREATE TABLE public.config_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  key text NOT NULL,
  scope_type text NOT NULL DEFAULT 'company' CHECK (scope_type IN ('system','company','branch','department','role','user')),
  scope_id text NOT NULL DEFAULT '',
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','superseded','discarded')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  sensitive boolean NOT NULL DEFAULT false,
  based_on_version integer,
  change_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  published_at timestamptz,
  UNIQUE (kind, key, scope_type, scope_id, version)
);
CREATE UNIQUE INDEX config_entries_one_published ON public.config_entries (kind, key, scope_type, scope_id) WHERE status = 'published';
CREATE UNIQUE INDEX config_entries_one_draft ON public.config_entries (kind, key, scope_type, scope_id) WHERE status = 'draft';
CREATE INDEX config_entries_kind_status ON public.config_entries (kind, status);

GRANT SELECT ON public.config_entries TO authenticated;
GRANT ALL ON public.config_entries TO service_role;
ALTER TABLE public.config_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published config readable" ON public.config_entries
  FOR SELECT TO authenticated
  USING (status = 'published' AND (NOT sensitive OR public.is_finance_user(auth.uid())));

COMMENT ON TABLE public.config_entries IS 'TERZI Control Plane kernel: scoped, versioned configuration overlays. Writes only via server functions (service role). Empty table = code defaults.';