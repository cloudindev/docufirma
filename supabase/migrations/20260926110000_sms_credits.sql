-- Paid SMS (D-038): senders buy SMS packs; every signing code sent consumes 1 SMS of the
-- envelope owner. Signature packs and SMS packs share the catalog (credit_packs.kind).

alter table public.credit_packs
  add column kind text not null default 'signatures',
  add constraint credit_packs_kind_check check (kind in ('signatures', 'sms'));

-- Default SMS packs (IVA incluido). Prices are editable in the table; `stripe_price_id` is
-- filled by the Stripe setup (pnpm stripe:setup or POST /api/admin/stripe-setup).
insert into public.credit_packs (slug, name_es, name_en, credits, price_cents, currency, sort_order, kind) values
  ('sms-100', 'Pack 100 SMS', '100 SMS pack', 100, 900, 'eur', 11, 'sms'),
  ('sms-500', 'Pack 500 SMS', '500 SMS pack', 500, 3900, 'eur', 12, 'sms'),
  ('sms-1000', 'Pack 1000 SMS', '1000 SMS pack', 1000, 6900, 'eur', 13, 'sms')
on conflict (slug) do nothing;

create table public.sms_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('purchase', 'consume', 'refund', 'adjustment')),
  amount integer not null check (amount <> 0),
  pack_id uuid references public.credit_packs (id) on delete set null,
  stripe_payment_intent_id text,
  envelope_id uuid references public.envelopes (id) on delete set null,
  signer_id uuid references public.signers (id) on delete set null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create unique index sms_ledger_payment_uidx on public.sms_ledger (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;
create index sms_ledger_user_idx on public.sms_ledger (user_id, created_at desc);

create or replace function public.sms_ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('docufirma.allow_purge', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- FK "on delete set null" updates (envelope/signer deleted) are allowed; nothing else is.
  if tg_op = 'UPDATE' and new.id = old.id and new.user_id = old.user_id and new.kind = old.kind
     and new.amount = old.amount and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'sms_ledger is append-only' using errcode = '42501';
end;
$$;

create trigger sms_ledger_append_only
  before update or delete on public.sms_ledger
  for each row execute function public.sms_ledger_guard();

alter table public.sms_ledger enable row level security;
revoke all on public.sms_ledger from anon, authenticated;
grant select on public.sms_ledger to authenticated;
grant all on public.sms_ledger to service_role;
create policy sms_ledger_select_own on public.sms_ledger
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public._sms_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.sms_ledger where user_id = p_user_id;
$$;

create or replace function public.get_sms_balance(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return greatest(public._sms_balance(p_user_id), 0);
end;
$$;

-- Idempotent per payment (webhook retries insert nothing).
create or replace function public.grant_sms_pack(
  p_user_id uuid, p_amount integer, p_payment_ref text, p_pack_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sms_ledger (user_id, kind, amount, stripe_payment_intent_id, pack_id)
  values (p_user_id, 'purchase', p_amount, p_payment_ref, p_pack_id)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function public.adjust_sms_credits(p_user_id uuid, p_amount integer, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sms_ledger (user_id, kind, amount, note) values (p_user_id, 'adjustment', p_amount, p_note);
end;
$$;

-- Gives back the SMS consumed by the latest code of a signer (the provider did not send it).
create or replace function public.refund_signer_sms(p_signer_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.sms_ledger;
begin
  select * into c from public.sms_ledger
  where signer_id = p_signer_id and kind = 'consume'
  order by created_at desc limit 1;
  if not found then return; end if;
  if exists (select 1 from public.sms_ledger r where r.kind = 'refund' and r.signer_id = p_signer_id
             and r.created_at >= c.created_at) then
    return;
  end if;
  insert into public.sms_ledger (user_id, kind, amount, envelope_id, signer_id, note)
  values (c.user_id, 'refund', 1, c.envelope_id, p_signer_id, left(p_note, 500));
end;
$$;

-- request_signer_otp now charges 1 SMS to the envelope owner (serialised per owner).
create or replace function public.request_signer_otp(
  p_token_hash text,
  p_code_hash text,
  p_ip inet default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
  v_owner uuid;
  s public.signers;
begin
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._assert_signer_can_act(v_signer);
  select * into s from public.signers where id = v_signer;
  if not s.require_sms_otp or s.phone is null then
    raise exception 'otp_not_required' using errcode = 'P0001';
  end if;
  if (select count(*) from public.signer_otps
      where signer_id = v_signer and created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.signer_otps where signer_id = v_signer) >= 10 then
    raise exception 'otp_rate_limited' using errcode = 'P0001';
  end if;

  select user_id into v_owner from public.envelopes where id = v_envelope;
  if v_owner is null then raise exception 'sms_no_credits' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('sms:' || v_owner::text));
  if public._sms_balance(v_owner) < 1 then
    raise exception 'sms_no_credits' using errcode = 'P0001';
  end if;
  insert into public.sms_ledger (user_id, kind, amount, envelope_id, signer_id)
  values (v_owner, 'consume', -1, v_envelope, v_signer);

  update public.signer_otps set consumed_at = now()
  where signer_id = v_signer and consumed_at is null;
  insert into public.signer_otps (signer_id, code_hash, expires_at)
  values (v_signer, p_code_hash, now() + interval '10 minutes');

  perform public._log_event(v_envelope, v_signer, 'otp_sent',
    jsonb_build_object('phone', public._mask_phone(s.phone)), p_ip, p_user_agent);
  return s.phone;
end;
$$;

revoke all on function public._sms_balance(uuid) from public, anon, authenticated;
revoke all on function public.get_sms_balance(uuid) from public, anon;
revoke all on function public.grant_sms_pack(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.adjust_sms_credits(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.refund_signer_sms(uuid, text) from public, anon, authenticated;
revoke all on function public.request_signer_otp(text, text, inet, text) from public, anon, authenticated;
grant execute on function public.get_sms_balance(uuid) to authenticated, service_role;
grant execute on function public._sms_balance(uuid) to service_role;
grant execute on function public.grant_sms_pack(uuid, integer, text, uuid) to service_role;
grant execute on function public.adjust_sms_credits(uuid, integer, text) to service_role;
grant execute on function public.refund_signer_sms(uuid, text) to service_role;
grant execute on function public.request_signer_otp(text, text, inet, text) to service_role;

notify pgrst, 'reload schema';
