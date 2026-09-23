-- Scheduled jobs run by Supabase (pg_cron + pg_net) instead of Vercel Cron (D-036).
-- Each job calls the app's /api/cron/* endpoint with `Authorization: Bearer <CRON_SECRET>`.
-- The URL and the secret live in Supabase Vault (never in migrations). Once per project:
--
--   select vault.create_secret('https://docufirma.es', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'cron_secret');
--
-- Databases without pg_cron/pg_net (the bare Postgres used by `pnpm test:db` / `pnpm stack:up`)
-- skip this migration with a notice.

do $migration$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
    or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron/pg_net not available: scheduled jobs not installed';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  -- Fires an async GET (pg_net queues it; the cron worker never waits for the response).
  create or replace function public.invoke_app_cron(p_path text)
  returns bigint
  language plpgsql
  security definer
  set search_path = ''
  as $fn$
  declare
    v_url text;
    v_secret text;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
    if v_url is null or v_secret is null then
      raise warning 'invoke_app_cron(%): create the Vault secrets app_url and cron_secret', p_path;
      return null;
    end if;
    return net.http_get(
      url := rtrim(v_url, '/') || p_path,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
      timeout_milliseconds := 60000
    );
  end;
  $fn$;

  revoke all on function public.invoke_app_cron(text) from public, anon, authenticated, service_role;

  -- (Re)schedule by name so the migration is idempotent. Times are UTC.
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in ('docufirma-reminders', 'docufirma-expire', 'docufirma-retry-tsa', 'docufirma-retention');

  perform cron.schedule('docufirma-reminders', '0 * * * *', $$select public.invoke_app_cron('/api/cron/reminders')$$);
  perform cron.schedule('docufirma-expire', '15 * * * *', $$select public.invoke_app_cron('/api/cron/expire')$$);
  perform cron.schedule('docufirma-retry-tsa', '*/5 * * * *', $$select public.invoke_app_cron('/api/cron/retry-tsa')$$);
  perform cron.schedule('docufirma-retention', '30 3 * * *', $$select public.invoke_app_cron('/api/cron/retention')$$);
end
$migration$;
