// Pure event-context resolvers — no React, no Supabase. Takes raw rows
// (events/venues/bookings, already fetched by hooks/useEventContext.js) and
// derives the shapes every consumer screen actually wants to render, instead
// of each screen re-deriving its own slice of the same logic.
//
// events.venue_type lands on 'home' the moment the broad "At home" chip is
// picked (components/SlotField.js's VenueTypeField) — the specific kind
// (society_flat / society_clubhouse / independent_house, the values the
// society_gate_pass capability rule and the old EventPlanner.js flow both
// already used) only overwrites it once the home sub-question is answered.
// Both states mean the same thing for resolution purposes: "no venues row,
// address text lives on events.venue itself" — isHomeVenueType() treats them
// as one group so nothing has to wait on the sub-question to work.
const SPECIFIC_HOME_VENUE_TYPES = ['society_flat', 'society_clubhouse', 'independent_house'];
export function isHomeVenueType(venueType) {
  return venueType === 'home' || SPECIFIC_HOME_VENUE_TYPES.includes(venueType);
}

// events.event_time is stored as 24-hour "HH:MM" text (components/
// SlotField.js's EventTimeField is the only writer) — this is the shared
// display formatter every consumer (invite designer, RSVP page, bookings,
// provider screens) uses, kept here rather than in SlotField.js itself so
// screens that only need the formatter (e.g. the guest-facing, unauthed
// RSVPScreen.js) aren't pulling in SlotField's whole component/hook graph
// just for one pure string function.
export function formatTimeLabel(hhmm) {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  if (!Number.isInteger(h)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${period}`;
}

// Booking statuses this codebase actually uses (confirmed against live
// data/ProviderERP.js) — 'pending' from the original spec doesn't exist here,
// the real in-flight status is 'payment_pending'.
const BLOCKING_BOOKING_STATUSES = ['confirmed'];
const AFFECTED_BOOKING_STATUSES = ['confirmed', 'payment_pending'];

// events.venue is the pre-existing free-text address column (reused here
// instead of a new venue_address column — see the migration's comment).
// lat/lng added for the upcoming proximity/geofencing features — sourced
// from venues.latitude/longitude on the booked-venue path, and
// events.venue_lat/venue_lng (set by LocationAutocomplete's onSelect, via
// GuestList.js's persistVenue) on the free-text/home path. Both stay null
// until a host actually re-picks an address through the autocomplete
// suggestion flow — a typed-with-no-suggestion-picked address, or any venue
// set before this shipped, has no coordinates yet. Every consumer of
// resolveVenue() must already tolerate isSet:true with lat/lng:null.
export function resolveVenue(event, venue) {
  if (!event) {
    return {
      isSet: false, source: null, label: null, address: null, mapsLink: null,
      venueType: null, providedItems: [], cateringPolicy: null,
      minGuestGuarantee: null, capacityMin: null, capacityMax: null,
      societyName: null, flatNumber: null, lat: null, lng: null,
    };
  }

  if (event.venue_id && venue) {
    return {
      isSet: true, source: 'venue', label: venue.name || null, address: venue.address || null,
      mapsLink: venue.maps_link || null, venueType: venue.venue_type || null,
      providedItems: venue.provided_items || [], cateringPolicy: venue.catering_policy || null,
      minGuestGuarantee: venue.min_guest_guarantee ?? null,
      capacityMin: venue.capacity_min ?? null, capacityMax: venue.capacity_max ?? null,
      societyName: null, flatNumber: null,
      lat: venue.latitude ?? null, lng: venue.longitude ?? null,
    };
  }

  if (isHomeVenueType(event.venue_type)) {
    return {
      isSet: !!(event.venue || event.society_name),
      source: 'home', label: event.venue_label || null, address: event.venue || null,
      mapsLink: event.maps_link || null, venueType: event.venue_type,
      providedItems: [], cateringPolicy: null, minGuestGuarantee: null,
      capacityMin: null, capacityMax: null,
      societyName: event.society_name || null, flatNumber: event.flat_number || null,
      lat: event.venue_lat ?? null, lng: event.venue_lng ?? null,
    };
  }

  return {
    isSet: false, source: null, label: null, address: null, mapsLink: null,
    venueType: event.venue_type || null, providedItems: [], cateringPolicy: null,
    lat: null, lng: null,
    minGuestGuarantee: null, capacityMin: null, capacityMax: null,
    societyName: null, flatNumber: null,
  };
}

const DIETARY_LABELS = {
  veg_only: 'Pure veg',
  jain: 'Jain',
  no_onion_garlic: 'No onion/garlic',
  satvik: 'Satvik',
  halal: 'Halal',
  dry_event: 'Dry event',
};

// dietary_profile (text[]) is the new source of truth; is_veg_only/
// is_dry_event stay in sync as booleans because the price engine and
// eventResolver.js's requirement filtering read those booleans directly, not
// the array — hooks/useEventContext.js's update() keeps them in lockstep on
// every write.
export function resolveDietary(event) {
  const profile = event?.dietary_profile || [];
  const isVegOnly = !!event?.is_veg_only || profile.includes('veg_only');
  const isDry = !!event?.is_dry_event || profile.includes('dry_event');

  const labels = [];
  if (isVegOnly && !profile.includes('veg_only')) labels.push(DIETARY_LABELS.veg_only);
  for (const tag of profile) {
    if (DIETARY_LABELS[tag]) labels.push(DIETARY_LABELS[tag]);
  }
  if (isDry && !profile.includes('dry_event') && !labels.includes(DIETARY_LABELS.dry_event)) labels.push(DIETARY_LABELS.dry_event);

  return {
    profile,
    isVegOnly,
    isDry,
    isJain: profile.includes('jain'),
    isSatvik: profile.includes('satvik'),
    isHalal: profile.includes('halal'),
    noOnionGarlic: profile.includes('no_onion_garlic'),
    notes: event?.dietary_notes || null,
    plateRateKey: isVegOnly ? 'veg' : 'nonveg',
    label: labels.length > 0 ? labels.join(' · ') : 'No dietary restrictions set',
  };
}

// Date-only arithmetic, deliberately avoiding toISOString() — it converts to
// UTC, which shifts the date by one in any timezone ahead of UTC (this app's
// primary market, India, is UTC+5:30).
function sevenDaysBefore(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// Single resolved shape every retrofitted screen reads from — bookings must
// already be pre-resolved via the saved_plans two-hop bridge (bookings has
// no event_id column), matching hooks/useEventPlan.js's existing pattern.
export function buildContext(event, venue, bookings = []) {
  if (!event) return null;

  const venueCtx = resolveVenue(event, venue);
  const dietary = resolveDietary(event);
  const date = event.event_date || null;

  return {
    eventId: event.id,
    workingTitle: event.working_title || null,
    eventTypeSlug: event.event_type_slug || null,
    subTypeSlug: event.sub_type_slug || null,
    // Not the same concept as subTypeSlug (age-band-style selector on the
    // event itself) — a wedding "sub-event" (mehendi/haldi/sangeet) is a
    // per-booking tag (bookings.sub_event_id), not a property of the whole
    // event, so there's no single per-event value to surface here.
    subEventSlug: null,
    date,
    dateLabel: date ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
    daysUntil: daysUntil(date),
    isPast: date ? daysUntil(date) < 0 : false,
    rsvpDeadline: event.rsvp_deadline || (date ? sevenDaysBefore(date) : null),
    city: event.city || null,
    venue: venueCtx,
    dietary,
    guestCount: event.guest_count ?? null,
    childAge: event.child_age ?? null,
    theme: event.theme || null,
    budgetTotal: event.budget_total ?? null,
    hasChildren: !!event.has_children,
    hasOutstationGuests: !!event.has_outstation_guests,
    hasForeignGuests: !!event.has_foreign_guests,
    hasPets: !!event.has_pets,
    status: event.status || null,
    arrangedCategories: event.arranged_categories || [],
    bookingCount: bookings.length,
    confirmedBookingCount: bookings.filter(b => b.status === 'confirmed').length,
  };
}

// Warn-before-date-change: `blocking` (confirmed bookings) forces a
// confirmation prompt; `affected` (confirmed + payment_pending) is the fuller
// list shown to the host and the set notified once the change goes through.
export function dateChangeImpact(bookings, newDate) {
  const list = bookings || [];
  return {
    affected: list.filter(b => AFFECTED_BOOKING_STATUSES.includes(b.status)),
    blocking: list.filter(b => BLOCKING_BOOKING_STATUSES.includes(b.status)),
    newDate,
  };
}
