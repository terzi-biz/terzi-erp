-- 1. Rename tables
ALTER TABLE public.objects RENAME TO orders;
ALTER TABLE public.object_zones RENAME TO order_zones;
ALTER TABLE public.object_measurements RENAME TO order_measurements;
ALTER TABLE public.object_assignments RENAME TO order_assignments;
ALTER TABLE public.object_comments RENAME TO order_comments;
ALTER TABLE public.object_files RENAME TO order_files;
ALTER TABLE public.object_services RENAME TO order_services;
ALTER TABLE public.object_status_history RENAME TO order_status_history;

-- 2. Rename columns
ALTER TABLE public.order_zones RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_measurements RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_assignments RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_comments RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_files RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_services RENAME COLUMN object_id TO order_id;
ALTER TABLE public.order_status_history RENAME COLUMN object_id TO order_id;
ALTER TABLE public.estimates RENAME COLUMN object_id TO order_id;
ALTER TABLE public.calendar_events RENAME COLUMN object_id TO order_id;
ALTER TABLE public.crew_bookings RENAME COLUMN object_id TO order_id;
ALTER TABLE public.crm_leads RENAME COLUMN object_id TO order_id;
ALTER TABLE public.crm_tasks RENAME COLUMN object_id TO order_id;
ALTER TABLE public.audit_logs RENAME COLUMN object_id TO order_id;
ALTER TABLE public.orders RENAME COLUMN object_type TO order_type;

-- 3. Sequence
ALTER SEQUENCE public.object_number_seq RENAME TO order_number_seq;

-- 4. Rebuild functions with new names inside
CREATE OR REPLACE FUNCTION private.can_view_object(_object_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _object_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _object_id AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.order_assignments a WHERE a.order_id = _object_id AND a.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','director'))
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_manage_object(_object_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT _object_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _object_id AND (o.owner_id = auth.uid() OR o.manager_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','director'))
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_object_number()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE n bigint;
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    n := nextval('public.order_number_seq');
    NEW.number := 'TRZ-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_object_status_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.commercial_status IS DISTINCT FROM OLD.commercial_status THEN
    INSERT INTO public.order_status_history(order_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'commercial_status', OLD.commercial_status::text, NEW.commercial_status::text, auth.uid());
  END IF;
  IF NEW.production_status IS DISTINCT FROM OLD.production_status THEN
    INSERT INTO public.order_status_history(order_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'production_status', OLD.production_status::text, NEW.production_status::text, auth.uid());
  END IF;
  IF NEW.financial_status IS DISTINCT FROM OLD.financial_status THEN
    INSERT INTO public.order_status_history(order_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'financial_status', OLD.financial_status::text, NEW.financial_status::text, auth.uid());
  END IF;
  IF NEW.risk_level IS DISTINCT FROM OLD.risk_level THEN
    INSERT INTO public.order_status_history(order_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'risk_level', OLD.risk_level::text, NEW.risk_level::text, auth.uid());
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.sync_object_manager_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  DELETE FROM public.order_assignments oa
   WHERE oa.order_id = NEW.id AND oa.role = 'manager'
     AND (NEW.manager_id IS NULL OR oa.user_id IS DISTINCT FROM NEW.manager_id);

  IF NEW.manager_id IS NOT NULL THEN
    INSERT INTO public.order_assignments (order_id, role, user_id)
    SELECT NEW.id, 'manager', NEW.manager_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.order_assignments oa
       WHERE oa.order_id = NEW.id AND oa.role = 'manager' AND oa.user_id = NEW.manager_id
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Access module key rename (permissions data follows the module rename)
UPDATE public.access_permissions SET module = 'orders' WHERE module = 'objects';
UPDATE public.role_permissions SET module = 'orders' WHERE module = 'objects';
UPDATE public.user_permission_overrides SET module = 'orders' WHERE module = 'objects';