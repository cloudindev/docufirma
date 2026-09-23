-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · envelope workflow
-- Every state transition is a single transactional function with row locks
-- (SELECT … FOR UPDATE) so that races (double submit, concurrent signers,
-- cron vs. signer) cannot corrupt state or the credit ledger.
-- All functions are SECURITY DEFINER and executable only by the service role;
-- the app calls them from server code after validating input with zod.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.envelopes add column all_signed_at timestamptz;

-- Access tokens for signers. Only SHA-256(token) is stored; the plaintext token
-- travels exclusively in the email link. A reminder issues a new token; previous
-- links keep working until the envelope expires. signers.token_hash mirrors the latest.
create table public.signer_access_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  signer_id uuid not null references public.signers (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index signer_access_tokens_signer_idx on public.signer_access_tokens (signer_id);

-- ── Internal helpers ─────────────────────────────────────────────────────────
create or replace function public._log_event(
  p_envelope_id uuid, p_signer_id uuid, p_type public.envelope_event_type,
  p_metadata jsonb default '{}'::jsonb, p_ip inet default null, p_user_agent text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.envelope_events (envelope_id, signer_id, type, metadata, ip, user_agent)
  values (p_envelope_id, p_signer_id, p_type, coalesce(p_metadata, '{}'::jsonb), p_ip, left(p_user_agent, 512))
  returning id
$$;

create or replace function public.log_envelope_event(
  p_envelope_id uuid, p_signer_id uuid, p_type public.envelope_event_type,
  p_metadata jsonb default '{}'::jsonb, p_ip inet default null, p_user_agent text default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public._log_event(p_envelope_id, p_signer_id, p_type, p_metadata, p_ip, p_user_agent)
$$;

-- Release every outstanding reservation of an envelope (non-signed signers).
create or replace function public._release_envelope_credits(p_envelope_id uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  s record;
begin
  for s in select id from public.signers where envelope_id = p_envelope_id and status <> 'signed' loop
    if public.release_credit(s.id, p_note) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Resolve a token to its signer, locking signer and envelope. Raises on invalid token.
create or replace function public._lock_signer_by_token(p_token_hash text)
returns table (signer_id uuid, envelope_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.signer_access_tokens;
  v_envelope uuid;
begin
  select * into t from public.signer_access_tokens where token_hash = p_token_hash;
  if not found or t.revoked_at is not null then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  select s.envelope_id into v_envelope from public.signers s where s.id = t.signer_id;
  -- Lock order: envelope first, then signer (same order everywhere to avoid deadlocks).
  perform 1 from public.envelopes e where e.id = v_envelope for update;
  perform 1 from public.signers s where s.id = t.signer_id for update;
  if t.expires_at <= now() then
    raise exception 'token_expired' using errcode = 'P0001';
  end if;
  return query select t.signer_id, v_envelope;
end;
$$;

-- Validates that a signer may act now. Raises a machine-readable error otherwise.
create or replace function public._assert_signer_can_act(p_signer_id uuid)
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
  select * into e from public.envelopes where id = s.envelope_id;

  if e.status = 'canceled' then raise exception 'envelope_canceled' using errcode = 'P0001'; end if;
  if e.status = 'declined' then raise exception 'envelope_declined' using errcode = 'P0001'; end if;
  if e.status = 'expired' or (e.expires_at is not null and e.expires_at <= now()) then
    raise exception 'envelope_expired' using errcode = 'P0001';
  end if;
  if e.status = 'completed' or s.status = 'signed' then
    raise exception 'already_signed' using errcode = 'P0001';
  end if;
  if s.status = 'declined' then raise exception 'already_declined' using errcode = 'P0001'; end if;
  if e.status not in ('sent', 'viewed') then raise exception 'envelope_not_active' using errcode = 'P0001'; end if;
  if s.status not in ('sent', 'viewed') then raise exception 'not_your_turn' using errcode = 'P0001'; end if;
  if e.sequential and exists (
    select 1 from public.signers o
    where o.envelope_id = e.id and o.order_index < s.order_index and o.status <> 'signed'
  ) then
    raise exception 'not_your_turn' using errcode = 'P0001';
  end if;
end;
$$;

-- ── Send ─────────────────────────────────────────────────────────────────────
-- p_tokens: [{ "signer_id": uuid, "token_hash": hex }] for ALL signers. Only the signers
-- that must be notified now (all, or the first one if sequential) get their token stored;
-- their ids are returned so the caller emails exactly those.
create or replace function public.send_envelope(
  p_envelope_id uuid,
  p_user_id uuid,
  p_tokens jsonb,
  p_verification_code text,
  p_expires_at timestamptz,
  p_sender jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.envelopes;
  v_signer_ids uuid[];
  v_docs integer;
  v_notify uuid[];
  v_first_order integer;
  v_hash text;
  v_id uuid;
begin
  select * into e from public.envelopes where id = p_envelope_id for update;
  if not found or e.user_id is distinct from p_user_id then
    raise exception 'envelope_not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'draft' then
    raise exception 'envelope_not_draft' using errcode = 'P0001';
  end if;
  if p_expires_at <= now() then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;

  select count(*) into v_docs from public.documents where envelope_id = p_envelope_id;
  if v_docs = 0 then raise exception 'no_documents' using errcode = 'P0001'; end if;
  if v_docs > 10 then raise exception 'too_many_documents' using errcode = 'P0001'; end if;

  select array_agg(id order by order_index, created_at) into v_signer_ids
  from public.signers where envelope_id = p_envelope_id;
  if v_signer_ids is null then raise exception 'no_signers' using errcode = 'P0001'; end if;
  if array_length(v_signer_ids, 1) > 10 then raise exception 'too_many_signers' using errcode = 'P0001'; end if;

  -- Every signer needs a token hash in the payload.
  if (select count(distinct (t ->> 'signer_id')) from jsonb_array_elements(p_tokens) t
      where (t ->> 'signer_id')::uuid = any (v_signer_ids)) <> array_length(v_signer_ids, 1) then
    raise exception 'tokens_mismatch' using errcode = 'P0001';
  end if;

  perform public.reserve_credits(p_user_id, p_envelope_id, v_signer_ids);

  select min(order_index) into v_first_order from public.signers where envelope_id = p_envelope_id;
  if e.sequential then
    select array_agg(id) into v_notify from (
      select id from public.signers where envelope_id = p_envelope_id
      order by order_index, created_at limit 1
    ) f;
  else
    v_notify := v_signer_ids;
  end if;

  foreach v_id in array v_notify loop
    select t ->> 'token_hash' into v_hash from jsonb_array_elements(p_tokens) t
    where (t ->> 'signer_id')::uuid = v_id;
    insert into public.signer_access_tokens (token_hash, signer_id, expires_at)
    values (v_hash, v_id, p_expires_at);
    update public.signers
      set status = 'sent', sent_at = now(), token_hash = v_hash, token_expires_at = p_expires_at
      where id = v_id;
  end loop;

  update public.envelopes set
    status = 'sent',
    sent_at = now(),
    expires_at = p_expires_at,
    verification_code = p_verification_code,
    sender_name = nullif(p_sender ->> 'name', ''),
    sender_email = nullif(p_sender ->> 'email', ''),
    sender_company = nullif(p_sender ->> 'company', '')
  where id = p_envelope_id;

  perform public._log_event(p_envelope_id, null, 'sent',
    jsonb_build_object('signers', array_length(v_signer_ids, 1), 'sequential', e.sequential));

  return jsonb_build_object('notify', to_jsonb(v_notify), 'signers', to_jsonb(v_signer_ids));
end;
$$;

-- Issue (or rotate) the access token of a signer: next sequential signer or reminder.
create or replace function public.issue_signer_token(p_signer_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.signers;
  e public.envelopes;
begin
  select * into s from public.signers where id = p_signer_id for update;
  select * into e from public.envelopes where id = s.envelope_id;
  if e.status not in ('sent', 'viewed') or s.status in ('signed', 'declined') then
    raise exception 'signer_not_active' using errcode = 'P0001';
  end if;
  insert into public.signer_access_tokens (token_hash, signer_id, expires_at)
  values (p_token_hash, p_signer_id, e.expires_at);
  update public.signers set
    token_hash = p_token_hash,
    token_expires_at = e.expires_at,
    status = case when status = 'pending' then 'sent'::public.signer_status else status end,
    sent_at = coalesce(sent_at, now())
  where id = p_signer_id;
end;
$$;

create or replace function public.record_reminder(p_signer_id uuid, p_resend_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_envelope uuid;
begin
  update public.signers set reminder_count = reminder_count + 1, last_reminder_at = now()
  where id = p_signer_id returning envelope_id into v_envelope;
  perform public._log_event(v_envelope, p_signer_id, 'reminder_sent',
    jsonb_strip_nulls(jsonb_build_object('resend_id', p_resend_id)));
end;
$$;

-- ── Signer opens the link ────────────────────────────────────────────────────
create or replace function public.mark_signer_viewed(p_token_hash text, p_ip inet default null, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
  s public.signers;
  v_first boolean := false;
begin
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._assert_signer_can_act(v_signer);
  select * into s from public.signers where id = v_signer;

  if s.status = 'sent' then
    update public.signers set status = 'viewed', viewed_at = now() where id = v_signer;
    update public.envelopes set status = 'viewed' where id = v_envelope and status = 'sent';
    v_first := true;
  end if;

  perform public._log_event(v_envelope, v_signer, 'opened', jsonb_build_object('first', v_first), p_ip, p_user_agent);
  return jsonb_build_object('signer_id', v_signer, 'envelope_id', v_envelope, 'first_view', v_first);
end;
$$;

-- document_viewed / scrolled_to_end from the signer view.
create or replace function public.record_signer_event(
  p_token_hash text, p_type public.envelope_event_type, p_metadata jsonb default '{}'::jsonb,
  p_ip inet default null, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
begin
  if p_type not in ('document_viewed', 'scrolled_to_end', 'downloaded') then
    raise exception 'event_not_allowed' using errcode = 'P0001';
  end if;
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._log_event(v_envelope, v_signer, p_type, p_metadata, p_ip, p_user_agent);
end;
$$;

-- ── Sign ─────────────────────────────────────────────────────────────────────
-- p_evidence: signature_evidence columns as JSON (paths already uploaded to Storage).
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

  insert into public.signature_evidence (
    signer_id, envelope_id, biometric_data_path, biometric_sha256, biometric_key_id,
    signature_image_path, signature_image_sha256, stroke_count, duration_ms, points_count,
    device_type, user_agent, ip, geo_country, geo_region, geo_city, screen_w, screen_h,
    pointer_type, pressure_supported, timezone, client_time, consent_text_version
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
    p_consent_version
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

-- ── Decline ──────────────────────────────────────────────────────────────────
create or replace function public.decline_signature(
  p_token_hash text, p_reason text default null, p_ip inet default null, p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signer uuid;
  v_envelope uuid;
  v_released integer;
begin
  select l.signer_id, l.envelope_id into v_signer, v_envelope from public._lock_signer_by_token(p_token_hash) l;
  perform public._assert_signer_can_act(v_signer);

  update public.signers set status = 'declined', declined_at = now(), decline_reason = nullif(left(trim(p_reason), 1000), '')
  where id = v_signer;
  update public.envelopes set status = 'declined', declined_at = now() where id = v_envelope;
  v_released := public._release_envelope_credits(v_envelope, 'declined');
  perform public._log_event(v_envelope, v_signer, 'declined',
    jsonb_build_object('released_credits', v_released), p_ip, p_user_agent);

  return jsonb_build_object('signer_id', v_signer, 'envelope_id', v_envelope, 'released', v_released);
end;
$$;

-- ── Sender actions ───────────────────────────────────────────────────────────
create or replace function public.cancel_envelope(p_envelope_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.envelopes;
  v_released integer;
begin
  select * into e from public.envelopes where id = p_envelope_id for update;
  if not found or e.user_id is distinct from p_user_id then
    raise exception 'envelope_not_found' using errcode = 'P0002';
  end if;
  if e.status not in ('sent', 'viewed') or e.all_signed_at is not null then
    raise exception 'envelope_not_cancelable' using errcode = 'P0001';
  end if;
  update public.envelopes set status = 'canceled', canceled_at = now() where id = p_envelope_id;
  update public.signer_access_tokens t set revoked_at = now()
    from public.signers s where s.id = t.signer_id and s.envelope_id = p_envelope_id and t.revoked_at is null;
  v_released := public._release_envelope_credits(p_envelope_id, 'canceled');
  perform public._log_event(p_envelope_id, null, 'canceled', jsonb_build_object('released_credits', v_released));
  return jsonb_build_object('released', v_released);
end;
$$;

create or replace function public.delete_draft_envelope(p_envelope_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.envelopes;
begin
  select * into e from public.envelopes where id = p_envelope_id for update;
  if not found or e.user_id is distinct from p_user_id then
    raise exception 'envelope_not_found' using errcode = 'P0002';
  end if;
  if e.status <> 'draft' then
    raise exception 'envelope_not_draft' using errcode = 'P0001';
  end if;
  perform set_config('docufirma.allow_purge', 'on', true);
  delete from public.envelopes where id = p_envelope_id;
end;
$$;

-- Envelope closure finished (signed PDFs + evidence generated).
create or replace function public.mark_envelope_completed(p_envelope_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.envelopes;
begin
  select * into e from public.envelopes where id = p_envelope_id for update;
  if e.status = 'completed' then
    return false;
  end if;
  if e.all_signed_at is null then
    raise exception 'not_all_signed' using errcode = 'P0001';
  end if;
  update public.envelopes set status = 'completed', completed_at = now() where id = p_envelope_id;
  perform public._log_event(p_envelope_id, null, 'completed', '{}'::jsonb);
  return true;
end;
$$;

-- ── Cron: expiration ─────────────────────────────────────────────────────────
create or replace function public.expire_due_envelopes(p_limit integer default 100)
returns table (envelope_id uuid, released integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_released integer;
begin
  for e in
    select id from public.envelopes
    where status in ('sent', 'viewed') and expires_at <= now() and all_signed_at is null
    order by expires_at
    limit p_limit
    for update skip locked
  loop
    update public.envelopes set status = 'expired', expired_at = now() where id = e.id;
    v_released := public._release_envelope_credits(e.id, 'expired');
    perform public._log_event(e.id, null, 'expired', jsonb_build_object('released_credits', v_released));
    envelope_id := e.id;
    released := v_released;
    return next;
  end loop;
end;
$$;

-- ── Account deletion (GDPR art. 17) ──────────────────────────────────────────
-- Deletes personal data and everything not needed for legal defence. Completed
-- envelopes are detached from the account and kept until the retention period ends
-- (art. 17.3.e GDPR: establishment, exercise or defence of legal claims).
-- Returns the storage paths the caller must delete.
create or replace function public.delete_user_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_paths jsonb;
begin
  select * into p from public.profiles where id = p_user_id for update;
  if not found then
    return jsonb_build_object('paths', '[]'::jsonb);
  end if;

  perform set_config('docufirma.allow_purge', 'on', true);
  perform set_config('docufirma.allow_event_anonymization', 'on', true);

  -- Storage objects of envelopes that are deleted (non-completed).
  select coalesce(jsonb_agg(path), '[]'::jsonb) into v_paths from (
    select 'originals/' || d.original_path as path
      from public.documents d join public.envelopes e on e.id = d.envelope_id
      where e.user_id = p_user_id and e.status <> 'completed'
    union all
    select 'evidence/' || se.biometric_data_path
      from public.signature_evidence se join public.envelopes e on e.id = se.envelope_id
      where e.user_id = p_user_id and e.status <> 'completed' and se.biometric_data_path is not null
    union all
    select 'evidence/' || se.signature_image_path
      from public.signature_evidence se join public.envelopes e on e.id = se.envelope_id
      where e.user_id = p_user_id and e.status <> 'completed' and se.signature_image_path is not null
    union all
    select 'branding/' || p.logo_path where p.logo_path is not null
  ) x;

  delete from public.envelopes where user_id = p_user_id and status <> 'completed';

  -- Sender-side events of retained envelopes lose their network identifiers.
  update public.envelope_events ev set ip = null, user_agent = null
    from public.envelopes e
    where e.id = ev.envelope_id and e.user_id = p_user_id and ev.signer_id is null;

  update public.envelopes set sender_email = null where user_id = p_user_id;

  insert into public.deleted_accounts (user_id, email_sha256, stripe_customer_id)
  values (p_user_id, encode(extensions.digest(lower(p.email), 'sha256'), 'hex'), p.stripe_customer_id);

  delete from public.credit_ledger where user_id = p_user_id;
  delete from public.profiles where id = p_user_id; -- cascades contacts, subscriptions; envelopes.user_id -> null

  return jsonb_build_object('paths', v_paths);
end;
$$;
