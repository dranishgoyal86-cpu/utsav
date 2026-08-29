-- Guards the bulk-import invite email against being sent twice for the same
-- provider -- this app has two distinct "admin approves a provider" moments
-- (claim approval in ClaimRequests.js, verification approval in
-- AdminPanel.js) and a provider can legitimately pass through both. A
-- single nullable timestamp, set via an atomic
-- "UPDATE ... WHERE bulk_import_invited_at IS NULL" in
-- lib/bulkImportInvite.js, is the guard -- whichever approval path runs
-- first wins the race and is the only one that actually sends.
alter table public.providers
  add column if not exists bulk_import_invited_at timestamptz;
