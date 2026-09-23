-- GDPR retention of biometric evidence (docs/LEGAL.md §4): after N years the encrypted stroke
-- data is deleted; its hash, the signature image, the signed PDFs and the evidence certificate remain.
alter table public.signature_evidence add column biometric_purged_at timestamptz;

-- Marks up to p_limit expired rows as purged and returns their storage paths for deletion.
create or replace function public.claim_expired_biometrics(p_years integer, p_limit integer default 200)
returns table (evidence_id uuid, biometric_data_path text)
language sql
security definer
set search_path = ''
as $$
  with target as (
    select id, biometric_data_path as old_path
      from public.signature_evidence
     where biometric_data_path is not null
       and server_time < now() - make_interval(years => p_years)
     order by server_time
     limit p_limit
     for update skip locked
  ), purged as (
    update public.signature_evidence se
       set biometric_purged_at = now(), biometric_data_path = null
      from target
     where se.id = target.id
    returning se.id, target.old_path
  )
  select id, old_path from purged
$$;

revoke all on function public.claim_expired_biometrics(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_expired_biometrics(integer, integer) to service_role;
