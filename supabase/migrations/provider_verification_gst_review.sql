-- Provider verification, Task 3 (GST, manual admin review). provider_billing
-- already has gstin (plain 15-char text) and gst_certificate_url (private
-- doc upload) -- confirmed in Task 0, no new field needed for either. This
-- adds only the review-tracking columns.
alter table public.provider_billing add column if not exists gst_status text; -- null (not submitted) | 'pending' | 'verified' | 'rejected'
alter table public.provider_billing add column if not exists gst_reviewed_at timestamptz;
alter table public.provider_billing add column if not exists gst_review_notes text;

create index if not exists idx_provider_billing_gst_status on public.provider_billing(gst_status);

-- provider_billing already has an "Admin can view billing" SELECT policy
-- (confirmed live via pg_policies) but no admin UPDATE policy -- only the
-- owner's own "Owner billing" ALL policy exists, which would silently
-- block an admin's approve/reject write. Same shape as this project's
-- existing "Admin updates providers" policy on the providers table;
-- multiple permissive policies for the same command OR together, so this
-- only ADDS admin access, it doesn't touch the owner's own write policy.
create policy "Admin updates provider_billing"
  on public.provider_billing for update
  using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));
