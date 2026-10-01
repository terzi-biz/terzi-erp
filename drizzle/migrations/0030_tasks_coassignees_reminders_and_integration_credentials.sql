ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS co_assignees uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS remind_at timestamptz;
CREATE INDEX IF NOT EXISTS crm_tasks_co_assignees_idx ON public.crm_tasks USING gin (co_assignees);
CREATE INDEX IF NOT EXISTS crm_tasks_assigned_status_idx ON public.crm_tasks (assigned_to, status, due_at);

DROP POLICY IF EXISTS crm_tasks_select ON public.crm_tasks;
CREATE POLICY crm_tasks_select ON public.crm_tasks FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR auth.uid() = ANY(co_assignees) OR private.crm_is_manager());
DROP POLICY IF EXISTS crm_tasks_update ON public.crm_tasks;
CREATE POLICY crm_tasks_update ON public.crm_tasks FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR auth.uid() = ANY(co_assignees) OR private.crm_is_manager())
  WITH CHECK (owner_id = auth.uid() OR assigned_to = auth.uid() OR auth.uid() = ANY(co_assignees) OR private.crm_is_manager());

-- Encrypted integration credentials: only service_role may read/write (server functions after admin check).
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  name text PRIMARY KEY,
  provider text NOT NULL,
  ciphertext text NOT NULL,
  iv text NOT NULL,
  hint text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.integration_credentials TO service_role;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.integration_credentials IS 'AES-GCM encrypted API keys entered in UI; service_role only, no client policies.';