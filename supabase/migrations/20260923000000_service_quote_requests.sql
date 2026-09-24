-- Quote-first booking, generalized to every service category — "when
-- hosts go to bookings he should ask for quotes from the providers rather
-- than direct booking... scope it to all the service providers" (Anish,
-- Sept 23). Same shape as menu_quote_requests/menu_quote_responses
-- (20260918000000_menu_caterer_quotes.sql), deliberately a sibling table
-- rather than a rework of it — Menu's version is already shipped and
-- working, no reason to risk it by merging the two.
--
-- Purely additive — no changes to events, bookings, or the Menu quote
-- tables. item_name is the checklist item this request is for (e.g.
-- "Photographer"), category_slug is the vendor category being quoted
-- (vendorTaxonomy.js slug), so the provider-side inbox can filter to just
-- what a given provider actually offers.
create table public.service_quote_requests (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  host_id uuid references auth.users(id) on delete cascade,
  item_name text not null,
  category_slug text not null,
  note text,
  status text not null default 'open', -- 'open' | 'closed'
  booked_response_id uuid,
  created_at timestamp with time zone default now()
);

-- One row per invited provider (kind='platform') or per host-typed outside
-- quote (kind='manual'). Manual rows have no provider_id — nothing to
-- notify, they exist purely so the comparison list can show a non-Utsav
-- vendor's price alongside real in-app quotes.
create table public.service_quote_responses (
  id uuid default gen_random_uuid() primary key,
  quote_request_id uuid references public.service_quote_requests(id) on delete cascade,
  kind text not null default 'platform', -- 'platform' | 'manual'
  provider_id uuid references public.providers(id) on delete cascade,
  vendor_name text, -- manual rows only
  status text not null default 'invited', -- 'invited' | 'quoted' | 'declined' | 'manual' | 'booked'
  price int4,
  notes text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Circular reference (requests -> its winning response, response -> its
-- parent request) — added after both tables exist.
alter table public.service_quote_requests
  add constraint service_quote_requests_booked_response_fk
  foreign key (booked_response_id) references public.service_quote_responses(id) on delete set null;

alter table public.service_quote_requests enable row level security;
alter table public.service_quote_responses enable row level security;

create policy "Hosts manage own service quote requests"
  on public.service_quote_requests for all
  using (host_id = auth.uid());

create policy "Hosts manage responses on their own service quote requests"
  on public.service_quote_responses for all
  using (quote_request_id in (select id from public.service_quote_requests where host_id = auth.uid()));

create policy "Providers view their own service quote invitations"
  on public.service_quote_responses for select
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers update their own service quote response"
  on public.service_quote_responses for update
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create index idx_service_quote_requests_event on public.service_quote_requests(event_id);
create index idx_service_quote_responses_request on public.service_quote_responses(quote_request_id);
create index idx_service_quote_responses_provider on public.service_quote_responses(provider_id);
