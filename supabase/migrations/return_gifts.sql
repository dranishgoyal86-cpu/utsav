-- Return gift & reciprocity tracking.
--
-- guest_id references public.event_invitees (NOT public.guest_list) in both
-- return_gifts and reciprocity_ledger — verified against the live project
-- that guest_list is a legacy/vestigial table (1 row) while event_invitees
-- is the real, actively-used guest table (35 real rows at time of writing),
-- matching the same correction already applied to gift_stickers.guest_id.
--
-- Dependency note: this feature reads gift_stickers at runtime (median/
-- reciprocity computation). That table was written but NOT yet applied in
-- an earlier pass (supabase/migrations/gift_stickers.sql) — confirmed via a
-- live schema check that it does not exist yet. Run gift_stickers.sql
-- before this file, or the ReturnGifts screen's queries will fail.
create table public.return_gift_tiers (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  description text,
  estimated_value int4,
  is_default boolean default false,
  sort_order int4 default 0,
  created_at timestamp with time zone default now()
);

create table public.return_gifts (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  guest_id uuid references public.event_invitees(id) on delete cascade,
  tier_id uuid references public.return_gift_tiers(id) on delete set null,
  status text default 'pending',
  delivery_method text,
  courier_tracking text,
  given_at timestamp with time zone,
  suggestion_dismissed boolean default false,
  notes text,
  created_at timestamp with time zone default now(),
  unique(event_id, guest_id)
);

create table public.reciprocity_ledger (
  id uuid default gen_random_uuid() primary key,
  host_id uuid references auth.users(id) on delete cascade,
  guest_id uuid references public.event_invitees(id) on delete set null,
  source_event_id uuid references public.events(id) on delete set null,
  guest_name text not null,
  guest_phone text,
  amount_received int4,
  gift_description text,
  received_on date,
  is_settled boolean default false,
  settled_note text,
  created_at timestamp with time zone default now()
);

alter table public.return_gift_tiers enable row level security;
alter table public.return_gifts enable row level security;
alter table public.reciprocity_ledger enable row level security;

create policy "Hosts manage own event tiers"
  on public.return_gift_tiers for all
  using (event_id in (select id from public.events where host_id = auth.uid()));

create policy "Hosts manage own return gifts"
  on public.return_gifts for all
  using (event_id in (select id from public.events where host_id = auth.uid()));

create policy "Hosts manage own ledger"
  on public.reciprocity_ledger for all
  using (host_id = auth.uid());

create index idx_return_gifts_event on public.return_gifts(event_id);
create index idx_ledger_host on public.reciprocity_ledger(host_id);
