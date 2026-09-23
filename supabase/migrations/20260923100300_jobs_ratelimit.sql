-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · job queue + rate limiting helpers (service role only)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enqueue_job(
  p_type text, p_payload jsonb, p_run_at timestamptz default now(), p_dedupe_key text default null,
  p_max_attempts integer default 6
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (type, payload, run_at, dedupe_key, max_attempts)
  values (p_type, coalesce(p_payload, '{}'::jsonb), p_run_at, p_dedupe_key, p_max_attempts)
  on conflict (dedupe_key) do update
    set run_at = least(public.jobs.run_at, excluded.run_at),
        status = case when public.jobs.status = 'failed' then 'pending'::public.job_status else public.jobs.status end
  returning id into v_id;
  return v_id;
end;
$$;

-- Claims due jobs atomically. Jobs stuck in "running" for more than 10 minutes
-- (crashed worker) are reclaimed.
create or replace function public.claim_jobs(p_type text, p_limit integer default 10)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id in (
    select id from public.jobs
    where type = p_type
      and run_at <= now()
      and (status = 'pending' or (status = 'running' and locked_at < now() - interval '10 minutes'))
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*
$$;

create or replace function public.complete_job(p_job_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.jobs set status = 'done', locked_at = null, last_error = null where id = p_job_id
$$;

-- Marks a failed attempt. With p_retry_at the job is rescheduled, otherwise (or when
-- max_attempts is reached) it is marked as failed permanently.
create or replace function public.fail_job(p_job_id uuid, p_error text, p_retry_at timestamptz default null)
returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.job_status;
begin
  update public.jobs set
    status = case when p_retry_at is not null and attempts < max_attempts then 'pending'::public.job_status else 'failed'::public.job_status end,
    run_at = coalesce(p_retry_at, run_at),
    locked_at = null,
    last_error = left(p_error, 2000)
  where id = p_job_id
  returning status into v_status;
  return v_status;
end;
$$;

-- Fixed-window rate limiter. Returns whether the hit is allowed.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  reset_at := v_window + make_interval(secs => p_window_seconds);
  return next;
end;
$$;
