-- 1. measurements: pre-order lifecycle
ALTER TABLE public.order_measurements
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

DROP POLICY IF EXISTS obj_meas_read ON public.order_measurements;
DROP POLICY IF EXISTS obj_meas_write ON public.order_measurements;
CREATE POLICY obj_meas_read ON public.order_measurements FOR SELECT TO authenticated
  USING (surveyor_id = auth.uid() OR created_by = auth.uid() OR private.crm_is_manager()
         OR (order_id IS NOT NULL AND private.can_view_object(order_id)));
CREATE POLICY obj_meas_write ON public.order_measurements FOR ALL TO authenticated
  USING (surveyor_id = auth.uid() OR created_by = auth.uid() OR private.crm_is_manager()
         OR (order_id IS NOT NULL AND private.can_manage_object(order_id)))
  WITH CHECK (surveyor_id = auth.uid() OR created_by = auth.uid() OR private.crm_is_manager()
         OR (order_id IS NOT NULL AND private.can_manage_object(order_id)));

-- 2. generic status history
CREATE TABLE IF NOT EXISTS public.entity_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL DEFAULT 'status',
  old_status text,
  new_status text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.entity_status_history TO authenticated;
GRANT ALL ON public.entity_status_history TO service_role;
ALTER TABLE public.entity_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY esh_read ON public.entity_status_history FOR SELECT TO authenticated
  USING (changed_by = auth.uid() OR private.crm_is_manager());
CREATE POLICY esh_insert ON public.entity_status_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS esh_entity_idx ON public.entity_status_history (entity_type, entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS esh_changed_at_idx ON public.entity_status_history (changed_at DESC);

CREATE OR REPLACE FUNCTION public.log_entity_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.entity_status_history (entity_type, entity_id, field, old_status, new_status, changed_by)
    VALUES (TG_ARGV[0], NEW.id, 'status',
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status::text END,
            NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_status_history ON public.crm_leads;
CREATE TRIGGER trg_lead_status_history AFTER INSERT OR UPDATE OF status ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_status_change('lead');
DROP TRIGGER IF EXISTS trg_measurement_status_history ON public.order_measurements;
CREATE TRIGGER trg_measurement_status_history AFTER INSERT OR UPDATE OF status ON public.order_measurements
  FOR EACH ROW EXECUTE FUNCTION public.log_entity_status_change('measurement');

-- 3. reconciliation / conflict queue
CREATE TABLE IF NOT EXISTS public.link_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  match_type text NOT NULL,
  candidate_ids uuid[] NOT NULL DEFAULT '{}',
  confidence numeric,
  reason text,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.link_conflicts TO authenticated;
GRANT ALL ON public.link_conflicts TO service_role;
ALTER TABLE public.link_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY link_conflicts_read ON public.link_conflicts FOR SELECT TO authenticated USING (private.crm_is_manager());
CREATE POLICY link_conflicts_write ON public.link_conflicts FOR INSERT TO authenticated WITH CHECK (private.crm_is_manager());
CREATE POLICY link_conflicts_update ON public.link_conflicts FOR UPDATE TO authenticated USING (private.crm_is_manager()) WITH CHECK (private.crm_is_manager());
CREATE UNIQUE INDEX IF NOT EXISTS link_conflicts_uniq ON public.link_conflicts (entity_type, entity_id, match_type) WHERE status = 'open';
DROP TRIGGER IF EXISTS trg_link_conflicts_updated ON public.link_conflicts;
CREATE TRIGGER trg_link_conflicts_updated BEFORE UPDATE ON public.link_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. estimate financial invariant enforced in DB
CREATE OR REPLACE FUNCTION public.enforce_estimate_financials()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE tc numeric := COALESCE(NEW.total_client, 0); cost numeric := COALESCE(NEW.total_cost, 0);
BEGIN
  NEW.gross_profit := tc - cost;
  NEW.margin_percent := CASE WHEN tc > 0 THEN ROUND(((tc - cost) / tc) * 100, 4) ELSE 0 END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_estimate_financials ON public.estimates;
CREATE TRIGGER trg_estimate_financials BEFORE INSERT OR UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_financials();

-- 5. indexes for the P0 queries
CREATE INDEX IF NOT EXISTS crm_leads_phone_e164_idx ON public.crm_leads (phone_e164);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON public.crm_leads (status);
CREATE INDEX IF NOT EXISTS crm_leads_created_at_idx ON public.crm_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_contact_idx ON public.crm_leads (contact_id);
CREATE INDEX IF NOT EXISTS crm_leads_client_idx ON public.crm_leads (client_id);
CREATE INDEX IF NOT EXISTS crm_leads_order_idx ON public.crm_leads (order_id);
CREATE INDEX IF NOT EXISTS crm_leads_ext_idx ON public.crm_leads (external_source, external_id);
CREATE INDEX IF NOT EXISTS crm_contacts_phone_e164_idx ON public.crm_contacts (phone_e164);
CREATE INDEX IF NOT EXISTS crm_contacts_client_idx ON public.crm_contacts (client_id);
CREATE INDEX IF NOT EXISTS clients_phone_e164_idx ON public.clients (phone_e164);
CREATE INDEX IF NOT EXISTS crm_calls_started_at_idx ON public.crm_calls (started_at DESC);
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx ON public.crm_tasks (status, due_at);
CREATE INDEX IF NOT EXISTS estimates_order_idx ON public.estimates (order_id);
CREATE INDEX IF NOT EXISTS estimates_client_idx ON public.estimates (client_id);
CREATE INDEX IF NOT EXISTS order_meas_lead_idx ON public.order_measurements (lead_id);
CREATE INDEX IF NOT EXISTS order_meas_sched_idx ON public.order_measurements (scheduled_at);
CREATE INDEX IF NOT EXISTS order_meas_surveyor_idx ON public.order_measurements (surveyor_id);