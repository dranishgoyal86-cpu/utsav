-- Per-guest RSVP prefill/dedup + outstation government-ID collection.
--
-- Context: RSVP links were event-wide (one link, shared by every guest),
-- and submit-rsvp matched an incoming submission to an existing
-- event_invitees row by phone number ONLY. That meant a guest changing
-- their phone number while RSVPing would silently fork a duplicate row
-- instead of updating their real one. Per-guest links (embedding the
-- guest's own event_invitees.id — no new column needed for that, it's
-- already a real UUID) fix this: when a guest is reached via their own
-- link, that id becomes the match key instead of phone, so a name/phone
-- change updates the same row every time. Old-style broadcast links (no
-- guest id) keep today's phone-matching behavior unchanged as a fallback.

-- ── Part A: "host hasn't reviewed this change yet" flag ──
-- Set by submit-rsvp when a guest-id-anchored submission's name/phone
-- differs from what's already on the row. Cleared when the host opens
-- GuestDetailModal for that guest — same clear-on-view shape
-- notifications.is_read already uses.
alter table public.event_invitees add column if not exists info_changed_at timestamptz;

-- ── Part B: the guest's own government ID (Aadhaar) document ──
-- Guest-writable ONLY via submit-rsvp's new upload_guest_document action
-- (service-role client) — never a direct client write, matching every
-- other guest-side write in this project (RLS on event_invitees is
-- "Owner manages invitees", host-only).
alter table public.event_invitees add column if not exists govt_id_doc_path text;

-- ── Part C: accompanying guests — sub-records, NOT event_invitees rows ──
-- One row per accompanying person under an outstation invitee (e.g. a
-- spouse/kids sharing a hotel room). Deliberately not folded into
-- event_invitees itself: this is genuinely one-to-many (one invitee, N
-- accompanying people), and each has its own document — same reasoning
-- event_accommodations used to justify being a real table instead of
-- flat columns.
create table if not exists public.guest_accompanying (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references public.event_invitees(id) on delete cascade,
  name text not null,
  govt_id_doc_path text,
  created_at timestamptz not null default now()
);
create index if not exists guest_accompanying_invitee_id_idx on public.guest_accompanying(invitee_id);

alter table public.guest_accompanying enable row level security;

-- Host/delegate read+manage via the client (GuestDetailModal, hotel-list
-- export) — same host-or-accepted-delegate shape as event_accommodations
-- (supabase/migrations/outstation_travel.sql). Guest-side writes never go
-- through this policy — they go through the upload_guest_document edge
-- function action using the service-role client, which bypasses RLS
-- entirely, so no anon/authenticated write policy exists here.
create policy "Hosts manage own event guest_accompanying"
  on public.guest_accompanying for all
  using (
    invitee_id in (
      select ei.id from public.event_invitees ei
      join public.events e on e.id = ei.event_id
      where e.host_id = auth.uid()
    )
  )
  with check (
    invitee_id in (
      select ei.id from public.event_invitees ei
      join public.events e on e.id = ei.event_id
      where e.host_id = auth.uid()
    )
  );

create policy "Delegates manage event guest_accompanying"
  on public.guest_accompanying for all
  using (
    invitee_id in (
      select ei.id from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where d.delegate_user_id = auth.uid() and d.status = 'accepted'
    )
  )
  with check (
    invitee_id in (
      select ei.id from public.event_invitees ei
      join public.event_delegates d on d.event_id = ei.event_id
      where d.delegate_user_id = auth.uid() and d.status = 'accepted'
    )
  );

-- ── Part D: storage RLS for the host to view guest documents ──
-- Path convention: {event_id}/{invitee_id}/{timestamp}-{self|acc-<accId>}.{ext}
-- (no user_id available — RSVP guests are unauthenticated, unlike
-- provider_documents' {userId}/... convention). This policy lets the
-- HOST's own authenticated session call
-- supabase.storage.from('guest_documents').createSignedUrl(path) directly,
-- same client-side pattern as helpers.js's getSignedDocumentUrl. The
-- actual UPLOAD never uses this policy — it always goes through the
-- service-role edge function, which bypasses RLS.
--
-- ** MANUAL STEP FIRST (not SQL): ** create a bucket named `guest_documents`
-- in the Supabase Dashboard -> Storage -> New bucket -> Public: OFF, before
-- running the policies below. Bucket creation itself isn't SQL-scriptable
-- the way table/policy DDL is.
create policy "Hosts read own event guest documents"
  on storage.objects for select
  using (
    bucket_id = 'guest_documents'
    and exists (
      select 1 from public.events e
      where e.id::text = (storage.foldername(name))[1]
        and e.host_id = auth.uid()
    )
  );

create policy "Delegates read event guest documents"
  on storage.objects for select
  using (
    bucket_id = 'guest_documents'
    and exists (
      select 1 from public.event_delegates d
      where d.event_id::text = (storage.foldername(name))[1]
        and d.delegate_user_id = auth.uid()
        and d.status = 'accepted'
    )
  );
