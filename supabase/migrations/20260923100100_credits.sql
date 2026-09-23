-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · credit ledger ("firmas")
--
-- The balance is never stored: it is always the sum of the ledger.
--  * monthly_grant  +N  pool=monthly  expires_at = end of the billing period
--  * pack_purchase  +N  pool=pack     no expiry
--  * trial_grant    +N  pool=pack     no expiry (trial credits behave like a pack)
--  * reserve        -1  per signer when an envelope is sent (monthly first, then pack)
--  * consume         0  marker: the reservation became a completed signature
--  * release        +1  the reservation is returned (declined / canceled / expired)
--  * adjustment     ±N  manual correction by an operator
--
-- Monthly rows (grant, reserve, release) carry the expires_at of the cycle they belong
-- to, so a whole cycle disappears from the balance when it ends: monthly credits never
-- accumulate. Only the latest non-expired cycle counts.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.credit_kind not null,
  amount integer not null,
  pool public.credit_pool not null,
  expires_at timestamptz,
  envelope_id uuid references public.envelopes (id) on delete set null,
  signer_id uuid references public.signers (id) on delete set null,
  pack_id uuid references public.credit_packs (id) on delete set null,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  note text,
  created_at timestamptz not null default now(),
  constraint credit_ledger_amount_sign check (
    (kind = 'consume' and amount = 0)
    or (kind in ('monthly_grant', 'pack_purchase', 'trial_grant', 'release') and amount > 0)
    or (kind = 'reserve' and amount < 0)
    or (kind = 'adjustment' and amount <> 0)
  ),
  constraint credit_ledger_monthly_expiry check (pool <> 'monthly' or expires_at is not null)
);

create index credit_ledger_user_idx on public.credit_ledger (user_id, pool, expires_at);
create index credit_ledger_signer_idx on public.credit_ledger (signer_id);
-- Idempotency: one reserve / consume / release per signer, one grant per invoice / payment.
create unique index credit_ledger_reserve_uidx on public.credit_ledger (signer_id) where kind = 'reserve';
create unique index credit_ledger_consume_uidx on public.credit_ledger (signer_id) where kind = 'consume';
create unique index credit_ledger_release_uidx on public.credit_ledger (signer_id) where kind = 'release';
create unique index credit_ledger_invoice_uidx on public.credit_ledger (stripe_invoice_id) where kind = 'monthly_grant';
create unique index credit_ledger_payment_uidx on public.credit_ledger (stripe_payment_intent_id) where kind = 'pack_purchase';
create unique index credit_ledger_trial_uidx on public.credit_ledger (user_id) where kind = 'trial_grant';

-- The ledger is append-only (purges only through privileged functions).
create or replace function public.credit_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('docufirma.allow_purge', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'credit_ledger is append-only' using errcode = '42501';
end;
$$;

create trigger credit_ledger_append_only
  before update or delete on public.credit_ledger
  for each row execute function public.credit_ledger_guard();

-- ── Balance ──────────────────────────────────────────────────────────────────
-- Internal: balance for a user without permission checks.
create or replace function public._credit_balance(p_user_id uuid)
returns table (
  monthly_available integer,
  pack_available integer,
  monthly_granted integer,
  monthly_expires_at timestamptz,
  reserved integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with cycle as (
    select max(l.expires_at) as expires_at
    from public.credit_ledger l
    where l.user_id = p_user_id and l.kind = 'monthly_grant' and l.expires_at > now()
  )
  select
    coalesce((
      select sum(l.amount) from public.credit_ledger l, cycle c
      where l.user_id = p_user_id and l.pool = 'monthly' and l.expires_at = c.expires_at
    ), 0)::integer,
    coalesce((
      select sum(l.amount) from public.credit_ledger l
      where l.user_id = p_user_id and l.pool = 'pack'
    ), 0)::integer,
    coalesce((
      select sum(l.amount) from public.credit_ledger l, cycle c
      where l.user_id = p_user_id and l.kind = 'monthly_grant' and l.expires_at = c.expires_at
    ), 0)::integer,
    (select c.expires_at from cycle c),
    (
      select count(*) from public.credit_ledger r
      where r.user_id = p_user_id and r.kind = 'reserve'
        and not exists (
          select 1 from public.credit_ledger x
          where x.signer_id = r.signer_id and x.kind in ('consume', 'release')
        )
    )::integer
$$;

-- Public: callable by the owner (RLS-like check) or by the service role.
create or replace function public.get_available_credits(p_user_id uuid)
returns table (
  monthly_available integer,
  pack_available integer,
  total integer,
  monthly_granted integer,
  monthly_expires_at timestamptz,
  reserved integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Owners may read their own balance; the service role may read any.
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select greatest(b.monthly_available, 0), greatest(b.pack_available, 0),
           greatest(b.monthly_available, 0) + greatest(b.pack_available, 0),
           b.monthly_granted, b.monthly_expires_at, b.reserved
    from public._credit_balance(p_user_id) b;
end;
$$;

-- Safety net: no insert may leave a pool negative.
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
  if new.pool = 'monthly' then
    select coalesce(sum(amount), 0) into v_balance from public.credit_ledger
    where user_id = new.user_id and pool = 'monthly' and expires_at = new.expires_at;
  else
    select coalesce(sum(amount), 0) into v_balance from public.credit_ledger
    where user_id = new.user_id and pool = 'pack';
  end if;
  if v_balance + new.amount < 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('pool=%s balance=%s amount=%s', new.pool, v_balance, new.amount);
  end if;
  return new;
end;
$$;

create trigger credit_ledger_non_negative
  before insert on public.credit_ledger
  for each row execute function public.credit_ledger_non_negative();

-- ── Mutations (service role only) ────────────────────────────────────────────
-- Reserve one credit per signer. Monthly credits are used first, then packs.
-- Serialised per user by locking the profile row.
create or replace function public.reserve_credits(p_user_id uuid, p_envelope_id uuid, p_signer_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_monthly integer;
  v_pack integer;
  v_expires timestamptz;
  v_needed integer;
  v_signer uuid;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- Signers that already hold a reservation are skipped (idempotent retries).
  select count(*) into v_needed from unnest(p_signer_ids) as sid
  where not exists (select 1 from public.credit_ledger l where l.signer_id = sid and l.kind = 'reserve');

  select greatest(b.monthly_available, 0), greatest(b.pack_available, 0), b.monthly_expires_at
    into v_monthly, v_pack, v_expires
  from public._credit_balance(p_user_id) b;

  if v_monthly + v_pack < v_needed then
    raise exception 'insufficient_credits' using errcode = 'P0001',
      detail = format('needed=%s available=%s', v_needed, v_monthly + v_pack);
  end if;

  foreach v_signer in array p_signer_ids loop
    if exists (select 1 from public.credit_ledger where signer_id = v_signer and kind = 'reserve') then
      continue; -- idempotent
    end if;
    if v_monthly > 0 then
      insert into public.credit_ledger (user_id, kind, amount, pool, expires_at, envelope_id, signer_id)
      values (p_user_id, 'reserve', -1, 'monthly', v_expires, p_envelope_id, v_signer);
      v_monthly := v_monthly - 1;
    else
      insert into public.credit_ledger (user_id, kind, amount, pool, envelope_id, signer_id)
      values (p_user_id, 'reserve', -1, 'pack', p_envelope_id, v_signer);
      v_pack := v_pack - 1;
    end if;
  end loop;
end;
$$;

-- Turn a reservation into a consumed signature. Returns false if there was nothing to consume.
create or replace function public.consume_credit(p_signer_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.credit_ledger;
begin
  select * into r from public.credit_ledger where signer_id = p_signer_id and kind = 'reserve';
  if not found then
    return false;
  end if;
  if exists (select 1 from public.credit_ledger where signer_id = p_signer_id and kind in ('consume', 'release')) then
    return false;
  end if;
  insert into public.credit_ledger (user_id, kind, amount, pool, expires_at, envelope_id, signer_id)
  values (r.user_id, 'consume', 0, r.pool, r.expires_at, r.envelope_id, r.signer_id);
  return true;
end;
$$;

-- Return a reservation to its pool (same cycle for monthly credits).
create or replace function public.release_credit(p_signer_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.credit_ledger;
begin
  select * into r from public.credit_ledger where signer_id = p_signer_id and kind = 'reserve';
  if not found then
    return false;
  end if;
  if exists (select 1 from public.credit_ledger where signer_id = p_signer_id and kind in ('consume', 'release')) then
    return false;
  end if;
  insert into public.credit_ledger (user_id, kind, amount, pool, expires_at, envelope_id, signer_id, note)
  values (r.user_id, 'release', -r.amount, r.pool, r.expires_at, r.envelope_id, r.signer_id, p_note);
  return true;
end;
$$;

create or replace function public.grant_monthly_credits(
  p_user_id uuid, p_amount integer, p_expires_at timestamptz, p_invoice_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, kind, amount, pool, expires_at, stripe_invoice_id)
  values (p_user_id, 'monthly_grant', p_amount, 'monthly', p_expires_at, p_invoice_id)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function public.grant_pack_credits(
  p_user_id uuid, p_amount integer, p_payment_ref text, p_pack_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, kind, amount, pool, stripe_payment_intent_id, pack_id)
  values (p_user_id, 'pack_purchase', p_amount, 'pack', p_payment_ref, p_pack_id)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function public.adjust_credits(p_user_id uuid, p_amount integer, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.credit_ledger (user_id, kind, amount, pool, note)
  values (p_user_id, 'adjustment', p_amount, 'pack', p_note);
end;
$$;

-- ── New users: profile + trial credits ───────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := nullif(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', '')), '');
  v_last text := nullif(trim(coalesce(meta ->> 'last_name', meta ->> 'family_name', '')), '');
  v_full text := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  v_locale text := case when meta ->> 'locale' in ('es', 'en') then meta ->> 'locale' else 'es' end;
  v_trial integer;
begin
  if v_first is null and v_full is not null then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, char_length(v_first) + 1)), ''));
  end if;

  insert into public.profiles (id, email, first_name, last_name, locale)
  values (new.id, coalesce(new.email, ''), left(v_first, 80), left(v_last, 120), v_locale)
  on conflict (id) do nothing;

  select coalesce((value #>> '{}')::integer, 0) into v_trial
  from public.app_settings where key = 'trial_credits';

  if coalesce(v_trial, 0) > 0 then
    insert into public.credit_ledger (user_id, kind, amount, pool, note)
    values (new.id, 'trial_grant', v_trial, 'pack', 'Welcome trial')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();
