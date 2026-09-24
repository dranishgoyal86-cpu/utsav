-- Batch of Provider ERP improvements from the open-source feature scan
-- (provider-erp-open-source-feature-scan.md), all requested together by
-- Anish (Sept 24): buffer time, quote expiry, decline/expiry reasons, a
-- pre-quote lead list, per-service intake-question hints, a deposit +
-- accept step on quotes, and a private post-event photo gallery.
--
-- Purely additive across the board — no existing table's existing columns
-- or rows are touched, and no existing screen's current behavior changes
-- unless a host/provider actively opts into one of these new steps.

-- 1) Buffer time — provider sets their own teardown/travel buffer around
-- every booking (scan item #2, from Cal.com).
alter table public.providers add column if not exists buffer_minutes int4 not null default 0;

-- 2) Quote expiry + 3) decline/expiry reason (scan items #6 and #5) — same
-- two columns on BOTH quote-response tables (menu's and the general one),
-- so a quote can auto-expire after a date, and a decline/expiry can carry
-- a short reason for the provider's own Reports later.
alter table public.menu_quote_responses add column if not exists expires_at timestamp with time zone;
alter table public.menu_quote_responses add column if not exists decline_reason text;
alter table public.service_quote_responses add column if not exists expires_at timestamp with time zone;
alter table public.service_quote_responses add column if not exists decline_reason text;

-- 4) Deposit + accept step (scan item #1) — provider sets a deposit % when
-- they quote; the host's "Book" tap becomes an explicit accept step that
-- records who accepted and when. NOT a real e-signature (see
-- quote-first-booking-all-services.md and provider-erp-open-source-
-- feature-scan.md) — a simple recorded-acceptance placeholder until a
-- real e-signature provider is chosen and wired in as its own follow-up.
alter table public.menu_quote_responses add column if not exists deposit_percent int4;
alter table public.menu_quote_responses add column if not exists accepted_at timestamp with time zone;
alter table public.menu_quote_responses add column if not exists accepted_by_name text;
alter table public.service_quote_responses add column if not exists deposit_percent int4;
alter table public.service_quote_responses add column if not exists accepted_at timestamp with time zone;
alter table public.service_quote_responses add column if not exists accepted_by_name text;

-- 5) Per-service intake questions (scan item #3) — provider defines a few
-- short questions per service; shown to the host as hints when inviting
-- that provider to quote, so the host's note answers them upfront instead
-- of back-and-forth messaging. Kept lightweight: a list of strings shown
-- as hints under the existing "note for the provider" box, not a separate
-- structured question/answer form.
alter table public.services add column if not exists intake_questions jsonb;

-- 6) Pre-quote lead list (scan item #4) — an informal "someone asked about
-- pricing" note a provider can log themselves, independent of the formal
-- QuoteInbox flow. No host_id — this is the provider's own private CRM
-- note, not a marketplace record the host has any part in.
create table public.provider_leads (
  id uuid default gen_random_uuid() primary key,
  provider_id uuid references public.providers(id) on delete cascade,
  name text not null,
  phone text,
  note text,
  status text not null default 'new', -- 'new' | 'contacted' | 'converted' | 'dropped'
  created_at timestamp with time zone default now()
);
alter table public.provider_leads enable row level security;
create policy "Providers manage their own leads"
  on public.provider_leads for all
  using (provider_id in (select id from public.providers where user_id = auth.uid()));
create index idx_provider_leads_provider on public.provider_leads(provider_id);

-- 7) Post-event photo gallery (scan item #7) — private per-booking media
-- delivery, mainly for photography/videography vendors. Own table + a new
-- private storage bucket (event_gallery) — NOT the existing Cloudinary
-- portfolio pipeline (that's public-facing marketing photos; this is a
-- private handoff to one specific host). RLS: the provider who uploaded a
-- photo and the host of that booking can both read it; only the provider
-- can write.
create table public.event_gallery_photos (
  id uuid default gen_random_uuid() primary key,
  booking_id uuid references public.bookings(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamp with time zone default now()
);
alter table public.event_gallery_photos enable row level security;
create policy "Providers manage photos on their own bookings"
  on public.event_gallery_photos for all
  using (provider_id in (select id from public.providers where user_id = auth.uid()));
create policy "Hosts view photos on their own bookings"
  on public.event_gallery_photos for select
  using (booking_id in (select id from public.bookings where customer_id = auth.uid()));
create index idx_event_gallery_photos_booking on public.event_gallery_photos(booking_id);

-- Storage bucket for (7). Created here via SQL (not the dashboard) so it
-- ships with this migration — private, not public, same convention as the
-- existing provider_documents/guest_documents buckets.
insert into storage.buckets (id, name, public)
values ('event_gallery', 'event_gallery', false)
on conflict (id) do nothing;

create policy "Providers upload their own event gallery photos"
  on storage.objects for insert
  with check (
    bucket_id = 'event_gallery'
    and (storage.foldername(name))[1] in (select id::text from public.providers where user_id = auth.uid())
  );
create policy "Providers manage their own event gallery photos"
  on storage.objects for all
  using (
    bucket_id = 'event_gallery'
    and (storage.foldername(name))[1] in (select id::text from public.providers where user_id = auth.uid())
  );
create policy "Hosts view event gallery photos for their bookings"
  on storage.objects for select
  using (
    bucket_id = 'event_gallery'
    and exists (
      select 1 from public.event_gallery_photos p
      join public.bookings b on b.id = p.booking_id
      where p.storage_path = storage.objects.name
      and b.customer_id = auth.uid()
    )
  );
