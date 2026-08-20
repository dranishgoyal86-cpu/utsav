-- Gift sticker system: bind physical gifts to guests at the gate, reveal later.
--
-- guest_id references public.event_invitees (NOT public.guest_list) — verified
-- against the live project that guest_list is a legacy/vestigial table (1 row,
-- referenced only in a cascade-delete helper) while event_invitees is the real,
-- actively-used guest table every other guest-facing feature in this app reads
-- from (39 real rows at time of writing). Pointing this FK at guest_list would
-- make the gift-binding guest search return nothing real.
create table public.gift_stickers (
  id uuid default gen_random_uuid() primary key,
  event_id uuid references public.events(id) on delete cascade,
  sticker_code text not null,
  guest_id uuid references public.event_invitees(id) on delete set null,
  gift_type text,
  amount int4,
  item_description text,
  photo_url text,
  is_opened boolean default false,
  thank_you_sent boolean default false,
  bound_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  unique(event_id, sticker_code)
);

alter table public.gift_stickers enable row level security;

create policy "Hosts manage own event stickers"
  on public.gift_stickers for all
  using (
    event_id in (select id from public.events where host_id = auth.uid())
  );

create index idx_stickers_event on public.gift_stickers(event_id);
create index idx_stickers_code on public.gift_stickers(sticker_code);
