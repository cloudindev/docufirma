-- New pricing model (D-039):
--  * The Pro plan (9 €/month) is required to send envelopes (checked by the app) and no longer
--    grants monthly credits.
--  * Every account gets 5 welcome signatures once (replaces the 3 trial credits). Further
--    signatures are bought in packs, which never expire.
--  * SMS packs: 100 SMS = 12 €, 500 = 55 €, 1000 = 90 € (VAT included).
-- The ledger keeps a single pool ('pack'); monthly rows can no longer be written.

update public.app_settings set value = '5'::jsonb where key = 'trial_credits';
delete from public.app_settings where key = 'monthly_credits';

-- Existing accounts: bring their welcome credits up to 5 (never beyond).
insert into public.credit_ledger (user_id, kind, amount, pool, note)
select t.user_id, 'adjustment', 5 - t.amount, 'pack', 'Welcome credits raised to 5'
from public.credit_ledger t
where t.kind = 'trial_grant' and t.amount < 5;

-- ── No more monthly credits ──────────────────────────────────────────────────
drop function if exists public.grant_monthly_credits(uuid, integer, timestamptz, text);
drop index if exists public.credit_ledger_invoice_uidx;
alter table public.credit_ledger
  add constraint credit_ledger_pack_only check (pool = 'pack' and kind <> 'monthly_grant') not valid;

drop function if exists public.get_available_credits(uuid);
drop function if exists public._credit_balance(uuid);

-- Internal: balance for a user without permission checks.
create function public._credit_balance(p_user_id uuid)
returns table (available integer, reserved integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select sum(l.amount) from public.credit_ledger l
      where l.user_id = p_user_id and l.pool = 'pack'
    ), 0)::integer,
    (
      select count(*) from public.credit_ledger r
      where r.user_id = p_user_id and r.kind = 'reserve'
        and not exists (
          select 1 from public.credit_ledger x
          where x.signer_id = r.signer_id and x.kind in ('consume', 'release')
        )
    )::integer
$$;

-- Public: callable by the owner or by the service role.
create function public.get_available_credits(p_user_id uuid)
returns table (total integer, reserved integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select greatest(b.available, 0), b.reserved from public._credit_balance(p_user_id) b;
end;
$$;

-- Reserve one credit per signer (idempotent per signer), serialised per user.
create or replace function public.reserve_credits(p_user_id uuid, p_envelope_id uuid, p_signer_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available integer;
  v_needed integer;
  v_signer uuid;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  select count(*) into v_needed from unnest(p_signer_ids) as sid
  where not exists (select 1 from public.credit_ledger l where l.signer_id = sid and l.kind = 'reserve');

  select greatest(b.available, 0) into v_available from public._credit_balance(p_user_id) b;
  if v_available < v_needed then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('needed=%s available=%s', v_needed, v_available);
  end if;

  foreach v_signer in array p_signer_ids loop
    if exists (select 1 from public.credit_ledger where signer_id = v_signer and kind = 'reserve') then
      continue;
    end if;
    insert into public.credit_ledger (user_id, kind, amount, pool, envelope_id, signer_id)
    values (p_user_id, 'reserve', -1, 'pack', p_envelope_id, v_signer);
  end loop;
end;
$$;

-- Safety net: no insert may leave the balance negative.
create or replace function public.credit_ledger_non_negative()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if new.amount >= 0 then
    return new;
  end if;
  select coalesce(sum(amount), 0) into v_balance from public.credit_ledger
  where user_id = new.user_id and pool = 'pack';
  if v_balance + new.amount < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('balance=%s amount=%s', v_balance, new.amount);
  end if;
  return new;
end;
$$;

revoke all on function public._credit_balance(uuid) from public, anon, authenticated;
revoke all on function public.get_available_credits(uuid) from public, anon;
revoke all on function public.reserve_credits(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public._credit_balance(uuid) to service_role;
grant execute on function public.get_available_credits(uuid) to authenticated, service_role;
grant execute on function public.reserve_credits(uuid, uuid, uuid[]) to service_role;

-- ── New SMS prices (new Stripe prices are created by the Stripe setup) ─────────
update public.credit_packs set price_cents = 1200, stripe_price_id = null where slug = 'sms-100';
update public.credit_packs set price_cents = 5500, stripe_price_id = null where slug = 'sms-500';
update public.credit_packs set price_cents = 9000, stripe_price_id = null where slug = 'sms-1000';

notify pgrst, 'reload schema';
