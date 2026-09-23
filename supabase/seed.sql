-- Local development seed (applied by `supabase db reset`). Production catalog data lives in migrations.
-- Keep trial credits at the default for local testing.
update public.app_settings set value = '3'::jsonb where key = 'trial_credits';
