-- Automatic top-up (D-040): when the signature or SMS balance falls to a user-defined minimum,
-- the chosen pack is charged off-session to the saved card (Stripe invoice) and credited.

create table public.auto_recharge (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('signatures', 'sms')),
  enabled boolean not null default false,
  threshold integer not null default 2 check (threshold between 0 and 1000),
  pack_id uuid references public.credit_packs (id) on delete set null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create trigger auto_recharge_updated_at before update on public.auto_recharge
  for each row execute function public.set_updated_at();

alter table public.auto_recharge enable row level security;
revoke all on public.auto_recharge from anon, authenticated;
grant select on public.auto_recharge to authenticated;
grant all on public.auto_recharge to service_role;
create policy auto_recharge_select_own on public.auto_recharge
  for select to authenticated using (user_id = (select auth.uid()));

-- Returns the settings row when a top-up must run now and stamps the attempt; null otherwise.
-- Runs when enabled, the pack is active and of the same kind, the balance is at or below the
-- threshold and there was no attempt in the last 10 minutes (no double charges on bursts).
create or replace function public.claim_auto_recharge(p_user_id uuid, p_kind text)
returns public.auto_recharge
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.auto_recharge;
  v_balance integer;
begin
  select * into r from public.auto_recharge
  where user_id = p_user_id and kind = p_kind
  for update;
  if not found or not r.enabled or r.pack_id is null then
    return null;
  end if;
  if not exists (
    select 1 from public.credit_packs p
    where p.id = r.pack_id and p.active and p.kind = p_kind
  ) then
    return null;
  end if;
  if r.last_attempt_at is not null and r.last_attempt_at > now() - interval '10 minutes' then
    return null;
  end if;

  if p_kind = 'sms' then
    v_balance := public._sms_balance(p_user_id);
  else
    select b.available into v_balance from public._credit_balance(p_user_id) b;
  end if;
  if coalesce(v_balance, 0) > r.threshold then
    return null;
  end if;

  update public.auto_recharge set last_attempt_at = now()
  where user_id = p_user_id and kind = p_kind
  returning * into r;
  return r;
end;
$$;

revoke all on function public.claim_auto_recharge(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_auto_recharge(uuid, text) to service_role;

notify pgrst, 'reload schema';
