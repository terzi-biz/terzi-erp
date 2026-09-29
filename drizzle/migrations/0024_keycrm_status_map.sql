CREATE TABLE public.keycrm_status_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_status text NOT NULL UNIQUE,
  commercial_status public.object_commercial_status NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keycrm_status_map TO authenticated;
GRANT ALL ON public.keycrm_status_map TO service_role;
ALTER TABLE public.keycrm_status_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read keycrm status map" ON public.keycrm_status_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage keycrm status map" ON public.keycrm_status_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'director'));

CREATE OR REPLACE FUNCTION public.normalize_marketing_source(_raw text)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT m.normalized FROM public.marketing_source_map m
      WHERE lower(m.raw_source) = lower(btrim(COALESCE(_raw, '')))),
    CASE
      WHEN _raw IS NULL OR btrim(_raw) = '' THEN 'Не визначено'
      WHEN _raw ILIKE '%сарафан%' OR _raw ILIKE '%реком%' OR _raw ILIKE '%referral%' OR _raw ILIKE '%знайом%' OR _raw ILIKE '%прораб%' THEN 'Referral'
      WHEN _raw ILIKE '%google%' THEN 'Google Ads'
      WHEN _raw ILIKE '%facebook%' OR _raw ILIKE '%meta%' OR _raw ILIKE '%instagram%' OR _raw ILIKE '%fb%' THEN 'Meta Ads'
      WHEN _raw ILIKE '%olx%' THEN 'OLX'
      WHEN _raw ILIKE '%telegram%' THEN 'Telegram'
      WHEN _raw ILIKE '%viber%' THEN 'Viber'
      WHEN _raw ILIKE '%seo%' OR _raw ILIKE '%сайт%' OR _raw ILIKE '%site%' OR _raw ILIKE '%organic%' THEN 'SEO'
      WHEN _raw ILIKE '%партнер%' OR _raw ILIKE '%partner%' THEN 'Partners'
      WHEN _raw ILIKE '%повтор%' OR _raw ILIKE '%repeat%' THEN 'Repeat'
      WHEN _raw ILIKE '%direct%' OR _raw ILIKE '%прям%' OR _raw ILIKE '%coll back%' OR _raw ILIKE '%дзвін%' THEN 'Direct'
      WHEN _raw ILIKE '%outdoor%' OR _raw ILIKE '%зовніш%' THEN 'Outdoor'
      ELSE 'Other'
    END);
$function$;