CREATE TABLE IF NOT EXISTS public.integration_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  entity text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  page integer NOT NULL DEFAULT 0,
  page_size integer NOT NULL DEFAULT 50,
  received integer NOT NULL DEFAULT 0,
  applied integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  total_estimate integer,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, entity),
  CONSTRAINT integration_import_runs_status_chk CHECK (status IN ('pending','running','done','error','cancelled'))
);

GRANT SELECT ON public.integration_import_runs TO authenticated;
GRANT ALL ON public.integration_import_runs TO service_role;

ALTER TABLE public.integration_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_runs_read" ON public.integration_import_runs FOR SELECT TO authenticated
  USING (can_manage_access(auth.uid()) OR has_permission(auth.uid(),'integrations','view'));

DROP TRIGGER IF EXISTS t_import_runs_updated ON public.integration_import_runs;
CREATE TRIGGER t_import_runs_updated BEFORE UPDATE ON public.integration_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();