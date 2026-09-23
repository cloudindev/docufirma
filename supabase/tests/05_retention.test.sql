-- Biometric retention purge.
select tests.set_id('u', tests.create_user('ret@example.com'));
insert into public.envelopes (user_id, title) values (tests.id('u'), 'Old') returning tests.set_id('e', id);
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('e'), 'A', 'B', 'a@x.com') returning tests.set_id('s', id);
insert into public.signers (envelope_id, first_name, last_name, email) values (tests.id('e'), 'C', 'D', 'c@x.com') returning tests.set_id('s2', id);
insert into public.signature_evidence (signer_id, envelope_id, biometric_data_path, biometric_sha256, stroke_count, duration_ms, points_count, server_time)
  values (tests.id('s'), tests.id('e'), 'u/e/s/biometrics.bin', repeat('a', 64), 1, 500, 30, now() - interval '6 years'),
         (tests.id('s2'), tests.id('e'), 'u/e/s2/biometrics.bin', repeat('b', 64), 1, 500, 30, now() - interval '1 year');

select tests.as_service();
select tests.assert_eq((select count(*)::int from public.claim_expired_biometrics(5)), 1, 'only the 6-year-old row');
select tests.assert_eq((select biometric_data_path from public.signature_evidence where signer_id = tests.id('s')), null::text, 'path cleared');
select tests.assert((select biometric_purged_at is not null from public.signature_evidence where signer_id = tests.id('s')), 'purge recorded');
select tests.assert_eq((select biometric_sha256 from public.signature_evidence where signer_id = tests.id('s')), repeat('a', 64), 'hash kept');
select tests.assert_eq((select count(*)::int from public.claim_expired_biometrics(5)), 0, 'idempotent');
