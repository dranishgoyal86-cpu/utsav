-- Admin edit/revoke/delete/request-more-docs across the four provider-
-- facing review queues (verification_requests, provider_claims,
-- category_requests, category_upgrade_requests). Confirmed with the user:
-- scope is AdminPanel.js (verification), ClaimRequests.js, and both
-- category screens -- GSTReview.js explicitly excluded.
--
-- 'more_info_needed' is a genuine new status (not just a note on
-- pending/rejected) -- a provider sees it as "we need something from you",
-- distinct from an outright rejection. verification_requests/
-- category_requests/category_upgrade_requests have no CHECK constraint on
-- status (confirmed live via pg_constraint) so the new value just works;
-- provider_claims DOES have one and needs widening. provider_claims was
-- also the only one of the four missing admin_notes entirely -- the other
-- three already had it, just not yet surfaced/editable in their own admin
-- screens (a real pre-existing gap, fixed alongside this).
alter table public.provider_claims add column if not exists admin_notes text;

alter table public.provider_claims drop constraint if exists provider_claims_status_check;
alter table public.provider_claims add constraint provider_claims_status_check
  check (status = any (array['pending', 'approved', 'rejected', 'more_info_needed']));

-- Real, live-confirmed gap (this project's own known gotcha —
-- gotcha_supabase_rls_silent_delete): verification_requests had UPDATE and
-- SELECT policies for admins but no DELETE policy at all. A client-side
-- .delete() against a row RLS doesn't grant DELETE on doesn't error, it
-- just matches 0 rows silently — confirmed live: is_verified flipped and
-- the notification sent correctly, but the row itself never actually left
-- the table. Checked the other three tables before assuming the same gap:
-- provider_claims already has an admin "ALL" policy (covers delete, no new
-- policy needed there); category_requests and category_upgrade_requests
-- both genuinely have the identical gap (admin SELECT+UPDATE, no DELETE),
-- confirmed via pg_policies, not assumed.
create policy "Admins can delete requests"
  on public.verification_requests for delete
  using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));

create policy "Admins can delete category requests"
  on public.category_requests for delete
  using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));

create policy "Admins can delete category upgrade requests"
  on public.category_upgrade_requests for delete
  using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));

-- category_requests approve inserts into custom_categories with a real
-- source_request_id FK back here -- deleting an approved category request
-- needs to delete that row too, admin-authored.
create policy "Admins can delete custom categories"
  on public.custom_categories for delete
  using (exists (select 1 from public.users where users.id = auth.uid() and users.is_admin = true));
