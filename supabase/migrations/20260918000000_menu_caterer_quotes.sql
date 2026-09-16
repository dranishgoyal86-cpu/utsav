-- Caterer quote requests — "share the menu with multiple caterers of the
-- host's choice to get an estimate, then book from whomever gives the
-- best price and quality" (Anish, Sept 16). Layered on top of the
-- existing menu Selecting/Pricing split (menu-planning-vs-execution-
-- split.md): MenuPricing.js (new screen, reached from MenuPlanner's
-- "Calculate pricing" bar) is where a host reviews price/qty/notes for
-- picked dishes AND, optionally, sends that dish list to one or more
-- Caterers-category providers to get a real quote back.
--
-- Purely additive — no changes to events or event_menu_selections.
--
-- menu_snapshot stores a COPY of the dish list at send time (jsonb array
-- of {dish_name, course_category, cuisine_slug, quantity, notes}) so a
-- later edit to event_menu_selections never silently changes what a
-- caterer already quoted against.
create table public.menu_quote_requests (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  host_id uuid references auth.users(id) on delete cascade,
  menu_snapshot jsonb not null,
  note text,
  status text not null default 'open', -- 'open' | 'closed'
  booked_response_id uuid,
  created_at timestamp with time zone default now()
);

-- One row per invited caterer (kind='platform') or per host-typed outside
-- quote (kind='manual', "include manual entries" — Anish, Sept 16).
-- Manual rows have no provider_id — nothing to notify, they exist purely
-- so the comparison table can show a non-Utsav caterer's price alongside
-- real in-app quotes.
create table public.menu_quote_responses (
  id uuid default gen_random_uuid() primary key,
  quote_request_id uuid references public.menu_quote_requests(id) on delete cascade,
  kind text not null default 'platform', -- 'platform' | 'manual'
  provider_id uuid references public.providers(id) on delete cascade,
  caterer_name text, -- manual rows only
  status text not null default 'invited', -- 'invited' | 'quoted' | 'declined' | 'manual' | 'booked'
  price int4,
  notes text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Circular reference (requests -> its winning response, response -> its
-- parent request) — added after both tables exist.
alter table public.menu_quote_requests
  add constraint menu_quote_requests_booked_response_fk
  foreign key (booked_response_id) references public.menu_quote_responses(id) on delete set null;

alter table public.menu_quote_requests enable row level security;
alter table public.menu_quote_responses enable row level security;

create policy "Hosts manage own quote requests"
  on public.menu_quote_requests for all
  using (host_id = auth.uid());

create policy "Hosts manage responses on their own requests"
  on public.menu_quote_responses for all
  using (quote_request_id in (select id from public.menu_quote_requests where host_id = auth.uid()));

create policy "Providers view their own invitations"
  on public.menu_quote_responses for select
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create policy "Providers update their own invitation response"
  on public.menu_quote_responses for update
  using (provider_id in (select id from public.providers where user_id = auth.uid()));

create index idx_menu_quote_requests_event on public.menu_quote_requests(event_id);
create index idx_menu_quote_responses_request on public.menu_quote_responses(quote_request_id);
create index idx_menu_quote_responses_provider on public.menu_quote_responses(provider_id);
