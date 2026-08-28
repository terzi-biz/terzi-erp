ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS manager_id uuid,
  ADD COLUMN IF NOT EXISTS crm_link text;

CREATE INDEX IF NOT EXISTS clients_phone_idx ON public.clients (phone);
CREATE INDEX IF NOT EXISTS clients_email_idx ON public.clients (email);
CREATE INDEX IF NOT EXISTS clients_manager_idx ON public.clients (manager_id);