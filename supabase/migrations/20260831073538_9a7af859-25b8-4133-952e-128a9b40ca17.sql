-- Restrict cost columns on stock tables to finance/admin only (column-level privileges)
REVOKE SELECT ON public.stock_items FROM authenticated, anon;
REVOKE SELECT ON public.stock_documents FROM authenticated, anon;
REVOKE SELECT ON public.stock_document_lines FROM authenticated, anon;

GRANT SELECT (id,name,sku,unit,category,module,catalog_item_id,min_qty,archived,created_at,updated_at)
  ON public.stock_items TO authenticated;
GRANT SELECT (id,number,doc_type,status,doc_date,warehouse_id,target_warehouse_id,order_id,supplier,note,created_by,posted_at,posted_by,created_at,updated_at)
  ON public.stock_documents TO authenticated;
GRANT SELECT (id,document_id,item_id,qty,note,created_at)
  ON public.stock_document_lines TO authenticated;

-- Finance-only cost projections (owner-executed views, guarded by private.is_finance())
CREATE OR REPLACE VIEW public.stock_item_costs AS
  SELECT id, avg_cost FROM public.stock_items WHERE private.is_finance();
CREATE OR REPLACE VIEW public.stock_document_costs AS
  SELECT id, total_cost FROM public.stock_documents WHERE private.is_finance();
CREATE OR REPLACE VIEW public.stock_document_line_costs AS
  SELECT id, document_id, price FROM public.stock_document_lines WHERE private.is_finance();

GRANT SELECT ON public.stock_item_costs, public.stock_document_costs, public.stock_document_line_costs TO authenticated;
GRANT ALL ON public.stock_items, public.stock_documents, public.stock_document_lines TO service_role;