-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · Row Level Security and privileges
-- Browser clients (anon / authenticated) only ever see their own data.
-- The signer view never uses user RLS: it goes through server code with the
-- service role after validating the token.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS everywhere.
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_packs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.envelopes enable row level security;
alter table public.documents enable row level security;
alter table public.signers enable row level security;
alter table public.signer_access_tokens enable row level security;
alter table public.signature_evidence enable row level security;
alter table public.signed_documents enable row level security;
alter table public.envelope_events enable row level security;
alter table public.contacts enable row level security;
alter table public.stripe_events enable row level security;
alter table public.jobs enable row level security;
alter table public.rate_limits enable row level security;
alter table public.deleted_accounts enable row level security;

-- Defence in depth: remove the blanket grants Supabase gives to API roles,
-- then grant back only what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Owner helper used by child-table policies.
create or replace function public.owns_envelope(p_envelope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.envelopes e where e.id = p_envelope_id and e.user_id = auth.uid()
  )
$$;

create or replace function public.owns_draft_envelope(p_envelope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.envelopes e
    where e.id = p_envelope_id and e.user_id = auth.uid() and e.status = 'draft'
  )
$$;

grant execute on function public.owns_envelope(uuid), public.owns_draft_envelope(uuid) to authenticated;
grant execute on function public.get_available_credits(uuid) to authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────────
grant select on public.profiles to authenticated;
grant update (first_name, last_name, company_name, tax_id, locale, onboarding_completed,
              notify_on_view, notify_on_complete, notify_marketing)
  on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── subscriptions / credit ledger (read-only for owners) ─────────────────────
grant select on public.subscriptions, public.credit_ledger to authenticated;

create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated using (user_id = (select auth.uid()));

-- ── credit packs: public catalog of active packs ─────────────────────────────
grant select on public.credit_packs to anon, authenticated;
create policy credit_packs_select_active on public.credit_packs
  for select to anon, authenticated using (active);

-- ── envelopes ────────────────────────────────────────────────────────────────
grant select on public.envelopes to authenticated;
grant insert (title, message, locale, sequential, reminder_days, expires_at) on public.envelopes to authenticated;
grant update (title, message, locale, sequential, reminder_days, expires_at) on public.envelopes to authenticated;

create policy envelopes_select_own on public.envelopes
  for select to authenticated using (user_id = (select auth.uid()));
-- user_id defaults to the caller; drafts only.
create policy envelopes_insert_own on public.envelopes
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'draft');
create policy envelopes_update_own_draft on public.envelopes
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()) and status = 'draft');

alter table public.envelopes alter column user_id set default auth.uid();

-- ── documents / signers (children of an envelope) ───────────────────────────
grant select on public.documents to authenticated;
grant update (name, order_index) on public.documents to authenticated;
grant delete on public.documents to authenticated;

create policy documents_select_own on public.documents
  for select to authenticated using (public.owns_envelope(envelope_id));
create policy documents_update_own_draft on public.documents
  for update to authenticated
  using (public.owns_draft_envelope(envelope_id)) with check (public.owns_draft_envelope(envelope_id));
create policy documents_delete_own_draft on public.documents
  for delete to authenticated using (public.owns_draft_envelope(envelope_id));

-- signers: token_hash / token_expires_at are never exposed to browsers.
grant select (id, envelope_id, first_name, last_name, email, order_index, status, sent_at, viewed_at,
              signed_at, declined_at, decline_reason, reminder_count, last_reminder_at,
              created_at, updated_at)
  on public.signers to authenticated;
grant insert (envelope_id, first_name, last_name, email, order_index) on public.signers to authenticated;
grant update (first_name, last_name, email, order_index) on public.signers to authenticated;
grant delete on public.signers to authenticated;

create policy signers_select_own on public.signers
  for select to authenticated using (public.owns_envelope(envelope_id));
create policy signers_insert_own_draft on public.signers
  for insert to authenticated with check (public.owns_draft_envelope(envelope_id));
create policy signers_update_own_draft on public.signers
  for update to authenticated
  using (public.owns_draft_envelope(envelope_id)) with check (public.owns_draft_envelope(envelope_id));
create policy signers_delete_own_draft on public.signers
  for delete to authenticated using (public.owns_draft_envelope(envelope_id));

-- ── signed documents / events (read-only for owners) ─────────────────────────
grant select on public.signed_documents, public.envelope_events to authenticated;

create policy signed_documents_select_own on public.signed_documents
  for select to authenticated using (public.owns_envelope(envelope_id));
create policy envelope_events_select_own on public.envelope_events
  for select to authenticated using (public.owns_envelope(envelope_id));

-- ── contacts ─────────────────────────────────────────────────────────────────
grant select, delete on public.contacts to authenticated;
grant insert (first_name, last_name, email) on public.contacts to authenticated;
grant update (first_name, last_name, email) on public.contacts to authenticated;

alter table public.contacts alter column user_id set default auth.uid();

create policy contacts_select_own on public.contacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy contacts_insert_own on public.contacts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy contacts_update_own on public.contacts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy contacts_delete_own on public.contacts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── service-role-only tables: RLS on, no policies ────────────────────────────
-- app_settings, signer_access_tokens, signature_evidence, stripe_events, jobs,
-- rate_limits, deleted_accounts. (Nothing granted to anon/authenticated.)

-- New objects created later in public must not leak to API roles by default.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
