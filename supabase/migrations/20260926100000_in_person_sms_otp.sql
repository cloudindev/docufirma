-- In-person signing and SMS one-time codes (D-037).
--  * signers.delivery: 'email' (link by email, default) or 'in_person' (signed on the sender's
--    device; no emails, the sender starts the session from the app).
--  * signers.require_sms_otp + phone: the signer must confirm a 6-digit code sent by SMS
--    shortly before signing. Codes are stored only as SHA-256 in signer_otps.
--  * The signature evidence snapshots how the signer was identified.

alter type public.envelope_event_type add value if not exists 'otp_sent';
alter type public.envelope_event_type add value if not exists 'otp_verified';
alter type public.envelope_event_type add value if not exists 'otp_failed';
alter type public.envelope_event_type add value if not exists 'in_person_started';

alter table public.signers
  add column delivery text not null default 'email',
  add column phone text,
  add column require_sms_otp boolean not null default false,
  add column otp_verified_at timestamptz,
  add column in_person_host text,
  add constraint signers_delivery_check check (delivery in ('email', 'in_person')),
  add constraint signers_phone_format check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint signers_otp_needs_phone check (not require_sms_otp or phone is not null),
  add constraint signers_in_person_host_len check (char_length(in_person_host) <= 300);

grant select (delivery, phone, require_sms_otp, otp_verified_at) on public.signers to authenticated;
grant insert (delivery, phone, require_sms_otp) on public.signers to authenticated;
grant update (delivery, phone, require_sms_otp) on public.signers to authenticated;

alter table public.signature_evidence
  add column delivery text,
  add column in_person_host text,
  add column otp_phone_masked text,
  add column otp_verified_at timestamptz;

create table public.signer_otps (
  id uuid primary key default gen_random_uuid(),
  signer_id uuid not null references public.signers (id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index signer_otps_signer_idx on public.signer_otps (signer_id, created_at desc);
alter table public.signer_otps enable row level security;
revoke all on public.signer_otps from anon, authenticated;
grant all on public.signer_otps to service_role;

-- "+34600123456" → "+34 ••• ••• 456"
create or replace function public._mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_phone is null then null
    else left(p_phone, 3) || ' ••• ••• ' || right(p_phone, 3) end;
$$;

-- ── In-person session ───────────────────────────────────────────────────────
-- The sender starts the session on their own device: previous links of that signer are revoked,
-- a fresh token is issued and the event records who hosted the signature.
create or replace function public.start_in_person_signing(
  p_signer_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_host text,
  p_ip inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.signers;
  e public.envelopes;
begin
  select * into s from public.signers where id = p_signer_id;
  if not found then raise exception 'signer_not_found' using errcode = 'P0002'; end if;
  select * into e from public.envelopes where id = s.envelope_id for update;
  perform 1 from public.signers where id = p_signer_id for update;
  if e.user_id is distinct from p_user_id then
    raise exception 'signer_not_found' using errcode = 'P0002';
  end if;
  if s.delivery <> 'in_person' then raise exception 'not_in_person' using errcode = 'P0001'; end if;

  update public.signer_access_tokens set revoked_at = now()
  where signer_id = p_signer_id and revoked_at is null;
  perform public.issue_signer_token(p_signer_id, p_token_hash);
  perform public._assert_signer_can_act(p_signer_id);

  update public.signers set in_person_host = left(p_host, 300) where id = p_signer_id;
  perform public._log_event(e.id, p_signer_id, 'in_person_started',
    jsonb_build_object('host', left(p_host, 300)), p_ip, p_user_agent);
end;
$$;

-- ── SMS one-time codes ─────────────────────────────────────────────────────
-- Returns the phone to send the code to. At most 3 codes per 10 minutes and 10 per signer.
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

  -- Only the latest code is valid.
  update public.signer_otps set consumed_at = now()
  where signer_id = v_signer and consumed_at is null;
  insert into public.signer_otps (signer_id, code_hash, expires_at)
  values (v_signer, p_code_hash, now() + interval '10 minutes');

  perform public._log_event(v_envelope, v_signer, 'otp_sent',
    jsonb_build_object('phone', public._mask_phone(s.phone)), p_ip, p_user_agent);
  return s.phone;
end;
$$;

-- Returns {ok, reason?, attempts_left?}. Never raises for a wrong code, so failed attempts persist.
create or replace function public.verify_signer_otp(
  p_token_hash text,
  p_code_hash text,
  p_ip inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
  o public.signer_otps;
  v_max constant integer := 5;
begin
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._assert_signer_can_act(v_signer);

  select * into o from public.signer_otps
  where signer_id = v_signer and consumed_at is null
  order by created_at desc limit 1 for update;
  if not found or o.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if o.attempts >= v_max then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  if o.code_hash = p_code_hash then
    update public.signer_otps set consumed_at = now() where id = o.id;
    update public.signers set otp_verified_at = now() where id = v_signer;
    perform public._log_event(v_envelope, v_signer, 'otp_verified', '{}'::jsonb, p_ip, p_user_agent);
    return jsonb_build_object('ok', true);
  end if;

  update public.signer_otps set attempts = attempts + 1 where id = o.id;
  perform public._log_event(v_envelope, v_signer, 'otp_failed',
    jsonb_build_object('attempt', o.attempts + 1), p_ip, p_user_agent);
  if o.attempts + 1 >= v_max then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'invalid', 'attempts_left', v_max - o.attempts - 1);
end;
$$;

-- ── Signature: require a recent SMS verification when configured ──────────────
create or replace function public.complete_signature(
  p_token_hash text,
  p_evidence jsonb,
  p_consent_version text,
  p_ip inet default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
  e public.envelopes;
  s public.signers;
  v_next uuid;
  v_all_signed boolean;
begin
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._assert_signer_can_act(v_signer);
  select * into s from public.signers where id = v_signer;

  -- The code must have been confirmed within the last 30 minutes.
  if s.require_sms_otp and (s.otp_verified_at is null or s.otp_verified_at < now() - interval '30 minutes') then
    raise exception 'otp_required' using errcode = 'P0001';
  end if;

  insert into public.signature_evidence (
    signer_id, envelope_id, biometric_data_path, biometric_sha256, biometric_key_id,
    signature_image_path, signature_image_sha256, stroke_count, duration_ms, points_count,
    device_type, user_agent, ip, geo_country, geo_region, geo_city, screen_w, screen_h,
    pointer_type, pressure_supported, timezone, client_time, consent_text_version,
    delivery, in_person_host, otp_phone_masked, otp_verified_at
  ) values (
    v_signer, v_envelope,
    p_evidence ->> 'biometric_data_path',
    p_evidence ->> 'biometric_sha256',
    p_evidence ->> 'biometric_key_id',
    p_evidence ->> 'signature_image_path',
    p_evidence ->> 'signature_image_sha256',
    (p_evidence ->> 'stroke_count')::integer,
    (p_evidence ->> 'duration_ms')::integer,
    (p_evidence ->> 'points_count')::integer,
    p_evidence ->> 'device_type',
    left(p_user_agent, 512),
    p_ip,
    p_evidence ->> 'geo_country',
    p_evidence ->> 'geo_region',
    p_evidence ->> 'geo_city',
    (p_evidence ->> 'screen_w')::integer,
    (p_evidence ->> 'screen_h')::integer,
    p_evidence ->> 'pointer_type',
    coalesce((p_evidence ->> 'pressure_supported')::boolean, false),
    p_evidence ->> 'timezone',
    (p_evidence ->> 'client_time')::timestamptz,
    p_consent_version,
    s.delivery,
    case when s.delivery = 'in_person' then s.in_person_host end,
    case when s.require_sms_otp then public._mask_phone(s.phone) end,
    case when s.require_sms_otp then s.otp_verified_at end
  );

  update public.signers set
    status = 'signed',
    signed_at = now(),
    viewed_at = coalesce(viewed_at, now()),
    consent_accepted_at = now(),
    consent_text_version = p_consent_version
  where id = v_signer;

  perform public._log_event(v_envelope, v_signer, 'consent_accepted',
    jsonb_build_object('version', p_consent_version), p_ip, p_user_agent);
  perform public._log_event(v_envelope, v_signer, 'signed',
    jsonb_build_object('biometric_sha256', p_evidence ->> 'biometric_sha256'), p_ip, p_user_agent);
  perform public.consume_credit(v_signer);

  select not exists (select 1 from public.signers where envelope_id = v_envelope and status <> 'signed')
    into v_all_signed;

  select * into e from public.envelopes where id = v_envelope;
  if v_all_signed then
    update public.envelopes set all_signed_at = now(), status = 'viewed' where id = v_envelope;
    insert into public.jobs (type, payload, dedupe_key)
    values ('close_envelope', jsonb_build_object('envelope_id', v_envelope), 'close_envelope:' || v_envelope)
    on conflict (dedupe_key) do nothing;
  elsif e.sequential then
    select id into v_next from public.signers
    where envelope_id = v_envelope and status = 'pending'
    order by order_index, created_at limit 1;
  end if;

  return jsonb_build_object(
    'signer_id', v_signer,
    'envelope_id', v_envelope,
    'all_signed', v_all_signed,
    'next_signer_id', v_next
  );
end;
$$;

revoke all on function public._mask_phone(text) from public, anon, authenticated;
revoke all on function public.start_in_person_signing(uuid, uuid, text, text, inet, text) from public, anon, authenticated;
revoke all on function public.request_signer_otp(text, text, inet, text) from public, anon, authenticated;
revoke all on function public.verify_signer_otp(text, text, inet, text) from public, anon, authenticated;
revoke all on function public.complete_signature(text, jsonb, text, inet, text) from public, anon, authenticated;
grant execute on function public._mask_phone(text) to service_role;
grant execute on function public.start_in_person_signing(uuid, uuid, text, text, inet, text) to service_role;
grant execute on function public.request_signer_otp(text, text, inet, text) to service_role;
grant execute on function public.verify_signer_otp(text, text, inet, text) to service_role;
grant execute on function public.complete_signature(text, jsonb, text, inet, text) to service_role;

notify pgrst, 'reload schema';
