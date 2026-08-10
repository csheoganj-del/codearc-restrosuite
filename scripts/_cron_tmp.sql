CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'restrosuite-billing-reminders';
SELECT cron.schedule(
  'restrosuite-billing-reminders',
  '15 * * * *',
  \$\$
  SELECT net.http_post(
    url := 'https://htkauiibuejetimfiavs.supabase.co/functions/v1/billing-reminders',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer de7c415d14ce4a7964b9446a80936b21853e98a8b62b2b96'),
    body := '{}'::jsonb
  ) AS request_id;
  \$\$
);
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'restrosuite-billing-reminders';
