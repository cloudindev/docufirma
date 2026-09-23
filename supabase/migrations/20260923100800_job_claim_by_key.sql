-- Claims one specific job (by dedupe key) atomically, so that the inline closure triggered
-- after the last signature and the cron worker never process the same envelope twice.
create or replace function public.claim_job_by_key(p_dedupe_key text)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j set status = 'running', locked_at = now(), attempts = j.attempts + 1
  where j.id = (
    select id from public.jobs
    where dedupe_key = p_dedupe_key
      and (status in ('pending', 'failed') or (status = 'running' and locked_at < now() - interval '10 minutes'))
    for update skip locked
  )
  returning j.*
$$;

revoke all on function public.claim_job_by_key(text) from public, anon, authenticated;
grant execute on function public.claim_job_by_key(text) to service_role;

-- TSA retry bookkeeping per artifact.
create or replace function public.record_tsa_result(
  p_artifact_id uuid,
  p_granted boolean,
  p_fields jsonb,
  p_error text default null,
  p_next_attempt_at timestamptz default null
)
returns public.signed_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.signed_documents;
begin
  update public.signed_documents set
    tsa_status = case when p_granted then 'granted'::public.tsa_status else 'failed'::public.tsa_status end,
    tsa_attempts = tsa_attempts + 1,
    tsa_error = case when p_granted then null else left(p_error, 1000) end,
    tsa_next_attempt_at = case when p_granted then null else p_next_attempt_at end,
    tsa_provider = coalesce(p_fields ->> 'provider', tsa_provider),
    tsq_path = coalesce(p_fields ->> 'tsq_path', tsq_path),
    tsr_path = coalesce(p_fields ->> 'tsr_path', tsr_path),
    tsa_serial = coalesce(p_fields ->> 'serial', tsa_serial),
    tsa_gen_time = coalesce((p_fields ->> 'gen_time')::timestamptz, tsa_gen_time),
    tsa_policy_oid = coalesce(p_fields ->> 'policy_oid', tsa_policy_oid),
    tsa_name = coalesce(p_fields ->> 'tsa_name', tsa_name),
    tsa_hash_alg = coalesce(p_fields ->> 'hash_alg', tsa_hash_alg)
  where id = p_artifact_id and tsa_status <> 'granted'
  returning * into r;
  return r;
end;
$$;

revoke all on function public.record_tsa_result(uuid, boolean, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_tsa_result(uuid, boolean, jsonb, text, timestamptz) to service_role;
