-- Keep lyric-transcribe edge function warm to reduce cold start latency
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('keep-alive-lyric-transcribe')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'keep-alive-lyric-transcribe'
);

SELECT cron.schedule(
  'keep-alive-lyric-transcribe',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xvgoogyagdbgphympzkg.supabase.co/functions/v1/lyric-transcribe',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key', true),
      'Content-Type', 'application/json',
      'x-keep-alive', 'true'
    ),
    body := '{"keepAlive":true}'::jsonb
  );
  $$
);
