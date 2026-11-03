-- Public API: keys and webhook endpoints are readable by their owner only, never their secrets.
select tests.set_id('u', tests.create_user('api@example.com'));
select tests.set_id('v', tests.create_user('other-api@example.com'));

select tests.as_service();
insert into public.api_keys (user_id, name, prefix, key_hash)
values (tests.id('u'), 'Producción', 'df_live_abcd', repeat('a', 64));
insert into public.webhook_endpoints (user_id, url, secret)
values (tests.id('u'), 'https://example.com/hooks/docufirma', 'dfwh_' || repeat('s', 40));

-- Hashes are unique and well-formed.
select tests.assert_raises(format(
  'insert into public.api_keys (user_id, name, prefix, key_hash) values (%L, ''x'', ''df_live_x'', %L)',
  tests.id('v'), repeat('a', 64)), 'duplicate key', 'hash unique');
select tests.assert_raises(format(
  'insert into public.api_keys (user_id, name, prefix, key_hash) values (%L, ''x'', ''df_live_x'', ''nothex'')',
  tests.id('v')), 'api_keys_key_hash_check', 'hash format');

-- Owner sees metadata, never the hash or the secret.
select tests.as_user(tests.id('u'));
select tests.assert_eq((select count(*)::int from public.api_keys), 1, 'owner sees own key');
select tests.assert_eq((select prefix from public.api_keys), 'df_live_abcd', 'prefix visible');
select tests.assert_raises('select key_hash from public.api_keys', 'permission denied', 'hash hidden');
select tests.assert_eq((select url from public.webhook_endpoints), 'https://example.com/hooks/docufirma', 'webhook url visible');
select tests.assert_raises('select secret from public.webhook_endpoints', 'permission denied', 'secret hidden');
select tests.assert_raises(format('update public.api_keys set revoked_at = now() where user_id = %L', tests.id('u')),
  'permission denied', 'no direct writes');

-- Other users see nothing.
select tests.as_user(tests.id('v'));
select tests.assert_eq((select count(*)::int from public.api_keys), 0, 'B sees no keys of A');
select tests.assert_eq((select count(*)::int from public.webhook_endpoints), 0, 'B sees no webhook of A');
