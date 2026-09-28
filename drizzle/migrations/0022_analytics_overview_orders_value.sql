CREATE OR REPLACE FUNCTION public.analytics_overview(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH b AS (SELECT p_from::timestamptz AS ts_from, (p_to + 1)::timestamptz AS ts_to),
l AS (
  SELECT cl.*, public.normalize_marketing_source(COALESCE(NULLIF(cl.source, ''), cl.utm->>'utm_source')) AS src
  FROM public.crm_leads cl, b WHERE cl.created_at >= b.ts_from AND cl.created_at < b.ts_to
),
o AS (
  SELECT ord.*, public.normalize_marketing_source(ord.source) AS src
  FROM public.orders ord, b WHERE ord.created_at >= b.ts_from AND ord.created_at < b.ts_to
),
ctr AS (SELECT * FROM o WHERE commercial_status IN ('contract', 'awaiting_prepayment', 'sold')),
act AS (SELECT * FROM o WHERE commercial_status <> 'refused'),
est AS (SELECT e.* FROM public.estimates e, b WHERE e.created_at >= b.ts_from AND e.created_at < b.ts_to),
ms AS (SELECT m.* FROM public.order_measurements m, b WHERE m.created_at >= b.ts_from AND m.created_at < b.ts_to),
pay AS (SELECT p.* FROM public.payments p WHERE p.paid_at >= p_from AND p.paid_at < (p_to + 1)),
ex AS (SELECT e.* FROM public.expenses e WHERE e.spent_at >= p_from AND e.spent_at < (p_to + 1)),
ads AS (
  SELECT d.*, public.normalize_marketing_source(COALESCE(ch.name, ch.key)) AS src
  FROM public.marketing_daily_metrics d
  LEFT JOIN public.marketing_channels ch ON ch.id = d.channel_id
  WHERE d.date BETWEEN p_from AND p_to
),
man AS (SELECT s.*, public.normalize_marketing_source(s.source) AS src FROM public.marketing_manual_spend s WHERE s.spend_date BETWEEN p_from AND p_to),
cal AS (SELECT c.* FROM public.crm_calls c, b WHERE c.started_at >= b.ts_from AND c.started_at < b.ts_to),
s_ads AS (SELECT src, sum(spend) spend, sum(impressions) impressions, sum(reach) reach, sum(clicks) clicks FROM ads GROUP BY src),
s_man AS (SELECT src, sum(amount) spend FROM man GROUP BY src),
s_lead AS (SELECT src, count(*) leads, count(*) FILTER (WHERE lead_quality = 'цільовий') qualified FROM l GROUP BY src),
s_ord AS (
  SELECT src, count(*) orders_cnt,
         count(*) FILTER (WHERE commercial_status IN ('contract','awaiting_prepayment','sold')) contracts,
         COALESCE(sum(amount_total) FILTER (WHERE commercial_status IN ('contract','awaiting_prepayment','sold')), 0) contract_value,
         COALESCE(sum(amount_total) FILTER (WHERE commercial_status <> 'refused'), 0) orders_value
  FROM o GROUP BY src
),
s_keys AS (SELECT src FROM s_ads UNION SELECT src FROM s_man UNION SELECT src FROM s_lead UNION SELECT src FROM s_ord),
sources AS (
  SELECT jsonb_agg(x ORDER BY x->>'source') v FROM (
    SELECT jsonb_build_object(
      'source', k.src,
      'spend', COALESCE(a.spend, 0) + COALESCE(m.spend, 0),
      'impressions', COALESCE(a.impressions, 0),
      'reach', COALESCE(a.reach, 0),
      'clicks', COALESCE(a.clicks, 0),
      'leads', COALESCE(le.leads, 0),
      'qualified', COALESCE(le.qualified, 0),
      'orders', COALESCE(od.orders_cnt, 0),
      'contracts', COALESCE(od.contracts, 0),
      'contract_value', COALESCE(od.contract_value, 0),
      'orders_value', COALESCE(od.orders_value, 0)
    ) x
    FROM s_keys k
    LEFT JOIN s_ads a ON a.src = k.src
    LEFT JOIN s_man m ON m.src = k.src
    LEFT JOIN s_lead le ON le.src = k.src
    LEFT JOIN s_ord od ON od.src = k.src
  ) t
),
m_keys AS (
  SELECT assigned_to AS uid FROM l WHERE assigned_to IS NOT NULL
  UNION SELECT manager_id FROM o WHERE manager_id IS NOT NULL
),
managers AS (
  SELECT jsonb_agg(jsonb_build_object(
    'user_id', k.uid,
    'name', COALESCE(pr.display_name, pr.email, '—'),
    'leads', (SELECT count(*) FROM l WHERE l.assigned_to = k.uid),
    'qualified', (SELECT count(*) FROM l WHERE l.assigned_to = k.uid AND l.lead_quality = 'цільовий'),
    'orders', (SELECT count(*) FROM o WHERE o.manager_id = k.uid),
    'contracts', (SELECT count(*) FROM ctr WHERE ctr.manager_id = k.uid),
    'contract_value', (SELECT COALESCE(sum(amount_total), 0) FROM ctr WHERE ctr.manager_id = k.uid),
    'orders_value', (SELECT COALESCE(sum(amount_total), 0) FROM act WHERE act.manager_id = k.uid)
  )) v FROM m_keys k LEFT JOIN public.profiles pr ON pr.user_id = k.uid
),
surveyors AS (
  SELECT jsonb_agg(jsonb_build_object(
    'user_id', s.surveyor_id,
    'name', COALESCE(pr.display_name, pr.email, '—'),
    'assigned', s.assigned,
    'completed', s.completed,
    'cancelled', s.cancelled
  )) v FROM (
    SELECT surveyor_id, count(*) assigned,
           count(*) FILTER (WHERE status IN ('done','completed')) completed,
           count(*) FILTER (WHERE status IN ('cancelled','canceled')) cancelled
    FROM ms GROUP BY surveyor_id
  ) s LEFT JOIN public.profiles pr ON pr.user_id = s.surveyor_id
)
SELECT jsonb_build_object(
  'period', jsonb_build_object('from', p_from, 'to', p_to),
  'kpi', jsonb_build_object(
    'marketing_spend', CASE WHEN (SELECT count(*) FROM ads) + (SELECT count(*) FROM man) = 0 THEN NULL
      ELSE (SELECT COALESCE(sum(spend), 0) FROM ads) + (SELECT COALESCE(sum(amount), 0) FROM man) END,
    'impressions', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(impressions), 0) END FROM ads),
    'reach', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(reach), 0) END FROM ads),
    'clicks', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(clicks), 0) END FROM ads),
    'leads', (SELECT count(*) FROM l),
    'qualified', (SELECT count(*) FROM l WHERE lead_quality = 'цільовий'),
    'measurements_scheduled', (SELECT count(*) FROM ms),
    'measurements_completed', (SELECT count(*) FROM ms WHERE status IN ('done','completed')),
    'estimates', (SELECT count(*) FROM est),
    'contracts', (SELECT count(*) FROM ctr),
    'contract_value', (SELECT COALESCE(sum(amount_total), 0) FROM ctr),
    'orders', (SELECT count(*) FROM o),
    'orders_active', (SELECT count(*) FROM act),
    'orders_value', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(amount_total), 0) END FROM act),
    'payments', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) END FROM pay),
    'expenses', (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE COALESCE(sum(amount), 0) END FROM ex),
    'gross_profit', CASE WHEN (SELECT count(*) FROM pay) = 0 THEN NULL
      ELSE (SELECT COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) FROM pay) - (SELECT COALESCE(sum(amount), 0) FROM ex) END
  ),
  'sources', COALESCE((SELECT v FROM sources), '[]'::jsonb),
  'managers', COALESCE((SELECT v FROM managers), '[]'::jsonb),
  'surveyors', COALESCE((SELECT v FROM surveyors), '[]'::jsonb),
  'telephony', jsonb_build_object(
    'total', (SELECT count(*) FROM cal),
    'inbound', (SELECT count(*) FROM cal WHERE direction = 'inbound'),
    'outbound', (SELECT count(*) FROM cal WHERE direction = 'outbound'),
    'missed', (SELECT count(*) FROM cal WHERE is_missed IS TRUE),
    'answered', (SELECT count(*) FROM cal WHERE is_missed IS NOT TRUE),
    'unique_numbers', (SELECT count(DISTINCT COALESCE(phone_e164, phone_norm)) FROM cal),
    'avg_duration', (SELECT COALESCE(round(avg(NULLIF(duration_sec, 0))), 0) FROM cal),
    'missed_unique', (SELECT count(DISTINCT phone_norm) FROM cal WHERE is_missed IS TRUE),
    'missed_called_back', (SELECT count(DISTINCT m.phone_norm) FROM cal m WHERE m.is_missed IS TRUE AND EXISTS (
        SELECT 1 FROM cal c2 WHERE c2.direction = 'outbound' AND c2.phone_norm = m.phone_norm AND c2.started_at > m.started_at))
  ),
  'data_quality', jsonb_build_object(
    'leads_no_source', (SELECT count(*) FROM l WHERE COALESCE(NULLIF(source, ''), utm->>'utm_source') IS NULL),
    'leads_no_manager', (SELECT count(*) FROM l WHERE assigned_to IS NULL),
    'calls_unlinked', (SELECT count(*) FROM cal WHERE lead_id IS NULL AND client_id IS NULL),
    'measurements_no_surveyor', (SELECT count(*) FROM ms WHERE surveyor_id IS NULL),
    'estimates_no_order', (SELECT count(*) FROM est WHERE order_id IS NULL),
    'orders_no_source', (SELECT count(*) FROM o WHERE source IS NULL OR btrim(source) = ''),
    'orders_no_amount', (SELECT count(*) FROM o WHERE COALESCE(amount_total, 0) = 0),
    'payments_no_order', (SELECT count(*) FROM pay WHERE order_id IS NULL)
  )
);
$function$;