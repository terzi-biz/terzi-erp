-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.access_scope AS ENUM ('own','assigned','department','company','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_status AS ENUM ('invited','pending','active','suspended','blocked','dismissed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.permission_effect AS ENUM ('allow','deny');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM ('sent','accepted','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_request_kind AS ENUM ('registration','recovery','elevation','temporary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.access_request_status AS ENUM ('pending','approved','rejected','info_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ ROLES ============
CREATE TABLE IF NOT EXISTS public.access_roles (
  key text PRIMARY KEY,
  name text NOT NULL,
  description text,
  default_scope public.access_scope NOT NULL DEFAULT 'company',
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_by uuid,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.access_roles TO authenticated;
GRANT ALL ON public.access_roles TO service_role;
ALTER TABLE public.access_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.access_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  label text,
  is_critical boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, action)
);
GRANT SELECT ON public.access_permissions TO authenticated;
GRANT ALL ON public.access_permissions TO service_role;
ALTER TABLE public.access_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL REFERENCES public.access_roles(key) ON DELETE CASCADE,
  module text NOT NULL,
  action text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_key, module, action)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ============ USER ACCESS ============
CREATE TABLE IF NOT EXISTS public.user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role_key text REFERENCES public.access_roles(key),
  scope public.access_scope NOT NULL DEFAULT 'own',
  scope_modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.access_status NOT NULL DEFAULT 'pending',
  manager_id uuid,
  position text,
  department text,
  temporary boolean NOT NULL DEFAULT false,
  access_expires_at timestamptz,
  last_sign_in_at timestamptz,
  admin_note text,
  blocked_at timestamptz,
  blocked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_access TO authenticated;
GRANT ALL ON public.user_access TO service_role;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  effect public.permission_effect NOT NULL,
  reason text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, action)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  middle_name text,
  phone text,
  avatar_url text,
  position text,
  department text,
  role_key text REFERENCES public.access_roles(key),
  manager_id uuid,
  scope public.access_scope NOT NULL DEFAULT 'own',
  temporary boolean NOT NULL DEFAULT false,
  access_expires_at timestamptz,
  overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_note text,
  status public.invitation_status NOT NULL DEFAULT 'sent',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  display_name text,
  kind public.access_request_kind NOT NULL DEFAULT 'registration',
  current_role_key text,
  requested_role_key text,
  requested_module text,
  requested_action text,
  reason text,
  status public.access_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  temporary_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT ============
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  module text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  entity_label text,
  client_id uuid,
  object_id uuid,
  old_value jsonb,
  new_value jsonb,
  reason text,
  financial_impact numeric,
  is_critical boolean NOT NULL DEFAULT false,
  device text,
  ip_address text,
  session_id text,
  auth_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_module_idx ON public.audit_logs (module);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  channel text NOT NULL DEFAULT 'in_app',
  threshold numeric,
  digest text NOT NULL DEFAULT 'instant',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.archived_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_label text,
  snapshot jsonb NOT NULL,
  reason text,
  archived_by uuid,
  archived_by_name text,
  restored_at timestamptz,
  restored_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.archived_records TO authenticated;
GRANT ALL ON public.archived_records TO service_role;
ALTER TABLE public.archived_records ENABLE ROW LEVEL SECURITY;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_access_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_access ua
    WHERE ua.user_id = _user_id AND ua.status = 'active' AND ua.role_key = 'owner'
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role IN ('admin','director')
  );
$$;
REVOKE ALL ON FUNCTION public.is_access_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_access_owner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_access_owner(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_access ua
    WHERE ua.user_id = _user_id AND ua.status = 'active' AND ua.role_key = 'ops_admin'
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status public.access_status;
  v_role text;
  v_expires timestamptz;
  v_override public.permission_effect;
  v_allowed boolean;
BEGIN
  SELECT status, role_key, access_expires_at INTO v_status, v_role, v_expires
  FROM public.user_access WHERE user_id = _user_id;

  IF v_status IS NULL THEN
    -- легасі-користувачі без картки доступу: спираємось на старі ролі
    RETURN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role IN ('admin','director'));
  END IF;

  IF v_status <> 'active' THEN RETURN false; END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN RETURN false; END IF;
  IF v_role = 'owner' THEN RETURN true; END IF;

  SELECT effect INTO v_override FROM public.user_permission_overrides o
  WHERE o.user_id = _user_id AND o.module = _module AND o.action = _action
    AND (o.expires_at IS NULL OR o.expires_at > now());
  IF v_override = 'deny' THEN RETURN false; END IF;
  IF v_override = 'allow' THEN RETURN true; END IF;

  SELECT allowed INTO v_allowed FROM public.role_permissions rp
  WHERE rp.role_key = v_role AND rp.module = _module AND rp.action = _action;
  RETURN COALESCE(v_allowed, false);
END;
$$;
REVOKE ALL ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, service_role;

-- ============ POLICIES ============
CREATE POLICY "roles readable by authenticated" ON public.access_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles managed by access managers" ON public.access_roles FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "roles updated by access managers" ON public.access_roles FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

CREATE POLICY "permissions readable" ON public.access_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "role permissions readable" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role permissions insert" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "role permissions update" ON public.role_permissions FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "role permissions delete" ON public.role_permissions FOR DELETE TO authenticated USING (public.can_manage_access(auth.uid()));

CREATE POLICY "user access self or managers" ON public.user_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_access(auth.uid()));
CREATE POLICY "user access insert by managers" ON public.user_access FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "user access update by managers" ON public.user_access FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

CREATE POLICY "overrides self or managers" ON public.user_permission_overrides FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_access(auth.uid()));
CREATE POLICY "overrides insert by managers" ON public.user_permission_overrides FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "overrides update by managers" ON public.user_permission_overrides FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "overrides delete by managers" ON public.user_permission_overrides FOR DELETE TO authenticated USING (public.can_manage_access(auth.uid()));

CREATE POLICY "invitations managers only" ON public.user_invitations FOR SELECT TO authenticated USING (public.can_manage_access(auth.uid()));
CREATE POLICY "invitations insert managers" ON public.user_invitations FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "invitations update managers" ON public.user_invitations FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

CREATE POLICY "requests self or managers" ON public.access_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.can_manage_access(auth.uid()));
CREATE POLICY "requests insert self" ON public.access_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.can_manage_access(auth.uid()));
CREATE POLICY "requests update managers" ON public.access_requests FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

CREATE POLICY "audit readable by managers" ON public.audit_logs FOR SELECT TO authenticated USING (public.can_manage_access(auth.uid()) OR actor_id = auth.uid());

CREATE POLICY "notification rules read" ON public.notification_rules FOR SELECT TO authenticated USING (public.can_manage_access(auth.uid()));
CREATE POLICY "notification rules insert" ON public.notification_rules FOR INSERT TO authenticated WITH CHECK (public.can_manage_access(auth.uid()));
CREATE POLICY "notification rules update" ON public.notification_rules FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

CREATE POLICY "archive read" ON public.archived_records FOR SELECT TO authenticated USING (public.can_manage_access(auth.uid()) OR archived_by = auth.uid());
CREATE POLICY "archive insert" ON public.archived_records FOR INSERT TO authenticated WITH CHECK (archived_by = auth.uid() OR public.can_manage_access(auth.uid()));
CREATE POLICY "archive update" ON public.archived_records FOR UPDATE TO authenticated USING (public.can_manage_access(auth.uid())) WITH CHECK (public.can_manage_access(auth.uid()));

-- ============ TRIGGERS ============
CREATE TRIGGER access_roles_updated BEFORE UPDATE ON public.access_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER role_permissions_updated BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER user_access_updated BEFORE UPDATE ON public.user_access FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER user_overrides_updated BEFORE UPDATE ON public.user_permission_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER user_invitations_updated BEFORE UPDATE ON public.user_invitations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER access_requests_updated BEFORE UPDATE ON public.access_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER notification_rules_updated BEFORE UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEED: PERMISSIONS ============
INSERT INTO public.access_permissions (module, action, is_critical)
SELECT m.module, a.action,
  a.action IN ('hard_delete','manage_settings','bulk_edit','export')
FROM (VALUES
  ('dashboard'),('leads'),('clients'),('objects'),('measurements'),('estimates'),
  ('proposals'),('contracts'),('production'),('calendar'),('tasks'),('materials'),
  ('warehouse'),('payments'),('expenses'),('finance'),('reports'),('staff'),
  ('settings'),('integrations'),('audit')
) AS m(module)
CROSS JOIN (VALUES
  ('view'),('create'),('edit'),('change_status'),('assign'),('approve'),
  ('archive'),('restore'),('delete_line'),('hard_delete'),('export'),
  ('bulk_edit'),('manage_settings')
) AS a(action)
ON CONFLICT (module, action) DO NOTHING;

-- ============ SEED: ROLES ============
INSERT INTO public.access_roles (key, name, description, default_scope, is_system, sort_order) VALUES
  ('owner','Власник / Генеральний директор','Повний доступ до всієї ERP без обмежень',  'company', true, 10),
  ('ops_admin','Операційний адміністратор','Максимально широкий операційний доступ без критичних дій','company', true, 20),
  ('sales_manager','Менеджер з продажу','Клієнти, ліди, кошториси, договори, оплати клієнтів','company', true, 30),
  ('surveyor','Замірник-кошторисник','Заміри, розрахунки, кошториси, КП, договори','company', true, 40),
  ('foreman','Прораб','Виробництво: перегляд усіх обʼєктів, редагування призначених','assigned', true, 50),
  ('finance','Фінансист / Фінансовий директор','Оплати, витрати, заборгованість, фінансові звіти','company', true, 60)
ON CONFLICT (key) DO NOTHING;

-- owner: усе дозволено
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'owner', p.module, p.action, true FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- ops_admin: усе, крім критичних дій
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'ops_admin', p.module, p.action,
  NOT (p.action IN ('hard_delete')
       OR (p.module IN ('settings','integrations') AND p.action IN ('manage_settings','create','edit'))
       OR (p.module = 'audit' AND p.action <> 'view')
       OR (p.module IN ('clients','finance') AND p.action = 'export'))
FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- sales_manager
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'sales_manager', p.module, p.action,
  CASE
    WHEN p.action IN ('hard_delete','manage_settings','bulk_edit') THEN false
    WHEN p.module IN ('settings','integrations','staff') THEN false
    WHEN p.module = 'audit' THEN false
    WHEN p.module IN ('leads','clients','objects','measurements','estimates','proposals','contracts','calendar','tasks','dashboard','reports','production')
      THEN p.action IN ('view','create','edit','change_status','assign','archive','restore','delete_line','export')
    WHEN p.module IN ('payments','expenses','finance','materials','warehouse')
      THEN p.action = 'view'
    ELSE false
  END
FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- surveyor
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'surveyor', p.module, p.action,
  CASE
    WHEN p.action IN ('hard_delete','manage_settings','bulk_edit') THEN false
    WHEN p.module IN ('settings','integrations','staff','audit') THEN false
    WHEN p.module IN ('clients','objects','measurements','estimates','proposals','contracts','calendar','tasks','dashboard','production','materials')
      THEN p.action IN ('view','create','edit','change_status','assign','archive','restore','delete_line','export')
    WHEN p.module IN ('leads','reports','payments','expenses','finance','warehouse')
      THEN p.action = 'view'
    ELSE false
  END
FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- foreman
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'foreman', p.module, p.action,
  CASE
    WHEN p.action IN ('hard_delete','manage_settings','bulk_edit','export') THEN false
    WHEN p.module IN ('settings','integrations','staff','audit','finance','payments') THEN false
    WHEN p.module IN ('production','objects','tasks','materials','warehouse','expenses','measurements')
      THEN p.action IN ('view','create','edit','change_status','assign','archive','delete_line')
    WHEN p.module IN ('calendar')
      THEN p.action IN ('view','create','edit','change_status')
    WHEN p.module IN ('dashboard','clients','estimates','contracts','proposals','reports')
      THEN p.action = 'view'
    ELSE false
  END
FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- finance
INSERT INTO public.role_permissions (role_key, module, action, allowed)
SELECT 'finance', p.module, p.action,
  CASE
    WHEN p.action IN ('hard_delete','manage_settings','bulk_edit') THEN false
    WHEN p.module IN ('settings','integrations','staff','audit') THEN false
    WHEN p.module IN ('payments','expenses','finance','reports')
      THEN p.action IN ('view','create','edit','change_status','approve','archive','restore','delete_line','export')
    WHEN p.module IN ('contracts','objects','clients','estimates','dashboard','proposals','production','calendar','materials','warehouse','leads','measurements','tasks')
      THEN p.action = 'view'
    ELSE false
  END
FROM public.access_permissions p
ON CONFLICT (role_key, module, action) DO NOTHING;

-- ============ SEED: NOTIFICATION RULES ============
INSERT INTO public.notification_rules (event_key, name, threshold) VALUES
  ('price_change','Суттєва зміна ціни замовлення', 5),
  ('margin_drop','Зниження валового прибутку / низька маржинальність', 15),
  ('contract_changed','Зміна підписаного договору', NULL),
  ('payment_cancelled','Скасування оплати', NULL),
  ('large_expense','Велика нова витрата', 20000),
  ('order_archived','Архівування замовлення', NULL),
  ('role_changed','Зміна ролі користувача', NULL),
  ('critical_permission','Надання критичного права', NULL),
  ('mass_export','Масовий експорт даних', NULL),
  ('new_device_login','Вхід з нового пристрою', NULL),
  ('failed_logins','Кілька невдалих спроб входу', 5)
ON CONFLICT (event_key) DO NOTHING;

-- ============ MIGRATE EXISTING USERS ============
INSERT INTO public.user_access (user_id, role_key, scope, status, position, department, last_sign_in_at)
SELECT p.user_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role IN ('admin','director')) THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'finance') THEN 'finance'
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'manager') THEN 'sales_manager'
    ELSE NULL
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id) THEN 'company'::public.access_scope
    ELSE 'own'::public.access_scope
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id) THEN 'active'::public.access_status
    WHEN EXISTS (SELECT 1 FROM public.registration_approvals a WHERE a.user_id = p.user_id AND a.status = 'approved') THEN 'active'::public.access_status
    WHEN EXISTS (SELECT 1 FROM public.registration_approvals a WHERE a.user_id = p.user_id AND a.status = 'rejected') THEN 'blocked'::public.access_status
    ELSE 'pending'::public.access_status
  END,
  p.position, p.department, NULL
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- активні без ролі -> менеджер за замовчуванням
UPDATE public.user_access SET role_key = 'sales_manager'
WHERE role_key IS NULL AND status = 'active';

-- наявні заявки на реєстрацію -> запити на доступ
INSERT INTO public.access_requests (user_id, email, display_name, kind, status, created_at, reviewed_at, reviewed_by, review_note)
SELECT a.user_id, a.email, a.display_name, 'registration',
  CASE a.status WHEN 'approved' THEN 'approved'::public.access_request_status
                WHEN 'rejected' THEN 'rejected'::public.access_request_status
                ELSE 'pending'::public.access_request_status END,
  a.requested_at, a.reviewed_at, a.reviewed_by, a.note
FROM public.registration_approvals a;