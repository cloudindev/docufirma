-- Credit ledger: priority, expiry, non-accumulation, idempotency, non-negative.
select tests.set_id('u', tests.create_user('credits@example.com'));  -- 3 trial credits (pack pool)
insert into public.envelopes (id, user_id, title) values (gen_random_uuid(), tests.id('u'), 'E') returning tests.set_id('e', id);
insert into public.signers (envelope_id, first_name, last_name, email, order_index)
  select tests.id('e'), 'S', 'N' || g, 's' || g || '@x.com', g from generate_series(1, 14) g;

select tests.as_service();

-- Monthly grant of 10, idempotent per invoice.
select tests.assert(public.grant_monthly_credits(tests.id('u'), 10, now() + interval '20 days', 'in_1'), 'grant inserted');
select tests.assert(not public.grant_monthly_credits(tests.id('u'), 10, now() + interval '20 days', 'in_1'), 'duplicate grant ignored');
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u'))), 10, 'monthly 10');
select tests.assert_eq((select pack_available from public.get_available_credits(tests.id('u'))), 3, 'pack 3 (trial)');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 13, 'total 13');

-- Reserve 12: 10 monthly first, then 2 pack.
select public.reserve_credits(tests.id('u'), tests.id('e'),
  (select array_agg(id order by order_index) from public.signers where envelope_id = tests.id('e') and order_index <= 12));
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u'))), 0, 'monthly used first');
select tests.assert_eq((select pack_available from public.get_available_credits(tests.id('u'))), 1, 'then pack');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 12, '12 reserved');

-- Reserving again for the same signers is a no-op (idempotent).
select public.reserve_credits(tests.id('u'), tests.id('e'),
  (select array_agg(id) from public.signers where envelope_id = tests.id('e') and order_index <= 12));
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'idempotent reserve');

-- Not enough credits for 2 more.
select tests.assert_raises(format(
  'select public.reserve_credits(%L, %L, (select array_agg(id) from public.signers where envelope_id = %L and order_index > 12))',
  tests.id('u'), tests.id('e'), tests.id('e')), 'insufficient_credits', 'cannot overdraw');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'failed reserve changed nothing');

-- Release a monthly reservation -> back to monthly; consume one -> stays used.
select tests.assert(public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 1)), 'released');
select tests.assert(not public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 1)), 'double release ignored');
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u'))), 1, 'monthly returned');
select tests.assert(public.consume_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'consumed');
select tests.assert(not public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'cannot release consumed');
select tests.assert(not public.consume_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 2)), 'double consume ignored');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 10, '10 still reserved');

-- Release of a pack reservation returns to pack.
select tests.assert(public.release_credit((select id from public.signers where envelope_id = tests.id('e') and order_index = 12)), 'released pack');
select tests.assert_eq((select pack_available from public.get_available_credits(tests.id('u'))), 2, 'pack returned');

-- New billing cycle: previous monthly credits do not accumulate.
select tests.as_postgres();
select tests.set_id('u2', tests.create_user('cycle@example.com'));
select tests.as_service();
select public.grant_monthly_credits(tests.id('u2'), 10, now() - interval '1 second', 'in_old');
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u2'))), 0, 'expired cycle ignored');
select public.grant_monthly_credits(tests.id('u2'), 10, now() + interval '30 days', 'in_new');
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u2'))), 10, 'only current cycle');
-- Overlapping future grant (next invoice paid early) replaces, never adds up.
select public.grant_monthly_credits(tests.id('u2'), 10, now() + interval '60 days', 'in_next');
select tests.assert_eq((select monthly_available from public.get_available_credits(tests.id('u2'))), 10, 'no accumulation');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u2'))), 13, '10 monthly + 3 trial');

-- Packs are idempotent per payment.
select tests.assert(public.grant_pack_credits(tests.id('u2'), 25, 'pi_1'), 'pack granted');
select tests.assert(not public.grant_pack_credits(tests.id('u2'), 25, 'pi_1'), 'pack idempotent');
select tests.assert_eq((select pack_available from public.get_available_credits(tests.id('u2'))), 28, '25 + 3 trial');

-- The ledger is append-only.
select tests.as_postgres();
select tests.assert_raises(format('update public.credit_ledger set amount = 99 where user_id = %L', tests.id('u2')), 'append-only', 'no update');
select tests.assert_raises(format('delete from public.credit_ledger where user_id = %L', tests.id('u2')), 'append-only', 'no delete');

-- Direct negative insert is rejected by the safety trigger.
select tests.assert_raises(format(
  'insert into public.credit_ledger (user_id, kind, amount, pool) values (%L, ''adjustment'', -1000, ''pack'')', tests.id('u2')),
  'insufficient_credits', 'never negative');
