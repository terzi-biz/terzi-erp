DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'terzi-integrations-worker') THEN
    PERFORM cron.unschedule('terzi-integrations-worker');
  END IF;
END
$$;