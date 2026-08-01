-- ============ 1. Розширення crm_calls ============
ALTER TABLE public.crm_calls
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS company_id text,
  ADD COLUMN IF NOT EXISTS pbx_number text,
  ADD COLUMN IF NOT EXISTS pbx_number_name text,
  ADD COLUMN IF NOT EXISTS internal_number text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS employee_id uuid,
  ADD COLUMN IF NOT EXISTS answered_employee_id uuid,
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_seconds integer,
  ADD COLUMN IF NOT EXISTS disposition_raw text,
  ADD COLUMN IF NOT EXISTS is_new_call boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_missed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_tracking jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS crm_calls_external_uniq
  ON public.crm_calls (external_source, external_id)
  WHERE external_id IS NOT NULL AND external_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_calls_phone_norm_idx ON public.crm_calls (phone_norm);
CREATE INDEX IF NOT EXISTS crm_calls_started_at_idx ON public.crm_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS crm_calls_lead_idx ON public.crm_calls (lead_id);
CREATE INDEX IF NOT EXISTS crm_calls_client_idx ON public.crm_calls (client_id);

-- ============ 2. Мапінг співробітників Binotel ============
CREATE TABLE IF NOT EXISTS public.binotel_employee_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binotel_employee_id text,
  binotel_email text,
  binotel_internal_number text,
  binotel_employee_name text,
  local_user_id uuid,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  mapping_status text NOT NULL DEFAULT 'unmapped',
  last_synced_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS binotel_emp_ext_uniq ON public.binotel_employee_mappings (binotel_employee_id) WHERE binotel_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS binotel_emp_internal_idx ON public.binotel_employee_mappings (binotel_internal_number);
CREATE INDEX IF NOT EXISTS binotel_emp_local_idx ON public.binotel_employee_mappings (local_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.binotel_employee_mappings TO authenticated;
GRANT ALL ON public.binotel_employee_mappings TO service_role;
ALTER TABLE public.binotel_employee_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "binotel_emp_read" ON public.binotel_employee_mappings FOR SELECT TO authenticated USING (public.crm_is_manager());
CREATE POLICY "binotel_emp_write" ON public.binotel_employee_mappings FOR ALL TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

-- ============ 3. Мапінг номерів АТС ============
CREATE TABLE IF NOT EXISTS public.binotel_pbx_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pbx_number text NOT NULL,
  pbx_number_name text,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  service_direction text,
  default_assignee uuid,
  source_label text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS binotel_pbx_number_uniq ON public.binotel_pbx_mappings (pbx_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.binotel_pbx_mappings TO authenticated;
GRANT ALL ON public.binotel_pbx_mappings TO service_role;
ALTER TABLE public.binotel_pbx_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "binotel_pbx_read" ON public.binotel_pbx_mappings FOR SELECT TO authenticated USING (public.crm_is_manager());
CREATE POLICY "binotel_pbx_write" ON public.binotel_pbx_mappings FOR ALL TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

-- ============ 4. Тимчасові сесії дзвінків ============
CREATE TABLE IF NOT EXISTS public.binotel_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL,
  company_id text,
  general_call_id text,
  phone_norm text,
  pbx_number text,
  call_type text,
  contact_id uuid,
  client_id uuid,
  lead_id uuid,
  assigned_user_id uuid,
  created_lead boolean NOT NULL DEFAULT false,
  created_contact boolean NOT NULL DEFAULT false,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS binotel_session_key_uniq ON public.binotel_call_sessions (session_key);
CREATE INDEX IF NOT EXISTS binotel_session_gcid_idx ON public.binotel_call_sessions (general_call_id);
CREATE INDEX IF NOT EXISTS binotel_session_expires_idx ON public.binotel_call_sessions (expires_at);

GRANT SELECT ON public.binotel_call_sessions TO authenticated;
GRANT ALL ON public.binotel_call_sessions TO service_role;
ALTER TABLE public.binotel_call_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "binotel_sessions_read" ON public.binotel_call_sessions FOR SELECT TO authenticated USING (public.crm_is_manager());

-- ============ 5. Налаштування Binotel ============
CREATE TABLE IF NOT EXISTS public.binotel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  missed_sla_minutes integer NOT NULL DEFAULT 5,
  escalation_minutes integer NOT NULL DEFAULT 15,
  auto_create_lead boolean NOT NULL DEFAULT true,
  auto_create_contact boolean NOT NULL DEFAULT true,
  auto_create_missed_task boolean NOT NULL DEFAULT true,
  route_to_assigned_manager boolean NOT NULL DEFAULT true,
  default_pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  default_stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  reconcile_window_hours integer NOT NULL DEFAULT 24,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS binotel_settings_integration_uniq ON public.binotel_settings (integration_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.binotel_settings TO authenticated;
GRANT ALL ON public.binotel_settings TO service_role;
ALTER TABLE public.binotel_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "binotel_settings_read" ON public.binotel_settings FOR SELECT TO authenticated USING (public.crm_is_manager());
CREATE POLICY "binotel_settings_write" ON public.binotel_settings FOR ALL TO authenticated
  USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

-- ============ 6. Ідемпотентність задач ============
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS external_key text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_external_key_uniq ON public.crm_tasks (external_key) WHERE external_key IS NOT NULL;

-- ============ 7. updated_at тригери ============
DROP TRIGGER IF EXISTS trg_binotel_emp_updated ON public.binotel_employee_mappings;
CREATE TRIGGER trg_binotel_emp_updated BEFORE UPDATE ON public.binotel_employee_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_binotel_pbx_updated ON public.binotel_pbx_mappings;
CREATE TRIGGER trg_binotel_pbx_updated BEFORE UPDATE ON public.binotel_pbx_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_binotel_sessions_updated ON public.binotel_call_sessions;
CREATE TRIGGER trg_binotel_sessions_updated BEFORE UPDATE ON public.binotel_call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_binotel_settings_updated ON public.binotel_settings;
CREATE TRIGGER trg_binotel_settings_updated BEFORE UPDATE ON public.binotel_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();