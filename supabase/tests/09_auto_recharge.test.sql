-- Automatic top-up: when a recharge is claimed, cooldown, kinds and permissions.
select tests.set_id('u', tests.create_user('auto@example.com'));   -- 5 welcome credits
select tests.set_id('v', tests.create_user('other-auto@example.com'));

select tests.as_service();
-- No settings → nothing to do.
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id is null, 'no settings');

insert into public.auto_recharge (user_id, kind, enabled, threshold, pack_id)
values (tests.id('u'), 'signatures', true, 2, (select id from public.credit_packs where slug = 'pack-25'));

-- Balance 5 > threshold 2 → not yet.
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id is null, 'above threshold');

-- Balance drops to the threshold → claimed once, then cooldown.
update public.auto_recharge set threshold = 5 where user_id = tests.id('u') and kind = 'signatures';
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id = tests.id('u'), 'claimed at threshold');
select tests.assert((select last_attempt_at from public.auto_recharge where user_id = tests.id('u') and kind = 'signatures') is not null, 'attempt stamped');
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id is null, 'cooldown prevents a second charge');

-- After the cooldown it can run again.
update public.auto_recharge set last_attempt_at = now() - interval '11 minutes' where user_id = tests.id('u');
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id = tests.id('u'), 'claimable after cooldown');

-- Disabled, or a pack of the other kind → never.
update public.auto_recharge set last_attempt_at = null, enabled = false where user_id = tests.id('u');
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id is null, 'disabled');
update public.auto_recharge set enabled = true, pack_id = (select id from public.credit_packs where slug = 'sms-100')
where user_id = tests.id('u');
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'signatures')).user_id is null, 'pack kind must match');

-- SMS: balance 0 <= threshold 10.
insert into public.auto_recharge (user_id, kind, enabled, threshold, pack_id)
values (tests.id('u'), 'sms', true, 10, (select id from public.credit_packs where slug = 'sms-100'));
select tests.assert((public.claim_auto_recharge(tests.id('u'), 'sms')).kind = 'sms', 'sms claimed');

-- Owners read their own settings only and cannot write or claim.
select tests.as_user(tests.id('v'));
select tests.assert_eq((select count(*)::int from public.auto_recharge), 0, 'B sees nothing of A');
select tests.as_user(tests.id('u'));
select tests.assert_eq((select count(*)::int from public.auto_recharge), 2, 'A sees own settings');
select tests.assert_raises(format('update public.auto_recharge set threshold = 1 where user_id = %L', tests.id('u')), 'permission denied', 'no direct writes');
select tests.assert_raises(format('select public.claim_auto_recharge(%L, ''sms'')', tests.id('u')), 'permission denied', 'claim is service only');
