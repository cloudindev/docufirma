-- Credit ledger (single pool since D-039): reserve, release, consume, idempotency, non-negative.
select tests.set_id('u', tests.create_user('credits@example.com'));  -- 5 welcome credits
insert into public.envelopes (id, user_id, title) values (gen_random_uuid(), tests.id('u'), 'E') returning tests.set_id('e', id);
insert into public.signers (envelope_id, first_name, last_name, email, order_index)
  select tests.id('e'), 'S', 'N' || g, 's' || g || '@x.com', g from generate_series(1, 9) g;

select tests.as_service();
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 5, 'welcome 5');

-- Monthly credits no longer exist.
select tests.assert_eq((select count(*)::int from pg_proc where proname = 'grant_monthly_credits'), 0, 'no monthly grant function');
select tests.as_postgres();
select tests.assert_raises(format(
  'insert into public.credit_ledger (user_id, kind, amount, pool, expires_at) values (%L, ''monthly_grant'', 10, ''monthly'', now() + interval ''1 day'')',
  tests.id('u')), 'credit_ledger_pack_only', 'monthly rows rejected');
select tests.as_service();

-- A pack of 25 → 30 available.
select tests.assert(public.grant_pack_credits(tests.id('u'), 25, 'pi_0'), 'pack granted');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 30, 'welcome + pack');

-- Reserve 8.
select public.reserve_credits(tests.id('u'), tests.id('e'),
  (select array_agg(id order by order_index) from public.signers where envelope_id = tests.id('e') and order_index <= 8));
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 22, '8 reserved');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 8, 'reserved count');

-- Reserving again for the same signers is a no-op (idempotent).
select public.reserve_credits(tests.id('u'), tests.id('e'),
  (select array_agg(id) from public.signers where envelope_id = tests.id('e') and order_index <= 8));
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 22, 'idempotent reserve');

-- Release one → back; consume one → stays used.
select tests.assert(public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 1)), 'released');
select tests.assert(not public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 1)), 'double release ignored');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 23, 'credit returned');
select tests.assert(public.consume_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'consumed');
select tests.assert(not public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'cannot release consumed');
select tests.assert(not public.consume_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'double consume ignored');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 6, '6 still reserved');

-- Not enough credits.
select tests.as_postgres();
select tests.set_id('u2', tests.create_user('poor@example.com'));
insert into public.envelopes (id, user_id, title) values (gen_random_uuid(), tests.id('u2'), 'P') returning tests.set_id('e2', id);
insert into public.signers (envelope_id, first_name, last_name, email, order_index)
  select tests.id('e2'), 'S', 'N' || g, 'p' || g || '@x.com', g from generate_series(1, 6) g;
select tests.as_service();
select tests.assert_raises(format(
  'select public.reserve_credits(%L, %L, (select array_agg(id) from public.signers where envelope_id = %L))',
  tests.id('u2'), tests.id('e2'), tests.id('e2')), 'insufficient_credits', 'cannot overdraw');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u2'))), 5, 'failed reserve changed nothing');

-- Packs are idempotent per payment.
select tests.assert(public.grant_pack_credits(tests.id('u2'), 25, 'pi_1'), 'pack granted');
select tests.assert(not public.grant_pack_credits(tests.id('u2'), 25, 'pi_1'), 'pack idempotent');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u2'))), 30, '25 + 5 welcome');

-- The ledger is append-only.
select tests.as_postgres();
select tests.assert_raises(format('update public.credit_ledger set amount = 99 where user_id = %L', tests.id('u2')), 'append-only', 'no update');
select tests.assert_raises(format('delete from public.credit_ledger where user_id = %L', tests.id('u2')), 'append-only', 'no delete');

-- Direct negative insert is rejected by the safety trigger.
select tests.assert_raises(format(
  'insert into public.credit_ledger (user_id, kind, amount, pool) values (%L, ''adjustment'', -1000, ''pack'')', tests.id('u2')),
  'insufficient_credits', 'never negative');
