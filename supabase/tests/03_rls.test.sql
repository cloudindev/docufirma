-- Row level security: users only see their own data; service tables are closed.
select tests.set_id('a', tests.create_user('a@example.com'));
select tests.set_id('b', tests.create_user('b@example.com'));

-- User A creates a draft through the API role.
select tests.as_user(tests.id('a'));
insert into public.envelopes (title) values ('Contrato A');
select tests.set_id('ea', (select id from public.envelopes where title = 'Contrato A'));
select tests.assert_eq((select user_id from public.envelopes where id = tests.id('ea')), tests.id('a'), 'user_id defaults to auth.uid()');
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('ea'), 'Eva', 'Ruiz', 'eva@x.com');
insert into public.contacts (first_name, last_name, email) values ('Eva', 'Ruiz', 'eva@x.com');
update public.profiles set first_name = 'Alicia' where id = tests.id('a');
select tests.assert_eq((select first_name from public.profiles where id = tests.id('a')), 'Alicia', 'can update own profile');
select tests.assert_eq((select total from public.get_available_credits(tests.id('a'))), 3, 'can read own balance');

-- Protected columns cannot be written by the user.
select tests.assert_raises(format('update public.profiles set stripe_customer_id = ''cus_x'' where id = %L', tests.id('a')), 'permission denied', 'no stripe id write');
select tests.assert_raises(format('update public.envelopes set status = ''completed'' where id = %L', tests.id('ea')), 'permission denied', 'no status write');
select tests.assert_raises('insert into public.credit_ledger (user_id, kind, amount, pool) values (auth.uid(), ''adjustment'', 100, ''pack'')', 'permission denied', 'no ledger write');
select tests.assert_raises('select token_hash from public.signers', 'permission denied', 'token hash hidden');
select tests.assert_raises('select * from public.signature_evidence', 'permission denied', 'evidence closed');
select tests.assert_raises('select * from public.jobs', 'permission denied', 'jobs closed');
select tests.assert_raises('select * from public.signer_access_tokens', 'permission denied', 'tokens closed');
select tests.assert_raises(format('select public.reserve_credits(%L, %L, array[]::uuid[])', tests.id('a'), tests.id('ea')), 'permission denied', 'no rpc to credit mutations');
select tests.assert_raises(format('select public.send_envelope(%L, %L, ''[]'', ''DF-AAAA-AAAA'', now())', tests.id('ea'), tests.id('a')), 'permission denied', 'no rpc to send');

-- User B sees nothing of A.
select tests.as_user(tests.id('b'));
select tests.assert_eq((select count(*)::int from public.envelopes), 0, 'B sees no envelopes');
select tests.assert_eq((select count(*)::int from public.signers), 0, 'B sees no signers');
select tests.assert_eq((select count(*)::int from public.contacts), 0, 'B sees no contacts');
select tests.assert_eq((select count(*)::int from public.profiles), 1, 'B sees only own profile');
select tests.assert_eq((select count(*)::int from public.credit_ledger), 1, 'B sees only own ledger');
select tests.assert_raises(format('select * from public.get_available_credits(%L)', tests.id('a')), 'forbidden', 'B cannot read A balance');
update public.envelopes set title = 'hacked' where id = tests.id('ea');
insert into public.contacts (first_name, last_name, email) values ('X', 'Y', 'eva@x.com');
select tests.assert_raises(format('insert into public.signers (envelope_id, first_name, last_name, email) values (%L, ''x'', ''y'', ''z@x.com'')', tests.id('ea')), 'row-level security', 'B cannot add signers to A');

select tests.as_postgres();
select tests.assert_eq((select title from public.envelopes where id = tests.id('ea')), 'Contrato A', 'B update had no effect');

-- Anonymous visitors only see the active pack catalog.
select tests.as_anon();
select tests.assert_eq((select count(*)::int from public.credit_packs), 3, 'anon sees packs');
select tests.assert_raises('select * from public.envelopes', 'permission denied', 'anon no envelopes');
select tests.assert_raises('select * from public.profiles', 'permission denied', 'anon no profiles');

-- Non-draft envelopes are read-only for the owner.
select tests.as_postgres();
update public.envelopes set status = 'sent' where id = tests.id('ea');
select tests.as_user(tests.id('a'));
update public.envelopes set title = 'changed' where id = tests.id('ea');
delete from public.signers where envelope_id = tests.id('ea');
select tests.as_postgres();
select tests.assert_eq((select title from public.envelopes where id = tests.id('ea')), 'Contrato A', 'sent envelope immutable');
select tests.assert_eq((select count(*)::int from public.signers where envelope_id = tests.id('ea')), 1, 'sent signers immutable');

-- Events are append-only for everyone.
insert into public.envelope_events (envelope_id, type) values (tests.id('ea'), 'created');
select tests.assert_raises(format('update public.envelope_events set type = ''signed'' where envelope_id = %L', tests.id('ea')), 'append-only', 'no event update');
select tests.assert_raises(format('delete from public.envelope_events where envelope_id = %L', tests.id('ea')), 'append-only', 'no event delete');
