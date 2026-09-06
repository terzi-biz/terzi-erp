REVOKE ALL ON FUNCTION public.log_entity_status_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_kpi(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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
                                   AND due_at >= date_trunc('day', now()) AND due_at < date_trunc('day', now()) + interval '1 day')
      ) FROM crm_tasks
    ),
    'measurements', (
      SELECT jsonb_build_object(
        'scheduled', count(*) FILTER (WHERE status::text IN ('planned','assigned','confirmed','in_progress','draft')),
        'completed', count(*) FILTER (WHERE status::text IN ('completed','done')),
        'cancelled', count(*) FILTER (WHERE status::text IN ('canceled','cancelled','rescheduled'))
      ) FROM order_measurements
      WHERE COALESCE(scheduled_at, measured_at, created_at) >= p_from
        AND COALESCE(scheduled_at, measured_at, created_at) < p_to
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.crm_kpi(timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_kpi(timestamptz, timestamptz) FROM anon;