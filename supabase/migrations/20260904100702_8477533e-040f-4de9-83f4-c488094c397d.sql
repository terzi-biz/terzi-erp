GRANT SELECT (family_key, variant_label, verification_status, origin_external_key, source_ref) ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;