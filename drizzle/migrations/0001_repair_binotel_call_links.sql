UPDATE public.crm_leads l
SET phone_e164 = c.phone_e164
FROM public.crm_contacts c
WHERE l.contact_id = c.id
  AND l.phone_e164 IS NULL
  AND c.phone_e164 IS NOT NULL;

UPDATE public.crm_leads l
SET phone_e164 = cl.phone_e164
FROM public.clients cl
WHERE l.client_id = cl.id
  AND l.phone_e164 IS NULL
  AND cl.phone_e164 IS NOT NULL;

UPDATE public.crm_calls c
SET lead_id = (
  SELECT l.id
  FROM public.crm_leads l
  WHERE l.phone_e164 = c.phone_e164
  ORDER BY (l.status = 'open') DESC, l.created_at DESC
  LIMIT 1
)
WHERE c.external_source = 'binotel'
  AND c.lead_id IS NULL
  AND c.phone_e164 IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.phone_e164 = c.phone_e164);

UPDATE public.crm_calls c
SET client_id = COALESCE(l.client_id, ct.client_id)
FROM public.crm_leads l
LEFT JOIN public.crm_contacts ct ON ct.id = l.contact_id
WHERE c.lead_id = l.id
  AND c.client_id IS NULL
  AND COALESCE(l.client_id, ct.client_id) IS NOT NULL;

UPDATE public.crm_calls c
SET order_id = l.order_id
FROM public.crm_leads l
WHERE c.lead_id = l.id
  AND c.order_id IS NULL
  AND l.order_id IS NOT NULL;

UPDATE public.crm_calls c
SET order_id = (
  SELECT o.id
  FROM public.orders o
  WHERE o.client_id = c.client_id
  ORDER BY o.created_at DESC
  LIMIT 1
)
WHERE c.external_source = 'binotel'
  AND c.order_id IS NULL
  AND c.client_id IS NOT NULL
  AND (SELECT count(*) FROM public.orders o2 WHERE o2.client_id = c.client_id) = 1;

UPDATE public.crm_calls c
SET measurement_id = (
  SELECT m.id
  FROM public.order_measurements m
  WHERE (c.order_id IS NOT NULL AND m.order_id = c.order_id)
     OR (c.lead_id IS NOT NULL AND m.lead_id = c.lead_id)
     OR (c.client_id IS NOT NULL AND m.client_id = c.client_id)
  ORDER BY m.created_at DESC
  LIMIT 1
)
WHERE c.external_source = 'binotel'
  AND c.measurement_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.order_measurements m
    WHERE (c.order_id IS NOT NULL AND m.order_id = c.order_id)
       OR (c.lead_id IS NOT NULL AND m.lead_id = c.lead_id)
       OR (c.client_id IS NOT NULL AND m.client_id = c.client_id)
  );

UPDATE public.crm_calls
SET recording_available = true
WHERE external_source = 'binotel'
  AND COALESCE(payload->>'recordingStatus', '') IN ('uploaded', 'ready', 'available');