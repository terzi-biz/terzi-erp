CREATE OR REPLACE FUNCTION public.orders_breakdown_list(p_from date, p_to date, p_kind text, p_label text)
RETURNS TABLE(id uuid, number text, name text, ordered_on date, amount_total numeric, paid_total numeric, commercial_status text, source text, manager text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT o.id, o.number, o.name, COALESCE(o.ordered_at, o.created_at)::date, o.amount_total, o.paid_total,
         o.commercial_status::text, o.source, COALESCE(pr.display_name, pr.email, 'Без менеджера')
  FROM public.orders o
  LEFT JOIN public.profiles pr ON pr.id = o.manager_id
  WHERE COALESCE(o.ordered_at, o.created_at) >= p_from
    AND COALESCE(o.ordered_at, o.created_at) < (p_to + 1)
    AND o.commercial_status <> 'refused'
    AND (
      (p_kind = 'source' AND public.normalize_marketing_source(o.source) = p_label)
      OR (p_kind = 'manager' AND COALESCE(pr.display_name, pr.email, 'Без менеджера') = p_label)
      OR p_kind = 'all'
    )
  ORDER BY o.amount_total DESC NULLS LAST
  LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.orders_breakdown_list(date, date, text, text) TO authenticated;