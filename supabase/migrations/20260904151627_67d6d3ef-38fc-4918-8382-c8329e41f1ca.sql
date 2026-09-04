CREATE OR REPLACE FUNCTION public.terzi_e164(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE d text;
BEGIN
  d := NULLIF(regexp_replace(COALESCE(raw, ''), '\D', '', 'g'), '');
  IF d IS NULL THEN RETURN NULL; END IF;
  IF length(d) = 12 AND left(d, 3) = '380' THEN RETURN '+' || d; END IF;
  IF length(d) = 11 AND left(d, 2) = '80' THEN RETURN '+3' || d; END IF;
  IF length(d) = 10 AND left(d, 1) = '0' THEN RETURN '+38' || d; END IF;
  IF length(d) = 9 THEN RETURN '+380' || d; END IF;
  IF length(d) < 9 THEN RETURN NULL; END IF;
  RETURN '+' || d;
END;
$$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone_e164 text;

CREATE OR REPLACE FUNCTION public.terzi_set_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'crm_calls' THEN
    NEW.phone_e164 := public.terzi_e164(
      COALESCE(NEW.phone_norm,
        CASE WHEN NEW.direction = 'inbound' THEN NEW.from_number ELSE NEW.to_number END));
  ELSIF TG_TABLE_NAME = 'crm_contacts' THEN
    NEW.phone_e164 := public.terzi_e164(COALESCE(NEW.phone, NEW.phone_norm));
  ELSIF TG_TABLE_NAME = 'clients' THEN
    NEW.phone_e164 := public.terzi_e164(NEW.phone);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_phone_e164 ON public.crm_calls;
CREATE TRIGGER trg_calls_phone_e164 BEFORE INSERT OR UPDATE ON public.crm_calls
FOR EACH ROW EXECUTE FUNCTION public.terzi_set_phone_e164();

DROP TRIGGER IF EXISTS trg_contacts_phone_e164 ON public.crm_contacts;
CREATE TRIGGER trg_contacts_phone_e164 BEFORE INSERT OR UPDATE ON public.crm_contacts
FOR EACH ROW EXECUTE FUNCTION public.terzi_set_phone_e164();

DROP TRIGGER IF EXISTS trg_clients_phone_e164 ON public.clients;
CREATE TRIGGER trg_clients_phone_e164 BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.terzi_set_phone_e164();

UPDATE public.crm_calls
SET phone_e164 = public.terzi_e164(
  COALESCE(phone_norm, CASE WHEN direction = 'inbound' THEN from_number ELSE to_number END))
WHERE phone_e164 IS NULL;

UPDATE public.crm_contacts
SET phone_e164 = public.terzi_e164(COALESCE(phone, phone_norm))
WHERE phone_e164 IS NULL;

UPDATE public.clients
SET phone_e164 = public.terzi_e164(phone)
WHERE phone_e164 IS NULL AND phone IS NOT NULL;

UPDATE public.crm_leads l
SET phone_e164 = c.phone_e164
FROM public.crm_contacts c
WHERE l.contact_id = c.id AND l.phone_e164 IS NULL AND c.phone_e164 IS NOT NULL;

UPDATE public.crm_leads l
SET phone_e164 = cl.phone_e164
FROM public.clients cl
WHERE l.client_id = cl.id AND l.phone_e164 IS NULL AND cl.phone_e164 IS NOT NULL;

UPDATE public.crm_calls k
SET client_id = cl.id
FROM public.clients cl
WHERE k.client_id IS NULL AND k.phone_e164 IS NOT NULL AND cl.phone_e164 = k.phone_e164;

UPDATE public.crm_calls k
SET contact_id = c.id
FROM public.crm_contacts c
WHERE k.contact_id IS NULL AND k.phone_e164 IS NOT NULL AND c.phone_e164 = k.phone_e164;

UPDATE public.crm_calls k
SET lead_id = l.id
FROM public.crm_leads l
WHERE k.lead_id IS NULL AND k.phone_e164 IS NOT NULL AND l.phone_e164 = k.phone_e164;

CREATE INDEX IF NOT EXISTS idx_crm_calls_phone_e164 ON public.crm_calls (phone_e164);
CREATE INDEX IF NOT EXISTS idx_crm_calls_client ON public.crm_calls (client_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone_e164 ON public.crm_leads (phone_e164);
CREATE INDEX IF NOT EXISTS idx_clients_phone_e164 ON public.clients (phone_e164);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_phone_e164 ON public.crm_contacts (phone_e164);