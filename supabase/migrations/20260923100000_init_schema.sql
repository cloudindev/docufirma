-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · core schema
-- Enums, tables, updated_at triggers and indexes. RLS lives in *_rls.sql,
-- credit ledger logic in *_credits.sql, envelope workflow in *_envelopes.sql.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto with schema extensions;

-- ── Enums ────────────────────────────────────────────────────────────────────
create type public.envelope_status as enum (
  'draft', 'sent', 'viewed', 'completed', 'declined', 'expired', 'canceled'
);

create type public.signer_status as enum ('pending', 'sent', 'viewed', 'signed', 'declined');

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
);

create type public.credit_kind as enum (
  'monthly_grant', 'pack_purchase', 'trial_grant', 'reserve', 'consume', 'release', 'adjustment'
);

create type public.credit_pool as enum ('monthly', 'pack');

create type public.tsa_status as enum ('pending', 'granted', 'failed');

create type public.signed_artifact_kind as enum ('document', 'evidence');

create type public.envelope_event_type as enum (
  'created', 'sent', 'email_sent', 'email_delivered', 'email_failed', 'opened', 'document_viewed',
  'scrolled_to_end', 'consent_accepted', 'signed', 'declined', 'reminder_sent', 'completed',
  'expired', 'canceled', 'tsa_granted', 'tsa_failed', 'downloaded'
);

create type public.job_status as enum ('pending', 'running', 'done', 'failed');

-- ── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── App settings (small key/value store editable by operators) ───────────────
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('trial_credits', '3'::jsonb),
  ('monthly_credits', '10'::jsonb)
on conflict (key) do nothing;

-- ── Profiles (1:1 with auth.users) ───────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company_name text,
  tax_id text,
  locale text not null default 'es' check (locale in ('es', 'en')),
  logo_path text,
  stripe_customer_id text unique,
  onboarding_completed boolean not null default false,
  notify_on_view boolean not null default true,
  notify_on_complete boolean not null default true,
  notify_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_len check (char_length(first_name) <= 80),
  constraint profiles_last_name_len check (char_length(last_name) <= 120),
  constraint profiles_company_len check (char_length(company_name) <= 160),
  constraint profiles_tax_id_len check (char_length(tax_id) <= 32)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Subscriptions (mirror of Stripe) ─────────────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text not null unique,
  status public.subscription_status not null,
  price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_user_idx on public.subscriptions (user_id, status);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── Credit packs catalog ─────────────────────────────────────────────────────
create table public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_es text not null,
  name_en text not null,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'eur',
  stripe_price_id text unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger credit_packs_updated_at before update on public.credit_packs
  for each row execute function public.set_updated_at();

-- ── Envelopes ────────────────────────────────────────────────────────────────
create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: completed envelopes outlive a deleted account for the legal retention period.
  user_id uuid references public.profiles (id) on delete set null,
  title text not null default '',
  message text,
  status public.envelope_status not null default 'draft',
  locale text not null default 'es' check (locale in ('es', 'en')),
  sequential boolean not null default false,
  reminder_days integer not null default 3 check (reminder_days between 0 and 30),
  expires_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  canceled_at timestamptz,
  expired_at timestamptz,
  verification_code text unique,
  -- Snapshot of the sender identity at send time (emails, evidence, verification).
  sender_name text,
  sender_email text,
  sender_company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint envelopes_title_len check (char_length(title) <= 200),
  constraint envelopes_message_len check (char_length(message) <= 2000),
  constraint envelopes_verification_code_format
    check (verification_code is null or verification_code ~ '^DF-[0-9A-Z]{4}-[0-9A-Z]{4}$')
);

create index envelopes_user_status_idx on public.envelopes (user_id, status, created_at desc);
create index envelopes_expiry_idx on public.envelopes (expires_at) where status in ('sent', 'viewed');
create trigger envelopes_updated_at before update on public.envelopes
  for each row execute function public.set_updated_at();

-- ── Documents (original files of an envelope) ───────────────────────────────
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  name text not null,
  original_path text not null,
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  source_mime_type text,
  mime_type text not null default 'application/pdf',
  page_count integer not null check (page_count > 0),
  size_bytes bigint not null check (size_bytes > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_name_len check (char_length(name) <= 255)
);

create index documents_envelope_idx on public.documents (envelope_id, order_index);
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ── Signers ──────────────────────────────────────────────────────────────────
create table public.signers (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  order_index integer not null default 0,
  status public.signer_status not null default 'pending',
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  consent_accepted_at timestamptz,
  consent_text_version text,
  reminder_count integer not null default 0,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signers_first_name_len check (char_length(first_name) between 1 and 80),
  constraint signers_last_name_len check (char_length(last_name) between 1 and 120),
  constraint signers_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  constraint signers_decline_reason_len check (char_length(decline_reason) <= 1000)
);

create unique index signers_envelope_email_uidx on public.signers (envelope_id, lower(email));
create index signers_envelope_idx on public.signers (envelope_id, order_index);
create index signers_reminder_idx on public.signers (status, last_reminder_at) where status in ('sent', 'viewed');
create trigger signers_updated_at before update on public.signers
  for each row execute function public.set_updated_at();

-- ── Signature evidence (biometrics + context). Service role only. ───────────
create table public.signature_evidence (
  id uuid primary key default gen_random_uuid(),
  signer_id uuid not null unique references public.signers (id) on delete cascade,
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  biometric_data_path text,
  biometric_sha256 text not null check (biometric_sha256 ~ '^[0-9a-f]{64}$'),
  biometric_key_id text,
  signature_image_path text,
  signature_image_sha256 text,
  stroke_count integer not null,
  duration_ms integer not null,
  points_count integer not null,
  device_type text,
  user_agent text,
  ip inet,
  geo_country text,
  geo_region text,
  geo_city text,
  screen_w integer,
  screen_h integer,
  pointer_type text check (pointer_type in ('pen', 'touch', 'mouse')),
  pressure_supported boolean not null default false,
  timezone text,
  client_time timestamptz,
  server_time timestamptz not null default now(),
  consent_text_version text,
  created_at timestamptz not null default now()
);

create index signature_evidence_envelope_idx on public.signature_evidence (envelope_id);

-- ── Signed artifacts (signed PDFs + evidence certificate) and their timestamps
create table public.signed_documents (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  kind public.signed_artifact_kind not null default 'document',
  document_id uuid references public.documents (id) on delete cascade,
  signed_path text not null,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint,
  -- Evidence certificate of the envelope (same for every document row, kept for convenience)
  evidence_pdf_path text,
  evidence_sha256 text,
  tsa_provider text check (tsa_provider in ('MENSATEK', 'FNMT', 'TEST')),
  tsq_path text,
  tsr_path text,
  tsa_serial text,
  tsa_gen_time timestamptz,
  tsa_policy_oid text,
  tsa_name text,
  tsa_hash_alg text,
  tsa_status public.tsa_status not null default 'pending',
  tsa_error text,
  tsa_attempts integer not null default 0,
  tsa_next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signed_documents_kind_doc check (
    (kind = 'document' and document_id is not null) or (kind = 'evidence' and document_id is null)
  )
);

create unique index signed_documents_document_uidx on public.signed_documents (document_id) where kind = 'document';
create unique index signed_documents_evidence_uidx on public.signed_documents (envelope_id) where kind = 'evidence';
create index signed_documents_sha_idx on public.signed_documents (signed_sha256);
create index signed_documents_tsa_retry_idx on public.signed_documents (tsa_status, tsa_next_attempt_at)
  where tsa_status <> 'granted';
create trigger signed_documents_updated_at before update on public.signed_documents
  for each row execute function public.set_updated_at();

-- ── Envelope events: immutable audit trail (append-only) ────────────────────
create table public.envelope_events (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  signer_id uuid references public.signers (id) on delete set null,
  type public.envelope_event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index envelope_events_envelope_idx on public.envelope_events (envelope_id, created_at);
create index envelope_events_signer_idx on public.envelope_events (signer_id, type);

-- Updates/deletes are rejected unless a privileged function explicitly opts in for
-- the current transaction (GDPR anonymisation, account deletion, retention purge).
create or replace function public.envelope_events_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('docufirma.allow_purge', true), '') = 'on' then
      return old;
    end if;
    raise exception 'envelope_events is append-only (delete rejected)' using errcode = '42501';
  end if;

  -- UPDATE: only anonymisation of ip / user_agent is ever allowed.
  if coalesce(current_setting('docufirma.allow_event_anonymization', true), '') = 'on'
     and new.id = old.id and new.envelope_id = old.envelope_id and new.type = old.type
     and new.created_at = old.created_at and new.ip is null and new.user_agent is null
  then
    return new;
  end if;
  -- ON DELETE SET NULL of signer_id during a purge is allowed as well.
  if coalesce(current_setting('docufirma.allow_purge', true), '') = 'on' then
    return new;
  end if;
  raise exception 'envelope_events is append-only (update rejected)' using errcode = '42501';
end;
$$;

create trigger envelope_events_append_only
  before update or delete on public.envelope_events
  for each row execute function public.envelope_events_guard();

-- ── Contacts (sender address book) ───────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_first_name_len check (char_length(first_name) between 1 and 80),
  constraint contacts_last_name_len check (char_length(last_name) between 1 and 120),
  constraint contacts_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)
);

create unique index contacts_user_email_uidx on public.contacts (user_id, lower(email));
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- ── Stripe webhook idempotency ───────────────────────────────────────────────
create table public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

-- ── Background jobs (simple Postgres queue) ─────────────────────────────────
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.job_status not null default 'pending',
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  last_error text,
  locked_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_due_idx on public.jobs (type, status, run_at) where status in ('pending', 'running');
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ── Rate limiting fallback (when Upstash is not configured) ────────────────
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create index rate_limits_window_idx on public.rate_limits (window_start);

-- ── Deleted accounts (accounting reconciliation only; no personal data) ─────
create table public.deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_sha256 text not null,
  stripe_customer_id text,
  deleted_at timestamptz not null default now()
);
