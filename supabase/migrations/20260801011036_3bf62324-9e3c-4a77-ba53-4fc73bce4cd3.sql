CREATE OR REPLACE FUNCTION public.sync_user_roles_from_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.app_role[];
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    target := ARRAY[]::public.app_role[];
  ELSE
    target := CASE NEW.role_key
      WHEN 'owner' THEN ARRAY['admin','manager']::public.app_role[]
      WHEN 'ops_admin' THEN ARRAY['admin','manager']::public.app_role[]
      WHEN 'finance' THEN ARRAY['finance','manager']::public.app_role[]
      ELSE ARRAY['manager']::public.app_role[]
    END;
  END IF;

  DELETE FROM public.user_roles ur
   WHERE ur.user_id = NEW.user_id
     AND NOT (ur.role = ANY (target));

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.user_id, r FROM unnest(target) AS r
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_user_roles_from_access ON public.user_access;
CREATE TRIGGER trg_sync_user_roles_from_access
AFTER INSERT OR UPDATE OF role_key, status ON public.user_access
FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles_from_access();

-- backfill: remove stale roles then insert mapped roles
DELETE FROM public.user_roles ur
 USING public.user_access ua
 WHERE ua.user_id = ur.user_id
   AND NOT (ur.role = ANY (
     CASE WHEN ua.status IS DISTINCT FROM 'active' THEN ARRAY[]::public.app_role[]
          WHEN ua.role_key IN ('owner','ops_admin') THEN ARRAY['admin','manager']::public.app_role[]
          WHEN ua.role_key = 'finance' THEN ARRAY['finance','manager']::public.app_role[]
          ELSE ARRAY['manager']::public.app_role[] END));

INSERT INTO public.user_roles (user_id, role)
SELECT ua.user_id, r
  FROM public.user_access ua
  CROSS JOIN LATERAL unnest(
    CASE WHEN ua.status IS DISTINCT FROM 'active' THEN ARRAY[]::public.app_role[]
         WHEN ua.role_key IN ('owner','ops_admin') THEN ARRAY['admin','manager']::public.app_role[]
         WHEN ua.role_key = 'finance' THEN ARRAY['finance','manager']::public.app_role[]
         ELSE ARRAY['manager']::public.app_role[] END) AS r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur WHERE ur.user_id = ua.user_id AND ur.role = r);

-- 2. Object manager -> object_assignments
CREATE OR REPLACE FUNCTION public.sync_object_manager_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.object_assignments oa
   WHERE oa.object_id = NEW.id AND oa.role = 'manager'
     AND (NEW.manager_id IS NULL OR oa.user_id IS DISTINCT FROM NEW.manager_id);

  IF NEW.manager_id IS NOT NULL THEN
    INSERT INTO public.object_assignments (object_id, role, user_id)
    SELECT NEW.id, 'manager', NEW.manager_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.object_assignments oa
       WHERE oa.object_id = NEW.id AND oa.role = 'manager' AND oa.user_id = NEW.manager_id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_object_manager_assignment ON public.objects;
CREATE TRIGGER trg_sync_object_manager_assignment
AFTER INSERT OR UPDATE OF manager_id ON public.objects
FOR EACH ROW EXECUTE FUNCTION public.sync_object_manager_assignment();

INSERT INTO public.object_assignments (object_id, role, user_id)
SELECT o.id, 'manager', o.manager_id
  FROM public.objects o
 WHERE o.manager_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.object_assignments oa
      WHERE oa.object_id = o.id AND oa.role = 'manager' AND oa.user_id = o.manager_id
   );

-- 3. Rate limiting for sensitive verifications
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_rate_limits TO service_role;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Access managers read rate limits" ON public.auth_rate_limits;
CREATE POLICY "Access managers read rate limits"
  ON public.auth_rate_limits FOR SELECT TO authenticated
  USING (public.can_manage_access(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup
  ON public.auth_rate_limits (user_id, action, created_at DESC);

-- 4. Indexes for RLS filters and hot lists
CREATE INDEX IF NOT EXISTS idx_clients_owner_created ON public.clients (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimates_owner_created ON public.estimates (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_objects_manager ON public.objects (manager_id);
CREATE INDEX IF NOT EXISTS idx_objects_client ON public.objects (client_id);
CREATE INDEX IF NOT EXISTS idx_object_assignments_user ON public.object_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_object_assignments_object ON public.object_assignments (object_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_owner_created ON public.crm_leads (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON public.crm_leads (stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_due ON public.crm_tasks (assigned_to, due_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts ON public.calendar_events (starts_at);