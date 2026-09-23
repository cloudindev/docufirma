-- ─────────────────────────────────────────────────────────────────────────────
-- DocuFirma · Storage buckets (all private)
-- Object paths: {user_id}/{envelope_id}/… (branding: {user_id}/logo.{ext})
-- No client policies: uploads use signed upload URLs created by the server and
-- downloads use short-lived signed URLs created after an authorisation check.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('originals', 'originals', false, 26214400, array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('signed', 'signed', false, 52428800, array['application/pdf']),
  ('evidence', 'evidence', false, 10485760, array['application/octet-stream', 'image/png', 'application/pdf']),
  ('tsa', 'tsa', false, 1048576, array['application/timestamp-query', 'application/timestamp-reply', 'application/octet-stream']),
  ('branding', 'branding', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
