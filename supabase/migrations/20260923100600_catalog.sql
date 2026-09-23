-- Default credit packs catalog (production data). `pnpm stripe:setup` fills stripe_price_id.
insert into public.credit_packs (slug, name_es, name_en, credits, price_cents, currency, sort_order) values
  ('pack-25', 'Pack 25 firmas', '25 signatures pack', 25, 1500, 'eur', 1),
  ('pack-100', 'Pack 100 firmas', '100 signatures pack', 100, 4900, 'eur', 2),
  ('pack-500', 'Pack 500 firmas', '500 signatures pack', 500, 19900, 'eur', 3)
on conflict (slug) do nothing;
