-- Helper: CRM manager (admin/director)
CREATE OR REPLACE FUNCTION public.crm_is_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','director'))
    OR EXISTS (SELECT 1 FROM public.user_access ua WHERE ua.user_id = auth.uid() AND ua.status = 'active' AND ua.role_key IN ('owner','ops_admin','commercial_director','executive_director'))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.crm_is_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_is_manager() TO authenticated, service_role;

-- ENUMS
CREATE TYPE public.crm_lead_status AS ENUM ('open','won','lost','postponed');
CREATE TYPE public.crm_task_status AS ENUM ('open','done','cancelled');
CREATE TYPE public.crm_task_priority AS ENUM ('low','normal','high','critical');
CREATE TYPE public.crm_call_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.crm_request_status AS ENUM ('new','in_progress','converted','spam','closed');

-- PIPELINES
CREATE TABLE public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipelines TO authenticated;
GRANT ALL ON public.crm_pipelines TO service_role;
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_pipelines_select" ON public.crm_pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_pipelines_write" ON public.crm_pipelines FOR INSERT TO authenticated WITH CHECK (public.crm_is_manager());
CREATE POLICY "crm_pipelines_update" ON public.crm_pipelines FOR UPDATE TO authenticated USING (public.crm_is_manager()) WITH CHECK (public.crm_is_manager());
CREATE POLICY "crm_pipelines_delete" ON public.crm_pipelines FOR DELETE TO authenticated USING (public.crm_is_manager());

-- STAGES
CREATE TABLE public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  color text,
  probability numeric NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_stages TO authenticated;
GRANT ALL ON public.crm_stages TO service_role;
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_stages_select" ON public.crm_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_stages_insert" ON public.crm_stages FOR INSERT TO authenticated WITH CHECK (public.crm_is_manager());
CREATE POLICY "crm_stages_update" ON public.crm_stages FOR UPDATE TO authenticated USING (public.crm_is_manager()) WITH CHECK (public.crm_is_manager());
CREATE POLICY "crm_stages_delete" ON public.crm_stages FOR DELETE TO authenticated USING (public.crm_is_manager());

-- CONTACTS
CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  full_name text NOT NULL,
  phone text,
  phone_norm text,
  phone_extra jsonb NOT NULL DEFAULT '[]'::jsonb,
  email text,
  messengers jsonb NOT NULL DEFAULT '{}'::jsonb,
  position text,
  company text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_contacts_phone_norm_idx ON public.crm_contacts(phone_norm);
CREATE INDEX crm_contacts_client_idx ON public.crm_contacts(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_contacts_select" ON public.crm_contacts FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_contacts_insert" ON public.crm_contacts FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_contacts_update" ON public.crm_contacts FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager()) WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_contacts_delete" ON public.crm_contacts FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());

-- LEADS
CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  assigned_to uuid,
  title text NOT NULL,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.crm_stages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  source text,
  campaign text,
  direction text,
  budget numeric,
  area numeric,
  address text,
  district text,
  probability numeric,
  status public.crm_lead_status NOT NULL DEFAULT 'open',
  lost_reason text,
  next_action_at timestamptz,
  closed_at timestamptz,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_leads_stage_idx ON public.crm_leads(stage_id);
CREATE INDEX crm_leads_owner_idx ON public.crm_leads(owner_id);
CREATE INDEX crm_leads_next_action_idx ON public.crm_leads(next_action_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_leads_select" ON public.crm_leads FOR SELECT TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_leads_insert" ON public.crm_leads FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_leads_update" ON public.crm_leads FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager()) WITH CHECK (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_leads_delete" ON public.crm_leads FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());

-- REQUESTS
CREATE TABLE public.crm_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  assigned_to uuid,
  channel text NOT NULL DEFAULT 'manual',
  subject text,
  message text,
  source text,
  campaign text,
  contact_name text,
  contact_phone text,
  contact_phone_norm text,
  contact_email text,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  status public.crm_request_status NOT NULL DEFAULT 'new',
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_requests_status_idx ON public.crm_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_requests TO authenticated;
GRANT ALL ON public.crm_requests TO service_role;
ALTER TABLE public.crm_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_requests_select" ON public.crm_requests FOR SELECT TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_requests_insert" ON public.crm_requests FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_requests_update" ON public.crm_requests FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager()) WITH CHECK (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_requests_delete" ON public.crm_requests FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());

-- CALLS
CREATE TABLE public.crm_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  direction public.crm_call_direction NOT NULL DEFAULT 'inbound',
  from_number text,
  to_number text,
  phone_norm text,
  started_at timestamptz NOT NULL DEFAULT now(),
  duration_sec integer NOT NULL DEFAULT 0,
  status text,
  recording_url text,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_calls_started_idx ON public.crm_calls(started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_calls TO authenticated;
GRANT ALL ON public.crm_calls TO service_role;
ALTER TABLE public.crm_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_calls_select" ON public.crm_calls FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_calls_insert" ON public.crm_calls FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_calls_update" ON public.crm_calls FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager()) WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_calls_delete" ON public.crm_calls FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());

-- TASKS
CREATE TABLE public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  assigned_to uuid,
  kind text NOT NULL DEFAULT 'call',
  title text NOT NULL,
  description text,
  due_at timestamptz,
  priority public.crm_task_priority NOT NULL DEFAULT 'normal',
  status public.crm_task_status NOT NULL DEFAULT 'open',
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_tasks_due_idx ON public.crm_tasks(due_at);
CREATE INDEX crm_tasks_status_idx ON public.crm_tasks(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_tasks_select" ON public.crm_tasks FOR SELECT TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_tasks_insert" ON public.crm_tasks FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_tasks_update" ON public.crm_tasks FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager()) WITH CHECK (owner_id = auth.uid() OR assigned_to = auth.uid() OR public.crm_is_manager());
CREATE POLICY "crm_tasks_delete" ON public.crm_tasks FOR DELETE TO authenticated USING (owner_id = auth.uid() OR public.crm_is_manager());

-- ACTIVITIES
CREATE TABLE public.crm_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  actor_id uuid DEFAULT auth.uid(),
  actor_name text,
  kind text NOT NULL DEFAULT 'note',
  body text,
  from_stage_id uuid,
  to_stage_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_lead_activities_lead_idx ON public.crm_lead_activities(lead_id, created_at DESC);
GRANT SELECT, INSERT ON public.crm_lead_activities TO authenticated;
GRANT ALL ON public.crm_lead_activities TO service_role;
ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_lead_activities_select" ON public.crm_lead_activities FOR SELECT TO authenticated USING (
  public.crm_is_manager() OR EXISTS (
    SELECT 1 FROM public.crm_leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR l.assigned_to = auth.uid())
  )
);
CREATE POLICY "crm_lead_activities_insert" ON public.crm_lead_activities FOR INSERT TO authenticated WITH CHECK (
  actor_id = auth.uid() AND (
    public.crm_is_manager() OR EXISTS (
      SELECT 1 FROM public.crm_leads l WHERE l.id = lead_id AND (l.owner_id = auth.uid() OR l.assigned_to = auth.uid())
    )
  )
);

-- updated_at triggers
CREATE TRIGGER trg_crm_pipelines_updated BEFORE UPDATE ON public.crm_pipelines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_stages_updated BEFORE UPDATE ON public.crm_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_contacts_updated BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_leads_updated BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_requests_updated BEFORE UPDATE ON public.crm_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_calls_updated BEFORE UPDATE ON public.crm_calls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_crm_tasks_updated BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- phone normalization
CREATE OR REPLACE FUNCTION public.crm_normalize_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'crm_contacts' THEN
    NEW.phone_norm := NULLIF(regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g'), '');
  ELSIF TG_TABLE_NAME = 'crm_requests' THEN
    NEW.contact_phone_norm := NULLIF(regexp_replace(COALESCE(NEW.contact_phone,''), '\D', '', 'g'), '');
  ELSIF TG_TABLE_NAME = 'crm_calls' THEN
    NEW.phone_norm := NULLIF(regexp_replace(COALESCE(CASE WHEN NEW.direction = 'inbound' THEN NEW.from_number ELSE NEW.to_number END,''), '\D', '', 'g'), '');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_crm_contacts_phone BEFORE INSERT OR UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.crm_normalize_phone();
CREATE TRIGGER trg_crm_requests_phone BEFORE INSERT OR UPDATE ON public.crm_requests FOR EACH ROW EXECUTE FUNCTION public.crm_normalize_phone();
CREATE TRIGGER trg_crm_calls_phone BEFORE INSERT OR UPDATE ON public.crm_calls FOR EACH ROW EXECUTE FUNCTION public.crm_normalize_phone();

-- Seed default pipeline + stages
INSERT INTO public.crm_pipelines (key, name, description, is_default, sort_order)
VALUES ('sales', 'Продажі', 'Основна воронка продажів TERZI', true, 1);

INSERT INTO public.crm_stages (pipeline_id, key, name, color, probability, is_won, is_lost, sort_order)
SELECT p.id, s.key, s.name, s.color, s.prob, s.won, s.lost, s.ord
FROM public.crm_pipelines p,
(VALUES
  ('new','Новий','#3B82F6',10,false,false,1),
  ('qualification','Кваліфікація','#6366F1',20,false,false,2),
  ('measurement','Замір','#0EA5E9',35,false,false,3),
  ('calculation','Розрахунок','#F59E0B',50,false,false,4),
  ('proposal','КП надіслано','#F97316',65,false,false,5),
  ('negotiation','Переговори','#EAB308',75,false,false,6),
  ('contract','Договір','#22C55E',90,false,false,7),
  ('won','Виграно','#16A34A',100,true,false,8),
  ('lost','Програно','#EF4444',0,false,true,9)
) AS s(key,name,color,prob,won,lost,ord)
WHERE p.key = 'sales';