-- Крок 1c: прибрати перехідний заголовок apikey з команд трьох cron-задач.
-- Розклад, імена jobs та дані не змінюються; авторизація лише через x-terzi-worker-secret.

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'marketing-crm-sync-hourly'),
  command := $cmd$
select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/marketing/sync', headers := jsonb_build_object('Content-Type','application/json','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);
$cmd$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'integrations-worker-10min'),
  command := $cmd$
select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/integrations/worker', headers := jsonb_build_object('Content-Type','application/json','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);
$cmd$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'finmap-incremental-sync'),
  command := $cmd$
select net.http_post(url := 'https://project--66607c05-a230-4d05-9f46-cf1edb45a91e.lovable.app/api/public/integrations/finmap/cron', headers := jsonb_build_object('Content-Type','application/json','x-terzi-worker-secret',(select secret from private.cron_worker_secret where id = 1)), body := '{}'::jsonb, timeout_milliseconds := 55000);
$cmd$
);
