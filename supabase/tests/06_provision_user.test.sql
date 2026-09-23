-- provision_user: repairs users without a profile, idempotently, and backs the sign-up trigger.
select tests.set_id('u', tests.create_user('prov@example.com', '{"first_name":"Ana","last_name":"Ruiz","locale":"en"}'));
select tests.assert((select exists (select 1 from public.profiles where id = tests.id('u'))), 'trigger still provisions');

-- Simulate a user created before the schema existed.
set local docufirma.allow_purge = 'on';
delete from public.credit_ledger where user_id = tests.id('u');
delete from public.profiles where id = tests.id('u');

select tests.as_service();
select tests.assert_eq((select (public.provision_user(tests.id('u'))).first_name), 'Ana', 'returns the rebuilt profile');
select tests.assert_eq((select (public.provision_user(tests.id('u'))).id), tests.id('u'), 'second call returns the same row');
select tests.as_postgres();
select tests.assert_eq((select first_name from public.profiles where id = tests.id('u')), 'Ana', 'profile rebuilt from metadata');
select tests.assert_eq((select locale from public.profiles where id = tests.id('u')), 'en', 'locale kept');
select tests.assert_eq((select count(*)::int from public.credit_ledger where user_id = tests.id('u') and kind = 'trial_grant'), 1, 'one trial grant');

select tests.as_user(tests.id('u'));
select tests.assert_raises($$select public.provision_user(auth.uid())$$, 'permission denied', 'users cannot call it');
