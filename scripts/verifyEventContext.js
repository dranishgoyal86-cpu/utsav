// Plain Node sanity check for lib/eventContext.js — run with:
//   node scripts/verifyEventContext.js
// Feeds hand-written fixture data through the real pure resolvers and
// asserts specific outcomes. Prints PASS/FAIL per assertion, not just raw
// output.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { resolveVenue, resolveDietary, buildContext, dateChangeImpact, isHomeVenueType } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'eventContext.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}`); }
}

function baseEvent(overrides) {
  return {
    id: 'evt-1', working_title: 'Riya & Arjun', event_type_slug: 'hindu-wedding',
    sub_type_slug: null, event_date: '2026-12-20', city: 'Delhi',
    guest_count: 300, child_age: null, theme: null, budget_total: 1500000,
    has_children: false, has_outstation_guests: false, has_foreign_guests: false, has_pets: false,
    status: 'planning', arranged_categories: [],
    venue_id: null, venue_type: null, venue: null, venue_label: null, maps_link: null,
    society_name: null, flat_number: null, venue_lat: null, venue_lng: null,
    dietary_profile: [], dietary_notes: null, is_veg_only: false, is_dry_event: false,
    rsvp_deadline: null,
    ...overrides,
  };
}

console.log('\n=== resolveVenue ===');
{
  const venue = { name: 'Grand Palace', address: '12 MG Road', maps_link: 'https://maps.example/x',
    venue_type: 'banquet_hall', provided_items: ['tables', 'chairs', 'stage'],
    catering_policy: 'in_house_only', min_guest_guarantee: 200, capacity_min: 100, capacity_max: 500,
    latitude: 28.6139, longitude: 77.2090 };
  const ctx = resolveVenue(baseEvent({ venue_id: 'v1' }), venue);
  assert('venue-booked: isSet true', ctx.isSet === true);
  assert('venue-booked: source is venue', ctx.source === 'venue');
  assert('venue-booked: label from venue.name', ctx.label === 'Grand Palace');
  assert('venue-booked: providedItems passed through', ctx.providedItems.includes('stage'));
  assert('venue-booked: cateringPolicy passed through', ctx.cateringPolicy === 'in_house_only');
  assert('venue-booked: lat from venue.latitude', ctx.lat === 28.6139);
  assert('venue-booked: lng from venue.longitude', ctx.lng === 77.2090);
}
{
  // Booked venue with no coordinates saved yet (predates this feature, or
  // the marketplace listing never had lat/lng entered) — must resolve to
  // null, not throw or silently coerce to 0.
  const venueNoCoords = { name: 'Old Listing', address: '1 Ring Road', venue_type: 'banquet_hall',
    provided_items: [], catering_policy: null, min_guest_guarantee: null, capacity_min: null, capacity_max: null };
  const ctx = resolveVenue(baseEvent({ venue_id: 'v2' }), venueNoCoords);
  assert('venue-booked, no coords: lat null', ctx.lat === null);
  assert('venue-booked, no coords: lng null', ctx.lng === null);
}
{
  const ctx = resolveVenue(baseEvent({ venue_type: 'society_flat', venue: 'Tower B, Sector 21', society_name: 'Green Meadows', flat_number: 'B-402', venue_lat: 19.0760, venue_lng: 72.8777 }), null);
  assert('home path: isSet true when address present', ctx.isSet === true);
  assert('home path: source is home', ctx.source === 'home');
  assert('home path: address reuses events.venue', ctx.address === 'Tower B, Sector 21');
  assert('home path: societyName populated', ctx.societyName === 'Green Meadows');
  assert('home path: flatNumber populated', ctx.flatNumber === 'B-402');
  assert('home path: providedItems empty (nothing suppressed for home)', ctx.providedItems.length === 0);
  assert('home path: lat from events.venue_lat', ctx.lat === 19.0760);
  assert('home path: lng from events.venue_lng', ctx.lng === 72.8777);
}
{
  // Home address typed without picking a suggestion — no coordinates
  // captured, expected (not an error state).
  const ctx = resolveVenue(baseEvent({ venue_type: 'home', venue: '9 Ring Road' }), null);
  assert('home path, no coords: lat null', ctx.lat === null);
  assert('home path, no coords: lng null', ctx.lng === null);
}
{
  const ctx = resolveVenue(baseEvent({ venue_type: 'independent_house', venue: '44 Palm Street' }), null);
  assert('independent house: recognized as home path', ctx.source === 'home' && ctx.isSet === true);
}
{
  const ctx = resolveVenue(baseEvent(), null);
  assert('no venue set: isSet false', ctx.isSet === false);
  assert('no venue set: providedItems empty', ctx.providedItems.length === 0);
  assert('no venue set: lat null', ctx.lat === null);
  assert('no venue set: lng null', ctx.lng === null);
}
{
  // Generic 'home' before the society/independent-house sub-question is
  // answered still resolves as home — the sub-question refines venue_type,
  // it isn't a prerequisite for the address itself to work.
  const ctx = resolveVenue(baseEvent({ venue_type: 'home', venue: '9 Ring Road' }), null);
  assert('generic home (pre-sub-question): recognized as home path', ctx.source === 'home' && ctx.isSet === true);
  assert('isHomeVenueType: true for generic home', isHomeVenueType('home') === true);
  assert('isHomeVenueType: true for society_flat', isHomeVenueType('society_flat') === true);
  assert('isHomeVenueType: false for venue', isHomeVenueType('venue') === false);
}

console.log('\n=== resolveDietary ===');
{
  const d = resolveDietary(baseEvent({ dietary_profile: ['veg_only', 'jain'] }));
  assert('veg_only+jain: plateRateKey is veg', d.plateRateKey === 'veg');
  assert('veg_only+jain: label reads "Pure veg · Jain"', d.label === 'Pure veg · Jain');
  assert('veg_only+jain: isVegOnly true', d.isVegOnly === true);
  assert('veg_only+jain: isJain true', d.isJain === true);
}
{
  const d = resolveDietary(baseEvent({ is_veg_only: true, dietary_profile: [] }));
  assert('legacy is_veg_only boolean alone still resolves plateRateKey veg', d.plateRateKey === 'veg');
}
{
  const d = resolveDietary(baseEvent());
  assert('no dietary info: plateRateKey nonveg', d.plateRateKey === 'nonveg');
  assert('no dietary info: label is the no-restrictions default', d.label === 'No dietary restrictions set');
}

console.log('\n=== buildContext ===');
{
  const ctx = buildContext(baseEvent(), null, []);
  assert('rsvpDeadline defaults to 7 days before event_date when unset', ctx.rsvpDeadline === '2026-12-13');
  assert('eventId passed through', ctx.eventId === 'evt-1');
  assert('bookingCount is 0 with no bookings', ctx.bookingCount === 0);
}
{
  const ctx = buildContext(baseEvent({ rsvp_deadline: '2026-12-01' }), null, []);
  assert('rsvpDeadline respects an explicit value over the 7-day default', ctx.rsvpDeadline === '2026-12-01');
}
{
  const bookings = [{ status: 'confirmed' }, { status: 'confirmed' }, { status: 'payment_pending' }];
  const ctx = buildContext(baseEvent(), null, bookings);
  assert('confirmedBookingCount counts only confirmed', ctx.confirmedBookingCount === 2);
  assert('bookingCount counts all bookings', ctx.bookingCount === 3);
}
{
  const ctx = buildContext(null, null, []);
  assert('null event returns null context', ctx === null);
}

console.log('\n=== dateChangeImpact ===');
{
  const bookings = [{ id: 'b1', status: 'confirmed' }, { id: 'b2', status: 'confirmed' }, { id: 'b3', status: 'payment_pending' }, { id: 'b4', status: 'declined' }];
  const impact = dateChangeImpact(bookings, '2027-01-15');
  assert('two confirmed + one pending: 2 blocking', impact.blocking.length === 2);
  assert('two confirmed + one pending: 3 affected', impact.affected.length === 3);
  assert('declined booking excluded from affected', !impact.affected.some(b => b.id === 'b4'));
}
{
  const impact = dateChangeImpact([], '2027-01-15');
  assert('no bookings: zero blocking, zero affected', impact.blocking.length === 0 && impact.affected.length === 0);
}

console.log(`\n${passCount} passed, ${failCount} failed\n`);
if (failCount > 0) process.exit(1);
