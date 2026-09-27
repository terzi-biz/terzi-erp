CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.cron_worker_secret (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.cron_worker_secret ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.cron_worker_secret FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.cron_worker_secret (id, secret)
VALUES (1, encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_cron_worker_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RETURN false;
  END IF;
  SELECT secret INTO v_secret FROM private.cron_worker_secret WHERE id = 1;
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RETURN false;
  END IF;
  RETURN extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256')
       = extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_worker_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_worker_secret(text) TO service_role;

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'marketing-crm-sync-hourly'),
  command := $cmd$select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/marketing/sync', headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_5-SaCtkadoQNVRxHnLsUeg_q5zlDd7y','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);$cmd$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'integrations-worker-10min'),
  command := $cmd$select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/integrations/worker', headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_5-SaCtkadoQNVRxHnLsUeg_q5zlDd7y','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);$cmd$
);

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'finmap-incremental-sync'),
  command := $cmd$select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/integrations/finmap/cron', headers := jsonb_build_object('Content-Type','application/json','apikey','sb_publishable_5-SaCtkadoQNVRxHnLsUeg_q5zlDd7y','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);$cmd$
);