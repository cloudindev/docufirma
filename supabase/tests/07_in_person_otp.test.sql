-- In-person signing and SMS one-time codes.
select tests.set_id('u', tests.create_user('host@example.com', '{"first_name":"Hana","last_name":"Host"}'));
select tests.set_id('other', tests.create_user('other@example.com'));
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Presencial') returning tests.set_id('e', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('e'), 'doc.pdf', 'u/e/doc.pdf', repeat('a', 64), 1, 100);
insert into public.signers (envelope_id, first_name, last_name, email, order_index, delivery, phone, require_sms_otp) values
  (tests.id('e'), 'Pres', 'Encial', 'pres@x.com', 0, 'in_person', '+34600123456', true),
  (tests.id('e'), 'Re', 'Moto', 'remoto@x.com', 1, 'email', null, false);
select tests.set_id('sp', (select id from public.signers where email = 'pres@x.com'));
select tests.set_id('sr', (select id from public.signers where email = 'remoto@x.com'));

-- Constraints.
select tests.assert_raises(format($q$insert into public.signers (envelope_id, first_name, last_name, email, require_sms_otp) values (%L, 'A', 'B', 'nophone@x.com', true)$q$, tests.id('e')),
  'signers_otp_needs_phone', 'SMS verification needs a phone');
select tests.assert_raises(format($q$insert into public.signers (envelope_id, first_name, last_name, email, phone) values (%L, 'A', 'B', 'badphone@x.com', '600123456')$q$, tests.id('e')),
  'signers_phone_format', 'phone must be E.164');

select tests.as_service();
select public.send_envelope(tests.id('e'), tests.id('u'),
  jsonb_build_array(
    jsonb_build_object('signer_id', tests.id('sp'), 'token_hash', repeat('1', 64)),
    jsonb_build_object('signer_id', tests.id('sr'), 'token_hash', repeat('2', 64))),
  'DF-PRES-0001', now() + interval '30 days', '{"name":"Hana Host","email":"host@example.com"}');

-- Only the owner can start an in-person session, and only for in-person signers.
select tests.assert_raises(format($q$select public.start_in_person_signing(%L, %L, repeat('3', 64), 'x')$q$, tests.id('sp'), tests.id('other')),
  'signer_not_found', 'other users cannot start the session');
select tests.assert_raises(format($q$select public.start_in_person_signing(%L, %L, repeat('3', 64), 'x')$q$, tests.id('sr'), tests.id('u')),
  'not_in_person', 'remote signers cannot be signed in person');
select public.start_in_person_signing(tests.id('sp'), tests.id('u'), repeat('3', 64), 'Hana Host <host@example.com>', '10.0.0.1', 'UA');
select tests.assert((select revoked_at is not null from public.signer_access_tokens where token_hash = repeat('1', 64)), 'previous link revoked');
select tests.assert_raises($q$select public.mark_signer_viewed(repeat('1', 64), null, null)$q$, 'invalid_token', 'revoked link unusable');
select tests.assert_eq((select count(*)::int from public.envelope_events where signer_id = tests.id('sp') and type = 'in_person_started'), 1, 'session logged');

-- Signing without a verified code is refused.
select tests.assert_raises($q$select public.complete_signature(repeat('3', 64), jsonb_build_object('biometric_sha256', repeat('b', 64), 'stroke_count', 1, 'duration_ms', 500, 'points_count', 30), 'v1')$q$,
  'otp_required', 'code required before signing');

-- Remote signer is not asked for a code.
select tests.assert_raises($q$select public.request_signer_otp(repeat('2', 64), repeat('c', 64))$q$, 'otp_not_required', 'no SMS for this signer');

-- Request, fail, verify.
select tests.assert_eq(public.request_signer_otp(repeat('3', 64), repeat('5', 64)), '+34600123456', 'returns the phone');
select tests.assert_eq((public.verify_signer_otp(repeat('3', 64), repeat('0', 64)) ->> 'reason'), 'invalid', 'wrong code');
select tests.assert_eq((public.verify_signer_otp(repeat('3', 64), repeat('0', 64)) ->> 'attempts_left')::int, 3, 'attempts counted and persisted');
select tests.assert_eq((public.verify_signer_otp(repeat('3', 64), repeat('5', 64)) ->> 'ok')::boolean, true, 'right code');
select tests.assert_eq((public.verify_signer_otp(repeat('3', 64), repeat('5', 64)) ->> 'reason'), 'expired', 'code is single-use');

-- Now the signature goes through and the evidence records how the signer was identified.
select public.complete_signature(repeat('3', 64), jsonb_build_object('biometric_sha256', repeat('b', 64), 'stroke_count', 1, 'duration_ms', 500, 'points_count', 30), 'v1');
select tests.assert_eq((select delivery from public.signature_evidence where signer_id = tests.id('sp')), 'in_person', 'evidence: in person');
select tests.assert_eq((select in_person_host from public.signature_evidence where signer_id = tests.id('sp')), 'Hana Host <host@example.com>', 'evidence: host');
select tests.assert_eq((select otp_phone_masked from public.signature_evidence where signer_id = tests.id('sp')), '+34 ••• ••• 456', 'evidence: masked phone');
select tests.assert((select otp_verified_at is not null from public.signature_evidence where signer_id = tests.id('sp')), 'evidence: verification time');

-- Rate limit: at most 3 codes in 10 minutes.
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Rate') returning tests.set_id('e2', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('e2'), 'doc.pdf', 'u/e2/doc.pdf', repeat('a', 64), 1, 100);
insert into public.signers (envelope_id, first_name, last_name, email, phone, require_sms_otp)
  values (tests.id('e2'), 'Ra', 'Te', 'rate@x.com', '+34611111111', true) returning tests.set_id('s3', id);
select public.send_envelope(tests.id('e2'), tests.id('u'),
  jsonb_build_array(jsonb_build_object('signer_id', tests.id('s3'), 'token_hash', repeat('4', 64))),
  'DF-RATE-0001', now() + interval '30 days', '{}');
select public.request_signer_otp(repeat('4', 64), repeat('d', 64));
select public.request_signer_otp(repeat('4', 64), repeat('e', 64));
select public.request_signer_otp(repeat('4', 64), repeat('f', 64));
select tests.assert_raises($q$select public.request_signer_otp(repeat('4', 64), repeat('a', 64))$q$, 'otp_rate_limited', 'rate limited');
select tests.assert_eq((select count(*)::int from public.signer_otps where signer_id = tests.id('s3') and consumed_at is null), 1, 'only the latest code is open');

-- Browsers never see OTP rows.
select tests.as_user(tests.id('u'));
select tests.assert_raises($q$select count(*) from public.signer_otps$q$, 'permission denied', 'no browser access to codes');
