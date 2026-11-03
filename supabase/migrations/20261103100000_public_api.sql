-- Public REST API (D-041): API keys and outgoing webhooks. Only Pro subscribers can use them
-- (checked by the app on every request). Secrets never reach the browser through RLS: keys are
-- stored as SHA-256 hashes and the webhook secret column is not granted to `authenticated`.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  prefix text not null check (char_length(prefix) <= 24),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id, created_at desc);

alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
grant select (id, user_id, name, prefix, created_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
create policy api_keys_select_own on public.api_keys
  for select to authenticated using (user_id = (select auth.uid()));

create table public.webhook_endpoints (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 500),
  secret text not null check (char_length(secret) between 20 and 100),
  enabled boolean not null default true,
  last_delivery_at timestamptz,
  last_status integer,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger webhook_endpoints_updated_at before update on public.webhook_endpoints
  for each row execute function public.set_updated_at();

alter table public.webhook_endpoints enable row level security;
revoke all on public.webhook_endpoints from anon, authenticated;
grant select (user_id, url, enabled, last_delivery_at, last_status, last_error, created_at, updated_at)
  on public.webhook_endpoints to authenticated;
grant all on public.webhook_endpoints to service_role;
create policy webhook_endpoints_select_own on public.webhook_endpoints
  for select to authenticated using (user_id = (select auth.uid()));

notify pgrst, 'reload schema';
