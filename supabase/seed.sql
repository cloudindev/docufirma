-- Local development seed (applied by `supabase db reset`). Production catalog data lives in migrations.
-- Welcome credits (same as production).
update public.app_settings set value = '5'::jsonb where key = 'trial_credits';
