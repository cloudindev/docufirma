-- Idempotent user provisioning (profile + trial credits), shared by the sign-up trigger and the
-- app. A user created before the schema existed (or whose trigger failed) has no profile; the app
-- now calls provision_user() instead of redirecting, which previously caused a redirect loop.

create or replace function public.provision_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  meta jsonb;
  v_first text;
  v_last text;
  v_full text;
  v_locale text;
  v_trial integer;
  v_profile public.profiles;
begin
  select id, email, raw_user_meta_data into v_user from auth.users where id = p_user_id;
  if not found then
    raise exception 'user % not found', p_user_id using errcode = 'P0002';
  end if;

  meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  v_first := nullif(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', '')), '');
  v_last := nullif(trim(coalesce(meta ->> 'last_name', meta ->> 'family_name', '')), '');
  v_full := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  v_locale := case when meta ->> 'locale' in ('es', 'en') then meta ->> 'locale' else 'es' end;

  if v_first is null and v_full is not null then
    v_first := split_part(v_full, ' ', 1);
    v_last := coalesce(v_last, nullif(trim(substr(v_full, char_length(v_first) + 1)), ''));
  end if;

  insert into public.profiles (id, email, first_name, last_name, locale)
  values (v_user.id, coalesce(v_user.email, ''), left(v_first, 80), left(v_last, 120), v_locale)
  on conflict (id) do nothing;

  select coalesce((value #>> '{}')::integer, 0) into v_trial
  from public.app_settings where key = 'trial_credits';

  if coalesce(v_trial, 0) > 0 then
    insert into public.credit_ledger (user_id, kind, amount, pool, note)
    values (v_user.id, 'trial_grant', v_trial, 'pack', 'Welcome trial')
    on conflict do nothing;
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  return v_profile;
end;
$$;

revoke all on function public.provision_user(uuid) from public, anon, authenticated;
grant execute on function public.provision_user(uuid) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.provision_user(new.id);
  return new;
end;
$$;

-- Backfill users that signed up before the schema was applied.
select public.provision_user(u.id)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Make PostgREST pick up the new function signature right away.
notify pgrst, 'reload schema';
