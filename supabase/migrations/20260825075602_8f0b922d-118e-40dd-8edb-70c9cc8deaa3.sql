CREATE TABLE public.screed_config (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT, INSERT, UPDATE ON public.screed_config TO authenticated;
GRANT ALL ON public.screed_config TO service_role;

ALTER TABLE public.screed_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "screed_config_select_auth" ON public.screed_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "screed_config_insert_admin" ON public.screed_config
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE POLICY "screed_config_update_admin" ON public.screed_config
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'director'));

CREATE TRIGGER update_screed_config_updated_at
  BEFORE UPDATE ON public.screed_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();