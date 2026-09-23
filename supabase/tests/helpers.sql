-- Test helpers (only created in throwaway test databases).
create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.create_user(p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data, email_confirmed_at)
  values (p_email, p_meta, now()) returning id into v_id;
  return v_id;
end $$;

-- Impersonate a signed-in user (like PostgREST does with the JWT).
create or replace function tests.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;

create or replace function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set role anon';
end $$;

create or replace function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  execute 'set role service_role';
end $$;

create or replace function tests.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', false);
end $$;

create or replace function tests.assert(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'ASSERTION FAILED: %', p_msg;
  end if;
end $$;

create or replace function tests.assert_eq(p_actual anyelement, p_expected anyelement, p_msg text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', p_msg, p_expected, p_actual;
  end if;
end $$;

-- Runs p_sql and asserts it raises an error whose message contains p_match.
create or replace function tests.assert_raises(p_sql text, p_match text, p_msg text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_match in sqlerrm) > 0 then
      return;
    end if;
    raise exception 'ASSERTION FAILED: % (expected error containing "%", got "%")', p_msg, p_match, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (expected an error containing "%")', p_msg, p_match;
end $$;

create or replace function tests.id(p_key text) returns uuid language sql stable as $$
  select current_setting('tests.' || p_key)::uuid
$$;

create or replace function tests.set_id(p_key text, p_value uuid) returns uuid language sql as $$
  select set_config('tests.' || p_key, p_value::text, false)::uuid
$$;

grant execute on all functions in schema tests to public;
