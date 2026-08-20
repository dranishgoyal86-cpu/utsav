// Pure context builder shared by BOTH event_requirements' resolveRequirements()
// (lib/eventResolver.js) and event_todos' resolveTodoTemplates()
// (lib/todoResolver.js) — they stay two separate systems (different tables,
// different resolvers, per the task brief), but agree on what "the event's
// real situation" means, computed once, so a rule written against one
// vocabulary works unchanged against the other. No React/Supabase imports —
// same "plain data in, plain data out" convention as eventResolver.js/
// eventContext.js, unit-testable via a plain Node script.
//
// Deliberately NOT added into eventContext.js's buildContext() — that
// function's nested shape (dietary.isDry, venue.venueType, ...) is already
// consumed by several live screens (PlanView.js, ItemDetail.js, ...);
// reshaping it into the flat shape resolveRequirements()/
// resolveTodoTemplates() expect would risk breaking those. This reuses
// buildContext()'s underlying pieces instead — resolveVenue(),
// resolveDietary(), isHomeVenueType() — rather than reimplementing them.

import { resolveVenue, resolveDietary, isHomeVenueType } from './eventContext';

// Rough month -> season heuristic for this app's primary market (North
// Indian event planning). A guess, documented explicitly so it's easy to
// revisit: Dec-Feb is the classic peak wedding season (winter), Mar-Jun
// summer, Jul-Sep monsoon, Oct-Nov the second (post-monsoon) wedding season.
// Index 0 = January.
const MONTH_TO_SEASON = [
  'winter', 'winter', 'summer', 'summer', 'summer', 'summer',
  'monsoon', 'monsoon', 'monsoon', 'autumn', 'autumn', 'winter',
];
export function monthToSeason(monthIndex) {
  return MONTH_TO_SEASON[monthIndex] ?? null;
}

// events.event_time is "HH:MM" 24-hour text (see eventContext.js's own
// comment on formatTimeLabel). Threshold is a guess, not derived from any
// existing rule in this codebase — before 17:00 counts as day, 17:00 and
// later as night. Adjust here if real usage disagrees.
const NIGHT_STARTS_AT_HOUR = 17;
function timeOfDayFromEventTime(eventTime) {
  if (!eventTime) return null;
  const h = parseInt(eventTime.split(':')[0], 10);
  if (!Number.isInteger(h)) return null;
  return h < NIGHT_STARTS_AT_HOUR ? 'day' : 'night';
}

// invitees: real event_invitees rows for this event (only is_outstation is
// read — pass [] if not fetched). formData: saved_plans.form_data, or null
// — only used for the timeOfDay fallback here; condition_field matching
// against formData happens separately in each resolver, this function never
// reads condition-specific fields itself.
export function buildChecklistContext(event, venue, invitees = [], formData = null) {
  if (!event) return null;

  const venueCtx = resolveVenue(event, venue);
  const dietary = resolveDietary(event);
  const isHomeVenue = venueCtx.source === 'home' || isHomeVenueType(event.venue_type);
  // 'outdoor' is a real venue_type value (EventPlanner.js's "⛺ Outdoor
  // venue" chip, also used live in capability rules — venue_attendance_qr's
  // venue_types list). Checked on both the resolved venue's own type
  // (booked-venue path) and the raw event.venue_type (home/unset path),
  // same two-source shape isHomeVenue above already uses.
  const isOutdoor = venueCtx.venueType === 'outdoor' || event.venue_type === 'outdoor';

  const eventMonth = event.event_date ? new Date(event.event_date + 'T00:00:00').getMonth() : null;
  const season = eventMonth != null ? monthToSeason(eventMonth) : null;

  // events.event_time wins when set; saved_plans.form_data.timeOfDay (the
  // host's ☀️/🌙 pick during planning, EventPlanner.js) is the fallback —
  // never guessed from season or anything else if both are absent.
  const timeOfDay = timeOfDayFromEventTime(event.event_time) || formData?.timeOfDay || null;

  // Real per-guest signal, not the coarse events.has_outstation_guests
  // checkbox — confirmed via live data (prior investigation) that the
  // checkbox is unused (all 53 real events: false) while is_outstation is
  // the actual field RSVPScreen.js/GuestDetailModal.js write to.
  const hasOutstationGuests = (invitees || []).some(g => g.is_outstation);

  return {
    eventTypeSlug: event.event_type_slug || null,
    guestCount: event.guest_count ?? null,
    childAge: event.child_age ?? null,
    isDryEvent: dietary.isDry,
    isVegOnly: dietary.isVegOnly,
    hasChildren: !!event.has_children,
    hasOutstationGuests,
    hasForeignGuests: !!event.has_foreign_guests,
    hasPets: !!event.has_pets,
    isHomeVenue,
    isOutdoor,
    season,
    timeOfDay,
  };
}
