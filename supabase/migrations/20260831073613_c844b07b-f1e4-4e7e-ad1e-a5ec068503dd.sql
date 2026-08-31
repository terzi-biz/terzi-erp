DROP VIEW IF EXISTS public.stock_item_costs;
DROP VIEW IF EXISTS public.stock_document_costs;
DROP VIEW IF EXISTS public.stock_document_line_costs;

CREATE OR REPLACE FUNCTION public.stock_costs()
RETURNS TABLE (kind text, id uuid, parent_id uuid, cost numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'item'::text, i.id, NULL::uuid, i.avg_cost FROM public.stock_items i WHERE private.is_finance()
  UNION ALL
  SELECT 'document'::text, d.id, NULL::uuid, d.total_cost FROM public.stock_documents d WHERE private.is_finance()
  UNION ALL
  SELECT 'line'::text, l.id, l.document_id, l.price FROM public.stock_document_lines l WHERE private.is_finance();
$$;

REVOKE ALL ON FUNCTION public.stock_costs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_costs() TO authenticated;