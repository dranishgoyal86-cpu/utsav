-- Context-aware event_todos — replaces the one-time DEFAULT_ITEMS seed
-- (EventTodo.js) with a real template table + a re-sync engine that can
-- re-evaluate relevance on every load instead of only at first-open.
--
-- Grounded in the real live inventory from prior investigation: the exact
-- 26 DEFAULT_ITEMS, relevantIf's 7 form_data fields, refreshAutoTodos'
-- 15 live-signal checks (14 working, `invites` missing one), and the real
-- per-function case found: `beauty` conflates a Mehendi-specific booking
-- (mehendi artist) with a wedding-day booking (makeup artist) into one item.
--
-- ONE deviation from the sketched schema, flagged here: added
-- `condition_value text` (nullable) alongside `condition_field`. The given
-- schema's condition_field alone can only express "this form_data field is
-- truthy" — true for 6 of the 7 real relevantIf fields (all the `needsX`
-- booleans), but NOT for `location === 'venue'` (an equality check against a
-- string, not a truthiness check — `location: 'home'` is equally truthy and
-- must NOT match). Without this column, "Confirm venue"/"Venue site visit"
-- can't be represented correctly. condition_value stays null for every
-- truthy-check row; only the two location-gated rows use it.
create table if not exists public.event_todo_templates (
  id uuid primary key default gen_random_uuid(),
  event_type_slug text, -- null = applies to every event type (matches how DEFAULT_ITEMS behaves today — universal)
  sub_event_slug text,  -- null = whole-event; matches sub_events.slug, same join event_requirements uses
  section text not null,
  category text not null,
  title text not null,
  item_type text not null default 'manual', -- 'manual' | 'auto'
  kind text not null default 'task',
  condition_field text,      -- e.g. 'needsPhotography' — matches a saved_plans.form_data key, snapshot-time only
  condition_value text,      -- null = truthy check on condition_field; non-null = field must equal this value (see note above)
  auto_check_condition text, -- evaluated against LIVE context (lib/checklistContext.js), not form_data — e.g. 'is_home_venue'
  sort_order integer default 0
);

alter table public.event_todos add column if not exists template_id uuid references public.event_todo_templates(id);
alter table public.event_todos add column if not exists possibly_outdated boolean default false;

-- RLS: same host-or-accepted-delegate shape as event_functions/
-- event_accommodations (event_todo_templates has no event_id of its own —
-- it's global reference data, same category as event_requirements/
-- vendor_categories, so it only needs a public read policy, not an
-- owner-scoped one).
alter table public.event_todo_templates enable row level security;
create policy "Anyone can read todo templates"
  on public.event_todo_templates for select
  using (true);

-- ── Seed: the real 26 DEFAULT_ITEMS, verbatim, minus `beauty` (split into
-- two rows below) = 25 + 2 = 27 total. event_type_slug is null on every row
-- except the Mehendi split (confirmed live: sub_events.slug = 'mehendi'
-- exists ONLY under event_types.slug = 'hindu-wedding' — no other event type
-- has a Mehendi sub-event) — matching DEFAULT_ITEMS' own current behavior of
-- applying identically to every event type, changed only where the split
-- required it. ──
insert into public.event_todo_templates
  (event_type_slug, sub_event_slug, section, category, title, item_type, kind, condition_field, condition_value, auto_check_condition, sort_order)
values
  -- Guests
  (null, null, 'guests', 'guest_list', 'Make guest list', 'auto', 'task', null, null, null, 0),
  (null, null, 'guests', 'invites', 'Send guest invites', 'auto', 'task', null, null, null, 1),
  (null, null, 'guests', 'rsvp', 'Track RSVPs', 'auto', 'task', null, null, null, 2),
  (null, null, 'guests', 'rsvp_followup', 'Follow up with non-responders', 'manual', 'task', null, null, null, 3),
  (null, null, 'guests', 'seating', 'Plan seating arrangement', 'manual', 'task', null, null, null, 4),
  -- Venue & logistics
  (null, null, 'venue', 'venue', 'Confirm venue', 'auto', 'confirmation', 'location', 'venue', 'is_home_venue', 0),
  (null, null, 'venue', 'venue_visit', 'Venue site visit', 'manual', 'appointment', 'location', 'venue', 'is_home_venue', 1),
  (null, null, 'venue', 'transport', 'Arrange parking & transport', 'auto', 'task', null, null, null, 2),
  (null, null, 'venue', 'accommodation', 'Book guest accommodation', 'auto', 'task', null, null, null, 3),
  -- Vendors & services
  (null, null, 'vendors', 'vendor_chat', 'Chat with vendors', 'manual', 'task', null, null, null, 0),
  (null, null, 'vendors', 'photography', 'Finalize photographer & videographer', 'auto', 'confirmation', 'needsPhotography', null, null, 1),
  (null, null, 'vendors', 'catering', 'Food tasting', 'manual', 'appointment', 'needsCatering', null, null, 2),
  (null, null, 'vendors', 'decor', 'Decor meeting', 'manual', 'appointment', 'needsDecoration', null, null, 3),
  (null, null, 'vendors', 'music', 'Book DJ & music', 'auto', 'confirmation', 'needsMusic', null, null, 4),
  -- beauty split: mehendi artist is genuinely Mehendi-function-specific;
  -- makeup artist stays event-level (no single unambiguous "wedding day"
  -- sub-event slug to pin it to — pheras and reception are both plausible,
  -- so left broad rather than guessing one).
  ('hindu-wedding', 'mehendi', 'vendors', 'beauty_mehendi', 'Book mehendi artist', 'auto', 'confirmation', 'needsMehendi', null, null, 5),
  (null, null, 'vendors', 'beauty_makeup', 'Book makeup artist', 'auto', 'confirmation', 'needsMakeup', null, null, 5),
  (null, null, 'vendors', 'contracts', 'Sign vendor contracts', 'auto', 'confirmation', null, null, null, 6),
  -- Budget & payments
  (null, null, 'finance', 'budget', 'Budget check', 'auto', 'task', null, null, null, 0),
  (null, null, 'finance', 'advance_payment', 'Pay vendor advances', 'auto', 'payment', null, null, null, 1),
  (null, null, 'finance', 'final_payment', 'Clear final vendor payments', 'auto', 'payment', null, null, null, 2),
  -- Day-of prep
  (null, null, 'dayof', 'headcount', 'Confirm final headcount with caterer', 'manual', 'task', 'needsCatering', null, null, 0),
  (null, null, 'dayof', 'rehearsal', 'Rehearsal / run-through', 'manual', 'appointment', null, null, null, 1),
  (null, null, 'dayof', 'coordinator', 'Assign a day-of coordinator', 'manual', 'task', null, null, null, 2),
  (null, null, 'dayof', 'emergency_kit', 'Prepare an emergency kit', 'manual', 'task', null, null, null, 3),
  -- Wrap-up
  (null, null, 'wrapup', 'thankyou', 'Send thank-you notes', 'manual', 'task', null, null, null, 0),
  (null, null, 'wrapup', 'vendor_review', 'Review & rate vendors', 'auto', 'task', null, null, null, 1),
  (null, null, 'wrapup', 'final_settlement', 'Settle any remaining payments', 'auto', 'payment', null, null, null, 2);
