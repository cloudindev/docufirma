-- Paid SMS: purchase, consumption per code, refunds, catalog and permissions.
select tests.set_id('u', tests.create_user('sms@example.com'));
select tests.set_id('v', tests.create_user('other-sms@example.com'));
insert into public.envelopes (user_id, title) values (tests.id('u'), 'SMS') returning tests.set_id('e', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('e'), 'doc.pdf', 'u/e/doc.pdf', repeat('a', 64), 1, 100);
insert into public.signers (envelope_id, first_name, last_name, email, phone, require_sms_otp)
  values (tests.id('e'), 'Su', 'Sana', 'su@x.com', '+34622222222', true) returning tests.set_id('s', id);

select tests.as_service();
select public.send_envelope(tests.id('e'), tests.id('u'),
  jsonb_build_array(jsonb_build_object('signer_id', tests.id('s'), 'token_hash', repeat('7', 64))),
  'DF-SMS0-0001', now() + interval '30 days', '{}');

-- Catalog: SMS packs exist and are separate from signature packs.
select tests.assert_eq((select count(*)::int from public.credit_packs where kind = 'sms' and active), 3, 'three SMS packs');
select tests.assert_eq((select count(*)::int from public.credit_packs where kind = 'signatures'), 3, 'signature packs untouched');

-- Without balance no code is sent.
select tests.assert_eq(public.get_sms_balance(tests.id('u')), 0, 'starts at zero');
select tests.assert_raises($q$select public.request_signer_otp(repeat('7', 64), repeat('1', 64))$q$, 'sms_no_credits', 'no SMS without balance');

-- Purchase (idempotent per payment) and consumption.
select tests.assert_eq(public.grant_sms_pack(tests.id('u'), 100, 'pi_sms_1', (select id from public.credit_packs where slug = 'sms-100')), true, 'granted');
select tests.assert_eq(public.grant_sms_pack(tests.id('u'), 100, 'pi_sms_1'), false, 'webhook retry grants nothing');
select tests.assert_eq(public.get_sms_balance(tests.id('u')), 100, 'balance after purchase');
select public.request_signer_otp(repeat('7', 64), repeat('1', 64));
select public.request_signer_otp(repeat('7', 64), repeat('2', 64));
select tests.assert_eq(public.get_sms_balance(tests.id('u')), 98, 'one SMS per code');
select tests.assert_eq((select count(*)::int from public.sms_ledger where signer_id = tests.id('s') and kind = 'consume'), 2, 'consumptions linked to the signer');

-- Refund of a failed send, only once per consumption.
select public.refund_signer_sms(tests.id('s'), 'provider error');
select public.refund_signer_sms(tests.id('s'), 'provider error');
select tests.assert_eq(public.get_sms_balance(tests.id('u')), 99, 'refunded once');

-- Append-only.
select tests.assert_raises(format($q$update public.sms_ledger set amount = 1000 where user_id = %L$q$, tests.id('u')), 'append-only', 'cannot rewrite the ledger');

-- Owners read their own balance and rows; nobody else.
select tests.as_user(tests.id('u'));
select tests.assert_eq(public.get_sms_balance(tests.id('u')), 99, 'owner reads balance');
select tests.assert((select count(*) from public.sms_ledger) > 0, 'owner reads own rows');
select tests.as_user(tests.id('v'));
select tests.assert_raises(format($q$select public.get_sms_balance(%L)$q$, tests.id('u')), 'forbidden', 'others cannot read it');
select tests.assert_eq((select count(*)::int from public.sms_ledger), 0, 'others see no rows');
select tests.assert_raises($q$select public.adjust_sms_credits(auth.uid(), 1000, 'free')$q$, 'permission denied', 'users cannot grant SMS');
