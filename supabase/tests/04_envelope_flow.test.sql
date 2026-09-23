-- Full envelope lifecycle through the service-role functions.
select tests.set_id('u', tests.create_user('sender@example.com', '{"first_name":"Sara","last_name":"López"}'));
insert into public.envelopes (user_id, title, sequential) values (tests.id('u'), 'Contrato', true)
  returning tests.set_id('e', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('e'), 'contrato.pdf', 'u/e/doc.pdf', repeat('a', 64), 3, 1000);
insert into public.signers (envelope_id, first_name, last_name, email, order_index) values
  (tests.id('e'), 'Uno', 'Primero', 'uno@x.com', 0),
  (tests.id('e'), 'Dos', 'Segundo', 'dos@x.com', 1);
select tests.set_id('s1', (select id from public.signers where email = 'uno@x.com'));
select tests.set_id('s2', (select id from public.signers where email = 'dos@x.com'));

select tests.as_service();

-- Tokens mismatch is rejected.
select tests.assert_raises(format($q$select public.send_envelope(%L, %L, '[]'::jsonb, 'DF-AB12-CD34', now() + interval '30 days')$q$,
  tests.id('e'), tests.id('u')), 'tokens_mismatch', 'all signers need tokens');

-- Send (sequential: only the first signer is notified).
select tests.assert_eq(
  (public.send_envelope(tests.id('e'), tests.id('u'),
    jsonb_build_array(
      jsonb_build_object('signer_id', tests.id('s1'), 'token_hash', repeat('1', 64)),
      jsonb_build_object('signer_id', tests.id('s2'), 'token_hash', repeat('2', 64))),
    'DF-AB12-CD34', now() + interval '30 days', '{"name":"Sara López","email":"sender@example.com"}') -> 'notify'),
  jsonb_build_array(tests.id('s1')), 'only first signer notified');
select tests.assert_eq((select status::text from public.envelopes where id = tests.id('e')), 'sent', 'envelope sent');
select tests.assert_eq((select sender_name from public.envelopes where id = tests.id('e')), 'Sara López', 'sender snapshot');
select tests.assert_eq((select status::text from public.signers where id = tests.id('s2')), 'pending', 'second waits');
select tests.assert_eq((select count(*)::int from public.signer_access_tokens), 1, 'only notified signer has token');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 2, 'two credits reserved');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'one left');
select tests.assert_raises(format($q$select public.send_envelope(%L, %L, '[]'::jsonb, 'DF-AB12-CD35', now() + interval '1 day')$q$,
  tests.id('e'), tests.id('u')), 'envelope_not_draft', 'cannot send twice');

-- Unknown token.
select tests.assert_raises($q$select public.mark_signer_viewed(repeat('9', 64), null, null)$q$, 'invalid_token', 'bad token');

-- Signer 1 opens and signs.
select tests.assert_eq((public.mark_signer_viewed(repeat('1', 64), '1.2.3.4', 'UA') ->> 'first_view')::boolean, true, 'first view');
select tests.assert_eq((public.mark_signer_viewed(repeat('1', 64), '1.2.3.4', 'UA') ->> 'first_view')::boolean, false, 'second view');
select tests.assert_eq((select status::text from public.envelopes where id = tests.id('e')), 'viewed', 'envelope viewed');
select public.record_signer_event(repeat('1', 64), 'scrolled_to_end', '{"document":"x"}', null, null);
select tests.assert_raises($q$select public.record_signer_event(repeat('1', 64), 'signed', '{}', null, null)$q$, 'event_not_allowed', 'cannot forge signed event');

select tests.assert_eq(
  (public.complete_signature(repeat('1', 64),
    jsonb_build_object('biometric_sha256', repeat('b', 64), 'stroke_count', 2, 'duration_ms', 1500, 'points_count', 120,
                       'pointer_type', 'touch', 'pressure_supported', true, 'client_time', now()),
    'v1', '1.2.3.4', 'UA') ->> 'next_signer_id')::uuid,
  tests.id('s2'), 'returns next signer');
select tests.assert_eq((select status::text from public.signers where id = tests.id('s1')), 'signed', 'signer 1 signed');
select tests.assert_eq((select count(*)::int from public.signature_evidence where signer_id = tests.id('s1')), 1, 'evidence stored');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 1, 'one consumed');

-- Cannot sign twice with the same token.
select tests.assert_raises(format($q$select public.complete_signature(repeat('1', 64), %L::jsonb, 'v1', null, null)$q$,
  jsonb_build_object('biometric_sha256', repeat('b', 64), 'stroke_count', 1, 'duration_ms', 500, 'points_count', 30)),
  'already_signed', 'single use');

-- Signer 2 gets a token now and signs; envelope becomes all-signed with a close job.
select public.issue_signer_token(tests.id('s2'), repeat('3', 64));
select tests.assert_eq((select status::text from public.signers where id = tests.id('s2')), 'sent', 'second activated');
select tests.assert_eq(
  (public.complete_signature(repeat('3', 64),
    jsonb_build_object('biometric_sha256', repeat('c', 64), 'stroke_count', 1, 'duration_ms', 800, 'points_count', 40),
    'v1', null, null) ->> 'all_signed')::boolean,
  true, 'all signed');
select tests.assert_eq((select count(*)::int from public.jobs where type = 'close_envelope'), 1, 'close job queued');
select tests.assert_raises(format('select public.cancel_envelope(%L, %L)', tests.id('e'), tests.id('u')), 'envelope_not_cancelable', 'cannot cancel after all signed');
select tests.assert(public.mark_envelope_completed(tests.id('e')), 'completed');
select tests.assert(not public.mark_envelope_completed(tests.id('e')), 'completion idempotent');
select tests.assert_eq((select status::text from public.envelopes where id = tests.id('e')), 'completed', 'status completed');
select tests.assert_eq((select reserved from public.get_available_credits(tests.id('u'))), 0, 'nothing reserved');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'two credits spent');

-- ── Decline releases the credits of non-signed signers ──────────────────────
select tests.as_postgres();
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Declinable') returning tests.set_id('d', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('d'), 'a.pdf', 'u/d/a.pdf', repeat('a', 64), 1, 10);
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('d'), 'X', 'Y', 'x@x.com')
  returning tests.set_id('ds', id);
select tests.as_service();
select public.send_envelope(tests.id('d'), tests.id('u'),
  jsonb_build_array(jsonb_build_object('signer_id', tests.id('ds'), 'token_hash', repeat('4', 64))),
  'DF-ZZZZ-0001', now() + interval '10 days');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 0, 'reserved last credit');
select tests.assert_raises(format($q$select public.send_envelope(%L, %L, '[]'::jsonb, 'DF-ZZZZ-0009', now() + interval '1 day')$q$,
  tests.id('d'), tests.id('u')), 'envelope_not_draft', 'already sent');
select tests.assert_eq((public.decline_signature(repeat('4', 64), '  No estoy de acuerdo  ', null, null) ->> 'released')::int, 1, 'released 1');
select tests.assert_eq((select status::text from public.envelopes where id = tests.id('d')), 'declined', 'declined');
select tests.assert_eq((select decline_reason from public.signers where id = tests.id('ds')), 'No estoy de acuerdo', 'reason trimmed');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'credit back');
select tests.assert_raises($q$select public.mark_signer_viewed(repeat('4', 64), null, null)$q$, 'envelope_declined', 'declined link');

-- ── Cancel ───────────────────────────────────────────────────────────────────
select tests.as_postgres();
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Cancelable') returning tests.set_id('c', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('c'), 'a.pdf', 'u/c/a.pdf', repeat('a', 64), 1, 10);
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('c'), 'X', 'Y', 'x@x.com')
  returning tests.set_id('cs', id);
select tests.as_service();
select public.send_envelope(tests.id('c'), tests.id('u'),
  jsonb_build_array(jsonb_build_object('signer_id', tests.id('cs'), 'token_hash', repeat('5', 64))),
  'DF-ZZZZ-0002', now() + interval '10 days');
select tests.assert_raises(format('select public.cancel_envelope(%L, %L)', tests.id('c'), gen_random_uuid()), 'envelope_not_found', 'only owner cancels');
select tests.assert_eq((public.cancel_envelope(tests.id('c'), tests.id('u')) ->> 'released')::int, 1, 'cancel releases');
select tests.assert_raises($q$select public.mark_signer_viewed(repeat('5', 64), null, null)$q$, 'invalid_token', 'tokens revoked');

-- ── Expire ───────────────────────────────────────────────────────────────────
select tests.as_postgres();
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Expira') returning tests.set_id('x', id);
insert into public.documents (envelope_id, name, original_path, original_sha256, page_count, size_bytes)
  values (tests.id('x'), 'a.pdf', 'u/x/a.pdf', repeat('a', 64), 1, 10);
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('x'), 'X', 'Y', 'x@x.com')
  returning tests.set_id('xs', id);
select tests.as_service();
select public.send_envelope(tests.id('x'), tests.id('u'),
  jsonb_build_array(jsonb_build_object('signer_id', tests.id('xs'), 'token_hash', repeat('6', 64))),
  'DF-ZZZZ-0003', now() + interval '10 days');
select tests.as_postgres();
update public.envelopes set expires_at = now() - interval '1 minute' where id = tests.id('x');
update public.signer_access_tokens set expires_at = now() - interval '1 minute' where signer_id = tests.id('xs');
select tests.as_service();
select tests.assert_raises($q$select public.mark_signer_viewed(repeat('6', 64), null, null)$q$, 'token_expired', 'expired link');
select tests.assert_eq((select count(*)::int from public.expire_due_envelopes()), 1, 'one expired');
select tests.assert_eq((select status::text from public.envelopes where id = tests.id('x')), 'expired', 'status expired');
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 1, 'credit released on expiry');
select tests.assert_eq((select count(*)::int from public.expire_due_envelopes()), 0, 'expiry idempotent');

-- ── Drafts can be deleted, others cannot ─────────────────────────────────────
select tests.as_postgres();
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Borrador') returning tests.set_id('dr', id);
insert into public.envelope_events (envelope_id, type) values (tests.id('dr'), 'created');
select tests.as_service();
select public.delete_draft_envelope(tests.id('dr'), tests.id('u'));
select tests.assert_eq((select count(*)::int from public.envelopes where id = tests.id('dr')), 0, 'draft deleted');
select tests.assert_raises(format('select public.delete_draft_envelope(%L, %L)', tests.id('e'), tests.id('u')), 'envelope_not_draft', 'completed kept');

-- ── Jobs ─────────────────────────────────────────────────────────────────────
select public.enqueue_job('retry_tsa', '{"id":1}', now() - interval '1 second', 'tsa:1');
select public.enqueue_job('retry_tsa', '{"id":1}', now() - interval '1 second', 'tsa:1');
select tests.assert_eq((select count(*)::int from public.jobs where type = 'retry_tsa'), 1, 'dedupe');
select tests.assert_eq((select count(*)::int from public.claim_jobs('retry_tsa', 5)), 1, 'claimed');
select tests.assert_eq((select count(*)::int from public.claim_jobs('retry_tsa', 5)), 0, 'not claimed twice');
select tests.assert_eq(public.fail_job((select id from public.jobs where dedupe_key = 'tsa:1'), 'boom', now() + interval '1 minute')::text, 'pending', 'rescheduled');

-- ── Rate limit ───────────────────────────────────────────────────────────────
select tests.assert((select allowed from public.rate_limit_hit('ip:1', 2, 60)), 'hit 1');
select tests.assert((select allowed from public.rate_limit_hit('ip:1', 2, 60)), 'hit 2');
select tests.assert(not (select allowed from public.rate_limit_hit('ip:1', 2, 60)), 'hit 3 blocked');

-- ── Account deletion keeps completed envelopes, anonymised ──────────────────
select tests.assert_eq(jsonb_typeof(public.delete_user_account(tests.id('u')) -> 'paths'), 'array', 'returns paths');
select tests.assert_eq((select count(*)::int from public.profiles where id = tests.id('u')), 0, 'profile gone');
select tests.assert_eq((select count(*)::int from public.envelopes where id = tests.id('e') and user_id is null), 1, 'completed retained, detached');
select tests.assert_eq((select count(*)::int from public.envelopes where id in (tests.id('d'), tests.id('c'), tests.id('x'))), 0, 'others deleted');
select tests.assert_eq((select sender_email from public.envelopes where id = tests.id('e')), null::text, 'sender email removed');
select tests.assert_eq((select count(*)::int from public.deleted_accounts where user_id = tests.id('u')), 1, 'deletion recorded');
