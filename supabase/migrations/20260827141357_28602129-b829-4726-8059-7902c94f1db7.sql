-- Narrow stock manager definition: previously included the broadly-assigned 'manager' app_role
CREATE OR REPLACE FUNCTION private.is_stock_manager()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_any_role(ARRAY['admin','director']::public.app_role[])
    OR EXISTS (
      SELECT 1 FROM public.user_access ua
      WHERE ua.user_id = auth.uid()
        AND ua.status = 'active'
        AND ua.role_key IN ('owner','ops_admin')
    )
  );
$function$;

-- Narrow finance definition: 'manager' is auto-granted to everyone, keep finance strict
CREATE OR REPLACE FUNCTION private.is_finance()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    private.has_any_role(ARRAY['admin','director','finance']::public.app_role[])
    OR EXISTS (
      SELECT 1 FROM public.user_access ua
      WHERE ua.user_id = auth.uid()
        AND ua.status = 'active'
        AND ua.role_key IN ('owner','finance')
    )
  );
$function$;

-- invoice_lines: require finance authorization, not mere object visibility
DROP POLICY IF EXISTS "invoice lines read" ON public.invoice_lines;
CREATE POLICY "invoice lines read" ON public.invoice_lines
FOR SELECT TO authenticated
USING (
  private.is_finance()
  AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id)
);
