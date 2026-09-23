-- Draft setting: number of days the signing links stay valid once sent.
-- expires_at is computed from it by send_envelope's caller at send time.
alter table public.envelopes
  add column expiry_days integer not null default 30 check (expiry_days between 1 and 120);

grant insert (expiry_days), update (expiry_days) on public.envelopes to authenticated;
