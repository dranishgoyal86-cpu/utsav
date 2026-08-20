# Utsav — Project Context for a Fresh Claude Session

Paste/attach this file at the start of a new conversation to skip re-exploring
the codebase. It documents what's built, how the major systems fit together,
and the conventions/gotchas discovered the hard way. It is a snapshot as of
2026-08-07 — always spot-check anything load-bearing against the live
code/DB before acting on it, since the app keeps moving.

## What Utsav is

A React Native (Expo SDK 54) + Supabase events-planning marketplace for
India. Customers plan an event (wedding, birthday, housewarming, corporate
event, etc.), get a checklist of what to arrange with price estimates, book
vendors ("providers") through the marketplace, manage guests/RSVPs/seating/
gifts/gate entry, and share a photo album. Providers list services, respond
to bookings, run their own mini-ERP (invoices, availability, portfolio). A
separate `utsav-admin` React web app handles admin review (verification,
category requests, user management). 10% commission model, 14 RLS-enabled
tables at minimum.

## Stack & non-negotiable conventions

- React Native + Expo SDK 54, Supabase (Postgres + Auth + RLS + Storage),
  Cloudinary (image hosting), AWS Rekognition (face-match photo search),
  Razorpay (payments, currently credential-blocked — see Blockers).
- PowerShell on Windows. `npm install --legacy-peer-deps` always. Expo
  packages via `npx expo install <pkg>`.
- **Never** `@react-native-community/datetimepicker` — banned, use the
  shared `components/CalendarPicker.js`.
- **No Supabase nested joins beyond one level.** Run two separate queries
  and combine in JS. This bit the project repeatedly early on
  (`services.city` doesn't exist — city lives on `providers.city` only;
  `bookings.event_id` doesn't exist — links via `bookings.saved_plan_id` →
  `saved_plans.event_id`, a two-hop bridge used everywhere bookings need to
  be tied back to an event).
- **Hooks must never be called conditionally or inside nested/inline
  component definitions.** This project broke twice from "Invalid hook
  call" from an inner component calling `useTheme()`. Sub-components live
  at module scope; `theme` is passed in as a prop, `const s = makeStyles(theme)` at
  the top of every screen.
- **Route params carry `eventId` only, never a full event object.** Screens
  resolve everything through `hooks/useEventContext.js`. (This was a full
  retrofit — see "Event Context Layer" below. A couple of large, recently-
  stabilized screens — `GuestList.js`, `EventTodo.js` — were deliberately
  left on their own older self-correcting-refetch pattern rather than fully
  migrated, to avoid destabilizing them; flagged, not an oversight.)
- Styling tokens (never hardcode colors): `bg`, `bgSecondary`, `bgTertiary`,
  `cardBg`, `text`, `textSecondary`, `textTertiary`, `border`, `accent`
  (`#E8A020` amber), `btnPrimary`, `btnPrimaryText`. Apple/Notion aesthetic,
  light/dark via `ThemeContext.js`.
- Create new files via VS Code (not terminal `touch` — encoding issues).
- Migration convention: SQL is written to `supabase/migrations/*.sql` and
  **printed for the user to paste into the Supabase SQL editor themselves —
  never executed automatically**, unless explicitly told otherwise.
  Several migration files in that folder are NOT YET RUN on the live DB —
  always verify current schema via `npx supabase db query --linked "..."`
  before assuming a column/table exists. Don't trust the filename list alone.
- Verification convention: `scripts/verify*.js` — hand-written fixtures fed
  through the real pure `lib/*.js` functions via a Babel-transform-then-
  `Module._compile` shim (`loadEsmAsCjs`), asserting PASS/FAIL per case, run
  with plain `node`. Every core pure module has one:
  `verifyPlanEngine.js`, `verifyCapabilities.js`, `verifyRequirements.js`,
  `verifyEventContext.js`, `verifyCloudinaryDelete.js`.
- Bundle-sanity convention (no browser tool in this environment): kill port
  8082 → `CI=1 npx expo start --web --port 8082 --clear` → poll for HTTP 200
  → `curl .../index.bundle?platform=web&dev=true` to force full compilation
  → grep the bundle for new-code markers → check server log for
  `Web Bundled ... (N modules)` with no errors → stop the server.

## The single biggest recurring lesson

**Every detailed build spec handed to Claude this project has contained at
least one real, verifiable factual error** — a file that doesn't exist
(`InviteCard.js`, `EventChecklist.js`, `MyEvents.js`), a schema assumption
that's wrong (`services.city`, `bookings.event_id`), a naming collision
(proposing `venue_address` when `events.venue` already exists), or a table
FK pointed at the wrong guest table (`guest_list` — 1 legacy row — instead
of `event_invitees` — the real, actively-used ~33-row guest table).
**Verify every claim against the live DB/code before implementing, every
time.** `npx supabase db query --linked "..."` is set up and working.

## Data model — the tables that matter, and their gotchas

- **`events`** — the hub row for a planned event. `host_id` = owner. Has
  grown organically: `event_type_slug`/`sub_type_slug` (new taxonomy, see
  below), `event_date`, `city`, `venue_type`, `venue` (free-text address —
  reused for home events, not a separate `venue_address` column),
  `venue_id` (FK → `venues`, for booked marketplace venues), `venue_label`,
  `society_name`, `flat_number`, `guest_count`, `child_age`, `theme`,
  `budget_total`, `is_dry_event`/`is_veg_only` (booleans, kept in sync with
  the newer `dietary_profile` text[] array), `dietary_notes`,
  `rsvp_deadline`, `arranged_categories` (text[]), `status` (`draft` etc.),
  `working_title` vs `name` (both exist — `renameEvent()` in `helpers.js`
  updates `name`; the new plan-engine flow display-prefers `working_title`),
  `gate_pass_issued_at`, `entry_start_time`/`entry_end_time`/`guard_phone`
  (gate/guard details), `rekognition_collection_id` + `invite_code` (face-
  match album setup).
- **`event_invitees`** — the REAL, live guest list (RSVP, plus_ones, tag,
  is_vip, table_number, checked_in_at, gift fields, allergies, invite_sent_at).
  `guest_list` is a separate, vestigial legacy table (1 row) — nothing
  guest-facing reads from it; if a spec says `guest_list`, it's wrong.
- **`saved_plans`** — compatibility bridge: `event_id` → `events.id`,
  mirrors `event_date`/`total_budget`/`title` so `PlanScreen.js`'s "YOUR
  PLANS" list and older screens keep working without live-joining `events`.
  Every plan-engine write to `event_date`/`budget_total` also mirrors into
  `saved_plans` for this reason.
- **`bookings`** — no `event_id` column. Links via `saved_plan_id` →
  `saved_plans.event_id`. Statuses actually used: `pending`,
  `payment_pending`, `confirmed`, `declined`, `completed` (NOT the plainer
  `pending`/`completed` some specs assume).
- **`services`** — a provider's listed offering. No `city` column (city is
  on `providers.city`). `category` is a legacy/informal string, bridged to
  the real vendor-category slug via `lib/vendorCategoryBridge.js`'s
  `resolveVendorCategorySlug()`.
- **`venues`** — bookable marketplace venues (banquet halls etc.):
  `provided_items` (text[]), `catering_policy`, `min_guest_guarantee`,
  `capacity_min/max`, `pricing_model`, `plate_rate_veg/nonveg`.
- **`albums`** — `user_id`, `name`, `event_id` (nullable), `cover_url`.
  Every event-creation path now creates a same-named linked album (see
  Photo/Album System below); `renameEvent()` keeps the names in sync.
- **`photos`** — `event_id`, `uploaded_by`, `cloudinary_url`,
  `cloudinary_public_id`, `client_ref` (unique per event, dedup key for the
  offline upload queue), `source`, `captured_at`, `rekognition_face_id`.
- **`capability_rules`** / **`provider_capability_rules`** — data-driven
  feature-visibility rules (see Capability Resolver below).
- **`guest_passes`** — gate-pass system (see Gate Pass System below).
- **`event_change_log`** — audit trail for event field changes, written by
  `useEventContext.js`'s `update()`.
- **`gift_stickers`**, **`return_gifts`** / **`return_gift_tiers`**,
  **`reciprocity_ledger`** — gift-tracking subsystem.
- **`event_requirements`** — static rule table (P1-P5 priority ladder of
  what to arrange per event type/context), read-once-cached, resolved by
  `lib/eventResolver.js`.
- **`vendor_categories`**, **`category_aliases`** — marketplace category
  taxonomy + fuzzy-matching aliases.
- Older/parallel-subsystem tables exist too (`event_workspace`,
  `event_budget`, `event_team`, `event_timeline`, `provider_billing`,
  `provider_claims`, `custom_categories`, `category_tiers`, etc. — mostly
  the Provider ERP / EventWorkspace side) — not part of the customer plan-
  engine flow, not detailed here; check live schema before touching.
- Two parallel event-type vocabularies exist and don't fully overlap:
  - **New/live** (`lib/eventTypeNames.js`'s `EVENT_TYPE_NAMES`, 16 slugs) —
    what `events.event_type_slug` actually gets set to today: e.g.
    `hindu-wedding`, `kids-birthday`, `adult-birthday`, `anniversary`,
    `mundan`, `baby-shower`, `housewarming`, `religious-event`,
    `corporate-conference`, `product-launch`.
  - **Old/dead** (a stale `event_types` table + old `capability_rules`
    seed data before this session's fix) — `corporate-event`,
    `godh-bharai`, `griha-pravesh`, `satyanarayan-katha`. Zero live rows
    ever match these. If you see them in a spec or old code, map:
    `corporate-event`→`corporate-conference`, `godh-bharai`→`baby-shower`,
    `griha-pravesh`→`housewarming`, `satyanarayan-katha`→`religious-event`.

## Core architectural systems

### 1. Event Context Layer (the newest foundational layer)

- **`lib/eventContext.js`** — pure module, zero React/Supabase imports.
  - `resolveVenue(event, venue)` — unifies "where is this event" across
    three sources: a booked marketplace venue (`venues` row via
    `event.venue_id`), a home address (`event.venue_type` is `'home'` or
    one of the granular `society_flat`/`society_clubhouse`/
    `independent_house` values — see `isHomeVenueType()`), or unset.
  - `resolveDietary(event)` — merges the legacy `is_veg_only`/`is_dry_event`
    booleans with the newer `dietary_profile` array into one shape
    (`plateRateKey`, human label like "Pure veg · Jain").
  - `buildContext(event, venue, bookings)` — the one resolved shape every
    consumer screen reads: `eventId`, `workingTitle`, `eventTypeSlug`,
    `date`/`dateLabel`/`daysUntil`, `rsvpDeadline` (defaults to 7 days
    before `date` if unset), `venue` (resolved), `dietary` (resolved),
    `guestCount`, `budgetTotal`, `bookingCount`/`confirmedBookingCount`, etc.
  - `dateChangeImpact(bookings, newDate)` — `{ affected, blocking }` —
    `blocking` = confirmed bookings (forces a confirmation before a date
    change goes through), `affected` = confirmed + payment_pending
    (notified once it does).
  - `isHomeVenueType(venueType)` — the ONE place `venue_type === 'home'`
    should be checked; treats the generic `'home'` and the three granular
    home-kind values as equivalent. **Never compare `venueType === 'home'`
    directly outside this function** — several real bugs came from doing so
    before this helper existed.
- **`hooks/useEventContext.js`** — the hook every screen uses.
  Shared in-memory cache keyed by `eventId` (two screens showing the same
  event see the same object and re-render together — this is what makes
  live propagation work with no remount). Returns
  `{ context, event, venue, bookings, loading, error, update, refresh }`.
  `update(patch, { force })` is the **sole write path** for event fields:
  writes to `events`, logs to `event_change_log`, and — if `event_date` is
  in the patch and a confirmed booking exists — returns
  `{ needsConfirmation: true, impact }` instead of writing, until called
  again with `{ force: true }`; a forced date change notifies every
  affected vendor (`notifications.js`'s `notifyEventDateChanged`).
- **`components/EventHeader.js`** — reusable tap-to-rename header (title,
  date, venue line, Google Calendar export button) built on
  `{ context, update }`.
- Retrofit status: most single-purpose screens (`VisitorList`,
  `AlbumModeration`, `CameraCapture`, `GiftStickers`, `ReturnGifts`,
  `SeatingChart`, `GatePass`, `FaceScan`, `CheckInScanner`) take `eventId`
  only and resolve everything via this hook. `PlanView.js` uses the
  separate, more specialized `hooks/useEventPlan.js` for its
  checklist/pricing data but sources venue info through the same
  `resolveVenue()`. `GuestList.js`/`EventTodo.js` were deliberately left on
  an older, still-correct (refetches fresh, doesn't trust stale params)
  pattern rather than fully migrated — large, recently-stabilized files,
  low risk/reward to touch further right now.

### 2. Event Planning Engine

Draft-first flow: **`PlanHero.js`** (free-text "describe your event" input,
matches event type via `lib/eventTypeNames.js`'s `matchEventTypeText()`,
creates a `draft` `events` row + linked `saved_plans` row + a same-named
linked `albums` row) → **`SlotPrompt.js`** (forces the two truly-blocking
fields one at a time: `sub_type_slug`, `event_date`, `city` — city joined
the blocking tier because too much else silently degrades without it) →
**`PlanView.js`** (the main plan screen: collapsible "Event details"
section — every field editable any time via `components/SlotField.js`, now
with a proper read-only-summary + **Modify**/**Save** toggle rather than
always-live editors; P1–P4 priority-ladder checklist sections; budget
summary; P5 "you may also need" off-ladder items; gate-pass card when
`entryControl` resolves; Google Calendar export).

- **`lib/eventResolver.js`** — `resolveRequirements(requirements, context,
  venue)` walks the static `event_requirements` rule table and buckets
  items into P1 (must-book) through P5, respecting guest-count/age bounds,
  dry/veg suppression, venue-provided-items suppression (a banquet hall
  that already provides tables/chairs/stage suppresses those checklist
  items; a home event's null-venue path suppresses nothing).
- **`lib/priceEngine.js`** — `estimateItem()` prices each checklist item:
  prefers a real live `serviceMedian` (computed fresh from active
  `services.price_from/price_to`, bridged to provider city) over a static
  reference band; venue pricing model (per-plate vs flat) via
  `estimateVenue()`/`applyPricingModel()`; `allocateBudget()` distributes a
  total budget across P1-P4 with contingency.
- **`hooks/useEventPlan.js`** — orchestrates all of the above per `eventId`,
  including the `bookings` two-hop bridge (`saved_plans.id` → `bookings`)
  needed to compute checklist progress.
- **`components/SlotField.js`** — one field-editor component per slot type
  (`sub_type_slug`, `event_date`, `city`, `venue_type` + home-kind
  sub-question, `location`, `guest_count`, `theme`, `dietary_restrictions`,
  `budget_total`), plus `slotApplies()`/`slotFilled()`/`slotDisplayValue()`/
  `SLOT_LABELS` pure helpers reused by `PlanView.js`'s read-only summary
  mode.
- `lib/eventSubTypes.js`, `lib/eventThemes.js` — per-event-type sub-type and
  theme option lists.

### 3. Capability Resolver — data-driven feature visibility

**`lib/capabilities.js`** (pure, zero React/Supabase):
`resolveCapabilities(rules, context)` filters a `capability_rules` array
against a flat context (`eventTypeSlug`, `venueType`, `guestCount`, `age`,
`isDryEvent`, `isVegOnly`, `hasBudget`, `hasSubEvents`, `hasBooking`,
`hasCompletedBooking`, `hasVenue`), then does **group exclusion**: within
any shared `group_key` (e.g. `entry_control`), only the highest-`priority`
surviving rule stays — this is what guarantees a banquet-hall wedding can
never show a society gate pass. Returns
`{ visible, secondary, byKey, entryControl }`. Also exports `isEnabled()`
and `generatePassCode()` (6-char codes, alphabet excludes I/O/0/1 so a
guard reading one aloud never has to disambiguate).

- **`hooks/useCapabilities.js`** — `useCapabilityRules()` (module-scope
  cached rule fetch), `useCapabilities(context)` (resolves against a
  hand-built context), `refreshCapabilityRules()`.
- **`hooks/useEventCapabilities.js`** — the `eventId`-based convenience
  wrapper, sources its context via `useEventContext` (not its own fetch).
  Used by `VisitorList`, `GiftStickers`, `ReturnGifts`, `GatePass`,
  `PlanView`, `GuestList`.
- Seed data lives in `supabase/migrations/capabilities.sql` (NOT YET RUN on
  the live DB as of this writing — `capability_rules`/
  `provider_capability_rules` tables don't exist live yet). Entry-control
  rules: `society_gate_pass` (priority 100, venue_types
  `society_flat`/`society_clubhouse`), `venue_attendance_qr` (90,
  `banquet_hall`/`farmhouse`/`hotel`/`outdoor`, 30-guest floor),
  `corporate_visitor_register` (80, `office`), `no_entry_control` (10,
  `independent_house`/`temple`). A null `venueType` makes every
  `venue_types`-scoped rule excluded, so an undecided venue never resolves
  an entry capability by accident.
- `screens/admin/CapabilitiesAdmin.js` — admin test console for the resolver.
- `scripts/verifyCapabilities.js` — 61 assertions covering group exclusion,
  5 full event fixtures, 3 provider fixtures, entryControl resolution
  across 7 venue/guest-count combinations, and `generatePassCode` uniqueness.

### 4. Gate Pass System (offline-first)

Routes entirely on `entryControl.capability_key` from the capability
resolver — **never branches on `venueType` directly**.

- **`screens/customer/GatePass.js`** — entry hub. Shows issued/checked-in
  counts + arrival progress bar, then branches: `society_gate_pass` → issue
  passes / share visitor list / open scanner; `venue_attendance_qr` → issue
  passes / open scanner; `corporate_visitor_register` → issue / scan /
  export CSV; `no_entry_control` or null → plain explanation, no disabled
  state.
- **`screens/customer/PassIssue.js`** — idempotent: one pass per guest in
  `event_invitees` (excluding `rsvp_status = 'no'`) who doesn't already
  have one; `party_size` = guest's `plus_ones + 1`.
- **`screens/customer/PassCard.js`** — one guest's shareable pass
  (`expo-print` → `expo-sharing`). Legibility hierarchy with the QR
  covered: guest name (largest) → society/flat or venue → date + entry
  window → 6-char code → QR last. QR encodes `PUBLIC_WEB_URL/p/{code}` (config.js — now `https://www.theutsavapp.com`).
- **`screens/customer/PassScanner.js`** — `CameraView` barcode scan +
  manual code entry fallback. Four outcomes (valid / already-checked-in /
  not-found / void), each held ~2.2s before auto-returning to scanning.
  Party-size stepper for partial-household admission. **Needs an EAS
  dev-client build — does not work in Expo Go.**
- **`lib/passQueue.js`** — mirrors `lib/uploadQueue.js`'s offline-first
  shape. `syncPasses(eventId)` is the only network call — caches the full
  pass list to `AsyncStorage` ahead of time. `lookupPass()` and
  `recordCheckIn()` are **local-only, zero network calls, by design** —
  venue entry is exactly where connectivity fails. `drainCheckIns()`
  syncs the queue when back online; a pass checked in from two offline
  devices converges on **earliest `checked_in_at`, highest
  `arrived_count`** (read-merge-write, not a single atomic statement —
  acceptable given how infrequent simultaneous check-ins at one gate are).
- `guest_passes` table already existed live before this feature was
  finished (0 rows) — created by an earlier incomplete pass, with its
  `guest_id` FK wrongly pointed at legacy `guest_list` instead of the real
  `event_invitees`; fixed via `supabase/migrations/gate_pass.sql`'s
  explicit `ALTER`.
- The **old**, simpler check-in path (`CheckInScanner.js`, writing directly
  to `event_invitees.checked_in_at`, online-only, no capability gating) is
  now orphaned/unreachable from the UI (confirmed zero real check-ins ever
  happened on it) — file left in place but no longer linked from
  `GuestList.js`.

### 5. Guest Management

- **`GuestList.js`** — the hub. RSVP tracking, meal preferences, VIP
  flagging, tag-based grouping, invite designer (modal-based, no separate
  `InviteCard.js` file — a spec asking for one is wrong), per-guest
  WhatsApp send (`wa.me`, one chat at a time — no true bulk blast without
  WhatsApp's paid Business API), bulk "Send all passes" (one combined
  multi-page PDF through the system share sheet), utility chip row
  (Seating / Gate passes / Gate list / Meal counts / Gifts).
- **`SeatingChart.js`** — tap-to-assign tables, auto-group-by-tag, no
  drag-and-drop (no gesture-library precedent in this app).
- **`VisitorList.js`** — RWA/society gate list export (text share, PDF),
  gated behind the `society_gate_pass` capability.
- **`GiftStickers.js`** / **`ReturnGifts.js`** / **`ReciprocityLedger.js`** —
  gift tracking, return-gift tier assignment, wedding-gift reciprocity ledger.

### 6. Photo/Album System

- **`AlbumsScreen.js`** / **`AlbumDetailScreen.js`** — album CRUD, optional
  paired `events` row for face-matching setup (opt-in, not automatic).
- **Every event-creation path now creates a same-named linked album**
  (`albums.event_id` = the new event): `EventPlanner.js` (legacy flow),
  `GuestList.js` (standalone new-list flow), and `PlanHero.js` (new
  plan-engine flow — this was the one gap, fixed 2026-08-07).
  `renameEvent()` (`helpers.js`) keeps `albums.name` in sync with the event
  on every rename, along with `saved_plans.title` and
  `event_invite_designs.label`.
- **`CameraCapture.js`** + **`lib/uploadQueue.js`** — offline-first photo
  capture. `enqueue()` never touches the network (copies the file locally,
  appends a queue entry); `drain()` uploads to Cloudinary then inserts the
  `photos` row only once confirmed, deleting the local copy only after
  that; a `client_ref` unique index prevents duplicate rows even from a
  killed-mid-upload retry. Only registered Utsav accounts can upload — no
  anonymous/guest-name upload path (explicitly removed by request).
- **`AlbumModeration.js`** — host moderation (hide/delete photos, toggle
  guest capture on/off).
- **`FaceScan.js`** — guest-facing selfie → AWS Rekognition face search
  against the event's photos, native-only (web shows a fallback).

### 7. Notifications

**`notifications.js`** — `saveNotificationToDb()` + `sendPushNotification()`
+ one `notify*()` function per event type (`notifyBookingConfirmed`,
`notifyNewBooking`, `notifyBookingDeclined`, `notifyNewMessage`,
`notifyPaymentReceived`, `notifyTodoCompleted`, `notifyInvoiceGenerated`,
`notifyProviderVerified`, `notifyAccountSuspended/Reactivated`,
`notifyEventDateChanged`). Every notification carries enough `data` (ids)
for `NotificationsScreen.js` to deep-link to the right screen on tap —
this needed a dedicated fix earlier since several `notify*()` calls were
missing the ids required to link at all. Removable per-row + clear-all.
Real push notifications need an EAS dev-client build (Expo Go can't).

### 8. Auth & Roles

Three roles: customer, provider, admin — `App.js` has 4 navigation
branches gated by role + a central suspend/block check on login.
**Providers cannot self-signup** — only "claim" an existing unclaimed
marketplace listing, via a single OTP-gated wizard
(`screens/ClaimVendorFlow.js`) that currently runs with
**`OTP_ENABLED = false`** (no SMS provider configured yet — plain
email+password `createAccountNoOtp()` path is live instead; all the OTP
code is intact and just needs the flag flipped once a real SMS provider is
set up, a must-have before launch). Claim flow: category picked first
(hidden until typed), multi-select subcategories (each auto-creates a
`services` row on admin approval), stringent document requirements,
submitting signs the vendor out (doesn't drop them straight into customer
tabs).

### 9. Provider side

`ProviderERP.js` (booking accept/decline — deliberately kept as binary
decision UI, not a swipe-to-action candidate), `EventWorkspace.js`,
`AddServiceScreen.js` (category locked after creation — cross-category
changes require a formal admin request, no in-app escape hatch),
`AvailabilityScreen.js`, `InvoiceGenerator.js`/`InvoicesList.js`,
`PortfolioScreen.js`, `VerificationScreen.js` (PAN/Udyam/GST doc upload to
a private bucket), `BillingProfile.js`. Desktop gets a persistent left
sidebar (react-navigation v7 `tabBarPosition: 'left'`, web ≥768px); mobile
keeps the bottom tab bar.

## Screen inventory (by area)

- **Customer plan flow**: `PlanHero`, `SlotPrompt`, `PlanView`, `ItemDetail`,
  `VenuePicker`, `ComparePlans`, `EventPlanner` (legacy, still live)
- **Guests/gate**: `GuestList`, `VisitorList`, `SeatingChart`, `GatePass`,
  `PassIssue`, `PassCard`, `PassScanner`, `CheckInScanner` (orphaned),
  `GiftStickers`, `ReturnGifts`, `ReciprocityLedger`, `GuestAccess`,
  `EventTodo`
- **Photos**: `AlbumsScreen`, `AlbumDetailScreen`, `AlbumModeration`,
  `CameraCapture`, `FaceScan`, `ShareEventPhotos`
- **Marketplace**: `DiscoverScreen`, `SearchScreen`, `CategoryList`,
  `ProviderProfile`, `ProviderReviews`, `WriteReview`, `SavedProviders`,
  `BlockedProviders`, `PersonalVendors`, `PersonalVendorChat`
- **Bookings/payments**: `BookingsScreen`, `CreateBookingScreen`,
  `PaymentReceipt`, `ChatScreen`, `InboxScreen`
- **Account**: `ProfileScreen`, `NotificationsScreen`
- **Auth**: `LoginScreen`, `SignupScreen`, `RoleSelect`, `ClaimVendorFlow`,
  `ClaimBusiness`
- **Guest-facing (no login)**: `RSVPScreen`
- **Provider**: see "Provider side" above
- **Admin**: `AdminPanel`, `CapabilitiesAdmin`, `CategoryRequests`,
  `CategoryUpgradeRequests`, `ClaimRequests`, `ManageUsers` (plus the
  separate `utsav-admin` React web app)

## Known blockers (unresolved as of this writing)

- **EAS dev-client build needed** to test Razorpay native checkout,
  real push notifications, and native voice input on-device — none run in
  Expo Go. QR check-in (`PassScanner.js`/old `CheckInScanner.js`) also
  needs a dev-client build specifically for barcode scanning (unlike other
  `expo-camera` uses, which work fine in Expo Go).
- **Razorpay**: `create-razorpay-order` edge function gets "Authentication
  failed" from Razorpay's own API — pre-existing key-pair issue, not an
  app-code bug. Needs regenerating keys on the Razorpay dashboard.
- **SMS OTP**: no provider configured (`OTP_ENABLED = false` in
  `ClaimVendorFlow.js`) — needs a real Twilio/MSG91/Vonage account before
  going live. Email OTP works today (just needs the Supabase "Change Email
  Address" template edited to include `{{ .Token }}`).
- **Migrations not yet run on live DB** (verify before assuming): at least
  `capabilities.sql`, `event_context.sql`, `gate_pass.sql` as of this
  writing — check `information_schema.tables`/`columns` via
  `npx supabase db query --linked` rather than trusting the file list.

## Working conventions worth preserving

- Reuse established helpers rather than rewriting: `helpers.js`
  (`uploadToCloudinary`, `renameEvent`, `googleCalendarUrl`, `showAlert`,
  `confirmDestructive`, `toWhatsappNumber`, `callEdgeFunction`), don't
  duplicate.
- CSV export pattern: `FileSystem.writeAsStringAsync` + `csvEscape()` +
  `Sharing.shareAsync` (see `ReturnGifts.js`/`GatePass.js`).
- Swipe-to-delete/archive via `components/SwipeableRow.js` (plain RN
  `PanResponder`, no gesture library) is the established list-interaction
  pattern — used consistently, not per-screen reinvented.
- Confirmation dialogs: `confirmDestructive()` from `helpers.js`, not raw
  `Alert.alert` (a past sweep found ~90 silent/unprotected `Alert.alert`
  calls across the app and fixed them — don't reintroduce the pattern).
- When a spec's file/table/column name doesn't match what you find live,
  don't guess — verify, then flag the deviation clearly in your summary
  rather than silently reinterpreting or silently complying with something
  broken.
