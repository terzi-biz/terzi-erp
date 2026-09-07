CREATE OR REPLACE FUNCTION public.log_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.commercial_status IS DISTINCT FROM OLD.commercial_status THEN
    INSERT INTO public.entity_status_history (entity_type, entity_id, field, old_status, new_status, changed_by)
    VALUES ('order', NEW.id, 'commercial_status',
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.commercial_status::text END,
      NEW.commercial_status::text, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.production_status IS DISTINCT FROM OLD.production_status THEN
    INSERT INTO public.entity_status_history (entity_type, entity_id, field, old_status, new_status, changed_by)
    VALUES ('order', NEW.id, 'production_status',
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.production_status::text END,
      NEW.production_status::text, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.financial_status IS DISTINCT FROM OLD.financial_status THEN
    INSERT INTO public.entity_status_history (entity_type, entity_id, field, old_status, new_status, changed_by)
    VALUES ('order', NEW.id, 'financial_status',
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.financial_status::text END,
      NEW.financial_status::text, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.log_order_status_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_entity_status_history ON public.orders;
CREATE TRIGGER trg_orders_entity_status_history
AFTER INSERT OR UPDATE OF commercial_status, production_status, financial_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_status_history();

CREATE OR REPLACE FUNCTION public.crm_kpi(p_from timestamp with time zone, p_to timestamp with time zone)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'leads', (
      SELECT jsonb_build_object(
        'total', count(*),
        'open', count(*) FILTER (WHERE status::text = 'open'),
        'qualified', count(*) FILTER (WHERE lead_quality = 'qualified' OR status::text = 'won'),
        'won', count(*) FILTER (WHERE status::text = 'won'),
        'lost', count(*) FILTER (WHERE status::text = 'lost'),
        'postponed', count(*) FILTER (WHERE status::text = 'postponed'),
        'conversion', CASE WHEN count(*) FILTER (WHERE status::text IN ('won','lost')) > 0
          THEN ROUND(count(*) FILTER (WHERE status::text = 'won')::numeric * 100
               / count(*) FILTER (WHERE status::text IN ('won','lost')), 2) ELSE 0 END,
        'pipeline_value', COALESCE(sum(budget) FILTER (WHERE status::text = 'open'), 0),
        'won_value', COALESCE(sum(budget) FILTER (WHERE status::text = 'won'), 0),
        'with_contact', count(*) FILTER (WHERE contact_id IS NOT NULL),
        'with_client', count(*) FILTER (WHERE client_id IS NOT NULL),
        'with_order', count(*) FILTER (WHERE order_id IS NOT NULL)
      ) FROM crm_leads WHERE created_at >= p_from AND created_at < p_to
    ),
    'calls', (
      SELECT jsonb_build_object(
        'total', count(*),
        'inbound', count(*) FILTER (WHERE direction::text = 'inbound'),
        'outbound', count(*) FILTER (WHERE direction::text = 'outbound'),
        'missed', count(*) FILTER (WHERE COALESCE(duration_sec,0) = 0 OR COALESCE(status,'') IN ('missed','no_answer','noanswer')),
        'answered', count(*) FILTER (WHERE COALESCE(duration_sec,0) > 0 AND COALESCE(status,'') NOT IN ('missed','no_answer','noanswer')),
        'duration_sec', COALESCE(sum(duration_sec), 0)
      ) FROM crm_calls WHERE started_at >= p_from AND started_at < p_to
    ),
    'tasks', (
      SELECT jsonb_build_object(
        'open', count(*) FILTER (WHERE status::text = 'open'),
        'overdue', count(*) FILTER (WHERE status::text = 'open' AND due_at IS NOT NULL AND due_at < now()),
        'today', count(*) FILTER (WHERE status::text = 'open' AND due_at IS NOT NULL
          AND due_at >= (date_trunc('day', (now() AT TIME ZONE 'Europe/Kyiv')) AT TIME ZONE 'Europe/Kyiv')
          AND due_at <  ((date_trunc('day', (now() AT TIME ZONE 'Europe/Kyiv')) + interval '1 day') AT TIME ZONE 'Europe/Kyiv'))
      ) FROM crm_tasks
    ),
    'measurements', (
      SELECT jsonb_build_object(
        'scheduled', count(*) FILTER (WHERE status::text IN ('planned','assigned','confirmed','in_progress','draft')),
        'completed', count(*) FILTER (WHERE status::text IN ('completed','done')),
        'cancelled', count(*) FILTER (WHERE status::text IN ('canceled','cancelled')),
        'rescheduled', count(*) FILTER (WHERE status::text = 'rescheduled')
      ) FROM order_measurements
      WHERE COALESCE(scheduled_at, measured_at, created_at) >= p_from
        AND COALESCE(scheduled_at, measured_at, created_at) < p_to
    )
  );
$$;