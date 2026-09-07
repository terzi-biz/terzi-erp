-- Тригерні функції не мають бути викликані через Data API
REVOKE ALL ON FUNCTION public.sync_invoice_paid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_stock_reserved() FROM PUBLIC, anon, authenticated;

-- Складські операції та фінансова перевірка — лише для автентифікованих
REVOKE ALL ON FUNCTION public.post_stock_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_stock_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_stock_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_finance_user(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_stock_document(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_document(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_stock_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_finance_user(uuid) TO authenticated, service_role;