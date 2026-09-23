-- New users get a profile and the trial credits.
select tests.set_id('u', tests.create_user('ana@example.com', '{"first_name":"Ana","last_name":"García","locale":"en"}'));

select tests.assert_eq((select first_name from public.profiles where id = tests.id('u')), 'Ana', 'first name copied');
select tests.assert_eq((select last_name from public.profiles where id = tests.id('u')), 'García', 'last name copied');
select tests.assert_eq((select locale from public.profiles where id = tests.id('u')), 'en', 'locale copied');
select tests.assert_eq((select email from public.profiles where id = tests.id('u')), 'ana@example.com', 'email copied');
select tests.assert_eq((select count(*)::int from public.credit_ledger where user_id = tests.id('u') and kind = 'trial_grant'), 1, 'one trial grant');
select tests.as_service();
select tests.assert_eq((select total from public.get_available_credits(tests.id('u'))), 3, 'trial balance is 3');

-- Google OAuth style metadata
select tests.as_postgres();
select tests.set_id('g', tests.create_user('luis@example.com', '{"full_name":"Luis Pérez Gómez"}'));
select tests.assert_eq((select first_name from public.profiles where id = tests.id('g')), 'Luis', 'first name from full_name');
select tests.assert_eq((select last_name from public.profiles where id = tests.id('g')), 'Pérez Gómez', 'last name from full_name');
select tests.assert_eq((select locale from public.profiles where id = tests.id('g')), 'es', 'default locale');

-- Email change is mirrored.
update auth.users set email = 'luis.new@example.com' where id = tests.id('g');
select tests.assert_eq((select email from public.profiles where id = tests.id('g')), 'luis.new@example.com', 'email synced');

-- Trial disabled
update public.app_settings set value = '0'::jsonb where key = 'trial_credits';
select tests.set_id('z', tests.create_user('zero@example.com'));
select tests.assert_eq((select count(*)::int from public.credit_ledger where user_id = tests.id('z')), 0, 'no trial when 0');
