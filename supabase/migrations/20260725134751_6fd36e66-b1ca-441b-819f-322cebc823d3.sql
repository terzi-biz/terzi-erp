
-- Enums
CREATE TYPE public.object_commercial_status AS ENUM (
  'new','qualification','measurement_scheduled','measurement_done','calculation',
  'estimate_sent','negotiation','contract','awaiting_prepayment','sold','refused','postponed'
);
CREATE TYPE public.object_production_status AS ENUM (
  'not_planned','preparation','awaiting_materials','ready_to_plan','planned',
  'crew_assigned','in_progress','paused','works_done','acceptance','remarks','handed_over','warranty'
);
CREATE TYPE public.object_financial_status AS ENUM (
  'no_invoice','awaiting_payment','partial_payment','prepayment_received',
  'has_debt','paid','financially_closed'
);
CREATE TYPE public.object_risk_level AS ENUM ('green','yellow','red');
CREATE TYPE public.object_service AS ENUM (
  'screed','roofing_pvc','roofing_ruberoid','insulation','demolition','plaster','polybeton','other'
);
CREATE TYPE public.object_assignment_role AS ENUM (
  'manager','surveyor','estimator','foreman','brigadier','executor','accountant','buyer','qc'
);
CREATE TYPE public.object_measurement_type AS ENUM ('primary','repeat','control','as_built');
CREATE TYPE public.object_measurement_status AS ENUM ('draft','done','cancelled');

-- Sequence for TRZ number
CREATE SEQUENCE IF NOT EXISTS public.object_number_seq START 1;

-- OBJECTS
CREATE TABLE public.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE NOT NULL,
  name text NOT NULL,
  address text,
  district text,
  latitude numeric,
  longitude numeric,
  object_type text,
  floor int,
  has_lift boolean DEFAULT false,
  access_notes text,
  distance_km numeric,
  notes text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text,
  crm_link text,
  commercial_status public.object_commercial_status NOT NULL DEFAULT 'new',
  production_status public.object_production_status NOT NULL DEFAULT 'not_planned',
  financial_status public.object_financial_status NOT NULL DEFAULT 'no_invoice',
  risk_level public.object_risk_level NOT NULL DEFAULT 'green',
  planned_start timestamptz,
  planned_end timestamptz,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objects TO authenticated;
GRANT ALL ON public.objects TO service_role;
GRANT USAGE ON SEQUENCE public.object_number_seq TO authenticated;

ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objects_admin_all" ON public.objects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));
CREATE POLICY "objects_read_all_auth" ON public.objects FOR SELECT TO authenticated USING (true);
CREATE POLICY "objects_insert_own" ON public.objects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "objects_update_own_or_manager" ON public.objects FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR manager_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR manager_id = auth.uid());

-- Auto-number trigger
CREATE OR REPLACE FUNCTION public.set_object_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    n := nextval('public.object_number_seq');
    NEW.number := 'TRZ-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_objects_number BEFORE INSERT ON public.objects
  FOR EACH ROW EXECUTE FUNCTION public.set_object_number();
CREATE TRIGGER trg_objects_updated BEFORE UPDATE ON public.objects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OBJECT_SERVICES
CREATE TABLE public.object_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  service public.object_service NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_id, service)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_services TO authenticated;
GRANT ALL ON public.object_services TO service_role;
ALTER TABLE public.object_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_services_all_auth" ON public.object_services FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- OBJECT_ZONES
CREATE TABLE public.object_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  name text NOT NULL,
  service public.object_service,
  area numeric,
  perimeter numeric,
  thickness_cm numeric,
  slope_percent numeric,
  volume numeric,
  complexity text,
  base_type text,
  planned_start timestamptz,
  planned_end timestamptz,
  crew_id text,
  status text DEFAULT 'draft',
  archived boolean DEFAULT false,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_zones TO authenticated;
GRANT ALL ON public.object_zones TO service_role;
ALTER TABLE public.object_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_zones_all_auth" ON public.object_zones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_obj_zones_updated BEFORE UPDATE ON public.object_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OBJECT_MEASUREMENTS
CREATE TABLE public.object_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  type public.object_measurement_type NOT NULL DEFAULT 'primary',
  measured_at timestamptz,
  surveyor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_on_site text,
  area numeric,
  perimeter numeric,
  thicknesses jsonb DEFAULT '{}'::jsonb,
  slopes jsonb DEFAULT '{}'::jsonb,
  base jsonb DEFAULT '{}'::jsonb,
  logistics jsonb DEFAULT '{}'::jsonb,
  photos jsonb DEFAULT '[]'::jsonb,
  files jsonb DEFAULT '[]'::jsonb,
  notes text,
  status public.object_measurement_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_measurements TO authenticated;
GRANT ALL ON public.object_measurements TO service_role;
ALTER TABLE public.object_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_meas_all_auth" ON public.object_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_obj_meas_updated BEFORE UPDATE ON public.object_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- OBJECT_ASSIGNMENTS
CREATE TABLE public.object_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  role public.object_assignment_role NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_assignments TO authenticated;
GRANT ALL ON public.object_assignments TO service_role;
ALTER TABLE public.object_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_assign_all_auth" ON public.object_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- OBJECT_FILES
CREATE TABLE public.object_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  zone_id uuid REFERENCES public.object_zones(id) ON DELETE SET NULL,
  category text,
  url text NOT NULL,
  file_name text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_files TO authenticated;
GRANT ALL ON public.object_files TO service_role;
ALTER TABLE public.object_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_files_all_auth" ON public.object_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- OBJECT_COMMENTS
CREATE TABLE public.object_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  body text NOT NULL,
  mentions jsonb DEFAULT '[]'::jsonb,
  pinned boolean DEFAULT false,
  parent_id uuid REFERENCES public.object_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_comments TO authenticated;
GRANT ALL ON public.object_comments TO service_role;
ALTER TABLE public.object_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_comments_all_auth" ON public.object_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- OBJECT_STATUS_HISTORY
CREATE TABLE public.object_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES public.objects(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.object_status_history TO authenticated;
GRANT ALL ON public.object_status_history TO service_role;
ALTER TABLE public.object_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obj_hist_read" ON public.object_status_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "obj_hist_insert" ON public.object_status_history FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger to log status changes
CREATE OR REPLACE FUNCTION public.log_object_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.commercial_status IS DISTINCT FROM OLD.commercial_status THEN
    INSERT INTO public.object_status_history(object_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'commercial_status', OLD.commercial_status::text, NEW.commercial_status::text, auth.uid());
  END IF;
  IF NEW.production_status IS DISTINCT FROM OLD.production_status THEN
    INSERT INTO public.object_status_history(object_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'production_status', OLD.production_status::text, NEW.production_status::text, auth.uid());
  END IF;
  IF NEW.financial_status IS DISTINCT FROM OLD.financial_status THEN
    INSERT INTO public.object_status_history(object_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'financial_status', OLD.financial_status::text, NEW.financial_status::text, auth.uid());
  END IF;
  IF NEW.risk_level IS DISTINCT FROM OLD.risk_level THEN
    INSERT INTO public.object_status_history(object_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'risk_level', OLD.risk_level::text, NEW.risk_level::text, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_objects_status_log AFTER UPDATE ON public.objects
  FOR EACH ROW EXECUTE FUNCTION public.log_object_status_change();

-- Link existing tables
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL;
ALTER TABLE public.crew_bookings ADD COLUMN IF NOT EXISTS object_id uuid REFERENCES public.objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_object_id ON public.estimates(object_id);
CREATE INDEX IF NOT EXISTS idx_crew_bookings_object_id ON public.crew_bookings(object_id);
CREATE INDEX IF NOT EXISTS idx_objects_client_id ON public.objects(client_id);
CREATE INDEX IF NOT EXISTS idx_objects_manager_id ON public.objects(manager_id);
