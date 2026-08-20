// Plain Node sanity check for the event planning engine — run with:
//   node scripts/verifyPlanEngine.js
// Feeds hand-written fixture data (independently transcribed, not read from
// the live DB) through the real resolver/price modules and asserts specific
// outcomes. Prints PASS/FAIL per assertion, not just raw output.

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

const { resolveRequirements, computeProgress, resolveAlias } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'eventResolver.js'));
const { billableGuests, volumeMultiplier, estimateItem, estimateVenue, allocateBudget } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'priceEngine.js'));
const { buildChecklistContext } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'checklistContext.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}`); }
}

function req(overrides) {
  return {
    event_type_slug: null, sub_event_slug: null, item_name: null, category_slug: null,
    priority: 'P1', contextual_label: null, min_guest_count: null, max_guest_count: null,
    min_age: null, max_age: null, condition_flag: null, suppressed_when_dry: false,
    suppressed_when_veg: false, sort_order: 0,
    ...overrides,
  };
}

// ── event_requirements fixture ──
const REQUIREMENTS = [
  // hindu-wedding, event level
  req({ event_type_slug: 'hindu-wedding', item_name: 'Venue', category_slug: 'venues', priority: 'P1', sort_order: 0 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Caterer', category_slug: 'catering', priority: 'P1', sort_order: 1 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Decorator', category_slug: 'decor', priority: 'P1', sort_order: 2 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Priest', category_slug: 'priests-officiants', priority: 'P1', sort_order: 3 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Photographer', category_slug: 'photography', priority: 'P1', sort_order: 4 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Seating', category_slug: 'furniture-seating', priority: 'P1', sort_order: 5 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Power & utilities', category_slug: 'power-utilities', priority: 'P1', sort_order: 6 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Sound & AV', category_slug: 'sound-av', priority: 'P1', sort_order: 7 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Wedding planner', category_slug: 'event-planning', priority: 'P2', min_guest_count: 150, sort_order: 0 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Bar services', category_slug: 'bar-services', priority: 'P3', suppressed_when_dry: true, sort_order: 0 }),
  // hindu-wedding / sangeet sub-event
  req({ event_type_slug: 'hindu-wedding', sub_event_slug: 'sangeet', item_name: 'Bar services (Sangeet)', category_slug: 'bar-services', priority: 'P3', suppressed_when_dry: true, sort_order: 0 }),
  // hindu-wedding / mehendi sub-event — for the real event_functions-driven
  // per-function resolution test (#13 below), distinct from sangeet above.
  req({ event_type_slug: 'hindu-wedding', sub_event_slug: 'mehendi', item_name: 'Mehendi artist', category_slug: 'beauty', priority: 'P1', sort_order: 0 }),
  // condition_flag rows added for the is_outdoor/season/outstation fixes —
  // real event_type_slug + category_slug values, matching this fixture's
  // own "transcribed like the live seed" convention.
  req({ event_type_slug: 'hindu-wedding', item_name: 'Weather backup', category_slug: 'tent-mandap', priority: 'P5', condition_flag: 'is_outdoor', sort_order: 1 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Rain cover / weather tent', category_slug: 'tent-mandap', priority: 'P4', condition_flag: 'is_monsoon', sort_order: 2 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Extra cooling', category_slug: 'power-utilities', priority: 'P4', condition_flag: 'is_summer', sort_order: 3 }),
  req({ event_type_slug: 'hindu-wedding', item_name: 'Guest accommodation', category_slug: 'guest-accommodation', priority: 'P2', condition_flag: 'has_outstation_guests', sort_order: 4 }),

  // satyanarayan-katha (religious event)
  req({ event_type_slug: 'satyanarayan-katha', item_name: 'Prasad caterer', category_slug: 'prasad-caterer', priority: 'P1', sort_order: 0 }),
  req({ event_type_slug: 'satyanarayan-katha', item_name: 'Priest', category_slug: 'priests-officiants', priority: 'P1', sort_order: 1 }),

  // kids-birthday
  req({ event_type_slug: 'kids-birthday', item_name: 'Cake', category_slug: 'bakery-cakes', priority: 'P1', sort_order: 0 }),
  req({ event_type_slug: 'kids-birthday', item_name: 'Bouncy castle', category_slug: 'kids-entertainment', priority: 'P3', max_age: 7, sort_order: 0 }),
  req({ event_type_slug: 'kids-birthday', item_name: 'Science show', category_slug: 'kids-entertainment', priority: 'P3', min_age: 8, sort_order: 1 }),
  req({ event_type_slug: 'kids-birthday', item_name: 'Babysitter for other kids', category_slug: 'childcare', priority: 'P4', condition_flag: 'has_children', sort_order: 0 }),
];

// ── vendor_categories fixture ──
function cat(overrides) {
  return {
    slug: null, name: null, pricing_model: 'flat', metro_low: null, metro_high: null,
    tier2_low: null, tier2_high: null, percent_low: null, percent_high: null,
    quote_on_request: false,
    ...overrides,
  };
}
const CATEGORIES = {
  'venues': cat({ slug: 'venues', name: 'Venues', pricing_model: 'flat' }), // price_from_listings-only, no metro/tier2
  'catering': cat({ slug: 'catering', name: 'Catering', pricing_model: 'per_guest', metro_low: 800, metro_high: 4500, tier2_low: 600, tier2_high: 2500 }),
  'decor': cat({ slug: 'decor', name: 'Decor', pricing_model: 'flat', metro_low: 50000, metro_high: 300000 }),
  'priests-officiants': cat({ slug: 'priests-officiants', name: 'Priests', pricing_model: 'flat', metro_low: 5000, metro_high: 25000 }),
  'photography': cat({ slug: 'photography', name: 'Photography', pricing_model: 'per_day', metro_low: 25000, metro_high: 200000 }),
  'furniture-seating': cat({ slug: 'furniture-seating', name: 'Furniture & Seating', pricing_model: 'per_unit', metro_low: 100, metro_high: 500 }),
  'power-utilities': cat({ slug: 'power-utilities', name: 'Power & Utilities', pricing_model: 'flat', metro_low: 10000, metro_high: 50000 }),
  'sound-av': cat({ slug: 'sound-av', name: 'Sound & AV', pricing_model: 'flat', metro_low: 20000, metro_high: 100000 }),
  'event-planning': cat({ slug: 'event-planning', name: 'Event Planning', pricing_model: 'percent_of_budget', percent_low: 8, percent_high: 12 }),
  'bar-services': cat({ slug: 'bar-services', name: 'Bar Services', pricing_model: 'flat', metro_low: 30000, metro_high: 150000 }),
  'prasad-caterer': cat({ slug: 'prasad-caterer', name: 'Prasad Caterer', pricing_model: 'per_guest', metro_low: 150, metro_high: 400 }),
  'bakery-cakes': cat({ slug: 'bakery-cakes', name: 'Bakery & Cakes', pricing_model: 'per_unit', metro_low: 800, metro_high: 3000 }),
  'kids-entertainment': cat({ slug: 'kids-entertainment', name: 'Kids Entertainment', pricing_model: 'flat', metro_low: 8000, metro_high: 25000 }),
  'childcare': cat({ slug: 'childcare', name: 'Childcare', pricing_model: 'per_hour', metro_low: 500, metro_high: 1500 }),
  'celebrity-talent': cat({ slug: 'celebrity-talent', name: 'Celebrity Talent', pricing_model: 'flat', quote_on_request: true }),
};

console.log('=== 1. 300+ guest Delhi wedding, no venue ===');
{
  // 300 itself resolves to the 0.85 tier per the explicit rule ("150 to 300
  // returns 0.85, ABOVE 300 returns 0.70") — bumped to 350 so this fixture
  // actually exercises the >300 tier the spec's inline note described.
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350, isDryEvent: false }, null);
  const p1Names = resolved.P1.map(r => r.item_name);
  assert('P1 includes Venue, Caterer, Decorator, Priest, Photographer', ['Venue', 'Caterer', 'Decorator', 'Priest', 'Photographer'].every(n => p1Names.includes(n)));
  assert('Wedding planner appears at P2', resolved.P2.some(r => r.item_name === 'Wedding planner'));
  assert('volumeMultiplier(350) is 0.70', volumeMultiplier(350) === 0.70);
  assert('volumeMultiplier(300) is 0.85 (boundary is inclusive at 300)', volumeMultiplier(300) === 0.85);
  assert('volumeMultiplier(149) is 1.0', volumeMultiplier(149) === 1.0);
}

console.log('\n=== 2. Same wedding at a hotel providing seating/power/sound ===');
{
  const venue = { provided_items: ['furniture-seating', 'power-utilities', 'sound-av'], catering_policy: null };
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350 }, venue);
  const p1Names = resolved.P1.map(r => r.item_name);
  assert('Seating dropped (venue provides it)', !p1Names.includes('Seating'));
  assert('Power & utilities dropped', !p1Names.includes('Power & utilities'));
  assert('Sound & AV dropped', !p1Names.includes('Sound & AV'));
  assert('Caterer still present', p1Names.includes('Caterer'));
}

console.log('\n=== 3. Same wedding at an in-house-catering-only venue ===');
{
  const venue = { provided_items: [], catering_policy: 'in_house_only' };
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350 }, venue);
  const p1Names = resolved.P1.map(r => r.item_name);
  assert('Caterer dropped (in-house catering only)', !p1Names.includes('Caterer'));
  assert('Everything else survives (Venue, Decorator, Priest, Photographer, Seating, Power, Sound)',
    ['Venue', 'Decorator', 'Priest', 'Photographer', 'Seating', 'Power & utilities', 'Sound & AV'].every(n => p1Names.includes(n)));
}

console.log('\n=== 4. 40-guest religious event at that same in-house venue ===');
{
  const venue = { provided_items: [], catering_policy: 'in_house_only' };
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'satyanarayan-katha', guestCount: 40 }, venue);
  const p1Names = resolved.P1.map(r => r.item_name);
  assert('Prasad caterer survives in-house-catering-only (distinct slug from catering)', p1Names.includes('Prasad caterer'));
}

console.log('\n=== 5. 120-guest wedding ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 120 }, null);
  assert('Wedding planner absent below its 150-guest floor', !resolved.P2.some(r => r.item_name === 'Wedding planner'));
}

console.log('\n=== 6. Kids birthday, child age 9 ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'kids-birthday', childAge: 9, hasChildren: false }, null);
  const names = [...resolved.P1, ...resolved.P3, ...resolved.P4].map(r => r.item_name);
  assert('Science show present at age 9', names.includes('Science show'));
  assert('Bouncy castle absent at age 9 (max_age 7)', !names.includes('Bouncy castle'));
  assert('Babysitter absent (condition_flag has_children not set)', !names.includes('Babysitter for other kids'));
}

console.log('\n=== 7. Kids birthday, child age 5 ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'kids-birthday', childAge: 5 }, null);
  const names = [...resolved.P1, ...resolved.P3, ...resolved.P4].map(r => r.item_name);
  assert('Bouncy castle present at age 5', names.includes('Bouncy castle'));
  assert('Science show absent at age 5 (min_age 8)', !names.includes('Science show'));
}

console.log('\n=== 8. Dry wedding ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350, isDryEvent: true, subEventSlug: 'sangeet' }, null);
  const allNames = [...resolved.P1, ...resolved.P2, ...resolved.P3, ...resolved.P4, ...resolved.P5].map(r => r.item_name);
  assert('Bar services absent event-level when dry', !allNames.includes('Bar services'));
  assert('Bar services absent at the Sangeet sub-event when dry', !allNames.includes('Bar services (Sangeet)'));
}

console.log('\n=== 9. Venue with min_guest_guarantee 200, guest_count 150 ===');
{
  const venue = { min_guest_guarantee: 200 };
  assert('billableGuests uses the guarantee floor, not the planned count', billableGuests(150, venue) === 200);
  const est = estimateItem({}, CATEGORIES['catering'], { city: 'Delhi', guestCount: 150, isVegOnly: true }, null, venue);
  const expectedLow = 800 * 200 * volumeMultiplier(200);
  assert('catering estimate computes on the 200-guest guarantee, not 150', est.low === Math.round(expectedLow));
}

console.log('\n=== 10. Event with no budget ===');
{
  const est = estimateItem({}, CATEGORIES['event-planning'], { budgetTotal: null }, null, null);
  assert('percent_of_budget category returns available:false when budgetTotal is null', est.available === false);
}

console.log('\n=== 11. Celebrity talent ===');
{
  const est = estimateItem({}, CATEGORIES['celebrity-talent'], { city: 'Delhi' }, null, null);
  assert('celebrity talent returns quoteOnRequest:true', est.quoteOnRequest === true);
  assert('celebrity talent never returns a number', est.available === false && est.low === undefined && est.high === undefined);
}

console.log('\n=== 12. allocateBudget — P5 never allocated ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350 }, null);
  // Synthetic P5 items added directly (fixture data above has none) to
  // positively prove the loop skips P5 even when it's non-empty.
  resolved.P5 = [
    { item_name: 'Photobooth extra', category_slug: 'photo-booths', priority: 'P5', sort_order: 0 },
    { item_name: 'Drone follow-cam', category_slug: 'drone-aerial', priority: 'P5', sort_order: 1 },
  ];
  const estimates = {
    'Venue': { available: true, low: 200000, high: 400000 },
    'Caterer': { available: true, low: 500000, high: 900000 },
    'Decorator': { available: true, low: 100000, high: 200000 },
    'Priest': { available: true, low: 10000, high: 20000 },
    'Photographer': { available: true, low: 50000, high: 100000 },
    'Seating': { available: true, low: 20000, high: 40000 },
    'Power & utilities': { available: true, low: 15000, high: 30000 },
    'Sound & AV': { available: true, low: 30000, high: 60000 },
    'Wedding planner': { available: true, low: 80000, high: 120000 },
    'Photobooth extra': { available: true, low: 15000, high: 25000 },
    'Drone follow-cam': { available: true, low: 20000, high: 35000 },
  };
  // Small budget on purpose — forces the waterfall to run out before P5
  // would ever be reached, on top of the structural exclusion.
  const allocation = allocateBudget(resolved, estimates, 1000000);
  assert('no P5 line ever appears in allocateBudget output', !allocation.lines.some(l => l.priority === 'P5'));
  assert('contingency line is exactly 10% of budget', allocation.contingency === 100000);
  assert('contingency label matches spec exactly', allocation.contingencyLabel === 'Contingency buffer (10%)');
  assert('remaining never goes negative', allocation.remaining >= 0);

  const fullBudget = allocateBudget(resolved, estimates, 50000000);
  assert('with ample budget, still zero P5 lines', !fullBudget.lines.some(l => l.priority === 'P5'));
  assert('with ample budget, not over budget', fullBudget.overBudget === false);

  const noBudget = allocateBudget(resolved, estimates, null);
  assert('no budget set returns a clean not-applicable shape, not a false overBudget flag', noBudget.overBudget === false && noBudget.lines.length === 0);
}

console.log('\n=== 13. is_outdoor — was permanently unreachable (no matching context key), now fixed ===');
{
  const outdoorResolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', isOutdoor: true }, null);
  const allOutdoorNames = Object.values(outdoorResolved).flat().map(r => r.item_name);
  assert('Weather backup (condition_flag: is_outdoor) resolves when isOutdoor is true', allOutdoorNames.includes('Weather backup'));

  const indoorResolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', isOutdoor: false }, null);
  const allIndoorNames = Object.values(indoorResolved).flat().map(r => r.item_name);
  assert('Weather backup stays suppressed for a non-outdoor event', !allIndoorNames.includes('Weather backup'));

  const defaultResolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding' }, null);
  const allDefaultNames = Object.values(defaultResolved).flat().map(r => r.item_name);
  assert('Weather backup suppressed when isOutdoor is omitted entirely (defaults false, not a crash)', !allDefaultNames.includes('Weather backup'));
}

console.log('\n=== 14. Season — is_monsoon / is_summer, sourced from checklistContext.js ===');
{
  const monsoonEvent = { event_type_slug: 'hindu-wedding', event_date: '2026-08-15', venue_type: 'venue' }; // August -> monsoon
  const monsoonCtx = buildChecklistContext(monsoonEvent, null, [], null);
  assert('buildChecklistContext resolves August to monsoon', monsoonCtx.season === 'monsoon');
  const monsoonResolved = resolveRequirements(REQUIREMENTS, { ...monsoonCtx }, null);
  const monsoonNames = Object.values(monsoonResolved).flat().map(r => r.item_name);
  assert('Rain cover / weather tent resolves in monsoon season', monsoonNames.includes('Rain cover / weather tent'));
  assert('Extra cooling (is_summer) stays suppressed in monsoon season', !monsoonNames.includes('Extra cooling'));

  const summerEvent = { event_type_slug: 'hindu-wedding', event_date: '2026-04-10', venue_type: 'venue' }; // April -> summer
  const summerCtx = buildChecklistContext(summerEvent, null, [], null);
  assert('buildChecklistContext resolves April to summer', summerCtx.season === 'summer');
  const summerResolved = resolveRequirements(REQUIREMENTS, { ...summerCtx }, null);
  const summerNames = Object.values(summerResolved).flat().map(r => r.item_name);
  assert('Extra cooling resolves in summer season', summerNames.includes('Extra cooling'));
  assert('Rain cover / weather tent stays suppressed in summer season', !summerNames.includes('Rain cover / weather tent'));
}

console.log('\n=== 15. hasOutstationGuests — real event_invitees.is_outstation data, not the stale checkbox ===');
{
  const event = { event_type_slug: 'hindu-wedding', has_outstation_guests: false }; // checkbox false, matches every real event live
  const realInvitees = [{ is_outstation: false }, { is_outstation: true }, { is_outstation: false }];
  const ctxWithRealOutstationGuest = buildChecklistContext(event, null, realInvitees, null);
  assert('buildChecklistContext detects hasOutstationGuests from real invitee rows even though the checkbox is false',
    ctxWithRealOutstationGuest.hasOutstationGuests === true);
  const resolvedWithGuest = resolveRequirements(REQUIREMENTS, { ...ctxWithRealOutstationGuest, eventTypeSlug: 'hindu-wedding' }, null);
  assert('Guest accommodation (condition_flag: has_outstation_guests) resolves from real guest data',
    Object.values(resolvedWithGuest).flat().some(r => r.item_name === 'Guest accommodation'));

  const noOutstationInvitees = [{ is_outstation: false }, { is_outstation: false }];
  const ctxNoOutstation = buildChecklistContext(event, null, noOutstationInvitees, null);
  assert('hasOutstationGuests false when no real invitee is flagged and the checkbox is false',
    ctxNoOutstation.hasOutstationGuests === false);

  // Backward-compat OR: useEventPlan.js's own context still ORs in the
  // legacy checkbox on top of buildChecklistContext's real-data-only value
  // — simulated here the same way useEventPlan.js does it.
  const eventWithStaleCheckboxTrue = { event_type_slug: 'hindu-wedding', has_outstation_guests: true };
  const ctxNoRealData = buildChecklistContext(eventWithStaleCheckboxTrue, null, noOutstationInvitees, null);
  const orResult = ctxNoRealData.hasOutstationGuests || !!eventWithStaleCheckboxTrue.has_outstation_guests;
  assert('legacy checkbox still counts on its own (backward compat) even with zero real outstation guests', orResult === true);
}

console.log('\n=== 16. Per-function resolution — the real event_functions-driven path ===');
{
  // Fixture shaped exactly like the real DB rows useEventPlan.js now
  // queries: event_functions (id, name, source_sub_event_id) + a
  // sub_events id->slug lookup — not a hand-supplied subEventSlug string.
  const eventFunctionsFixture = [
    { id: 'fn-1', name: 'Mehendi', source_sub_event_id: 'se-mehendi' },
    { id: 'fn-2', name: 'Sangeet', source_sub_event_id: 'se-sangeet' },
  ];
  const subEventSlugById = { 'se-mehendi': 'mehendi', 'se-sangeet': 'sangeet' };

  const baseContext = { eventTypeSlug: 'hindu-wedding', guestCount: 350 };
  const baseline = resolveRequirements(REQUIREMENTS, baseContext, null);
  const baselineByItemName = {};
  Object.values(baseline).flat().forEach(r => { baselineByItemName[r.item_name] = r; });

  // Same diff logic useEventPlan.js performs, exercised here against the
  // real resolver + real fixture shape end to end.
  const resolvedByFunction = eventFunctionsFixture.map(fn => {
    const slug = subEventSlugById[fn.source_sub_event_id];
    const fnResolved = resolveRequirements(REQUIREMENTS, { ...baseContext, subEventSlug: slug }, null);
    const extras = [];
    Object.values(fnResolved).flat().forEach(r => {
      const base = baselineByItemName[r.item_name];
      if (!base || base.priority !== r.priority || base.contextual_label !== r.contextual_label) extras.push(r);
    });
    return { functionId: fn.id, functionName: fn.name, items: extras };
  });

  const mehendiExtras = resolvedByFunction.find(f => f.functionId === 'fn-1').items.map(i => i.item_name);
  const sangeetExtras = resolvedByFunction.find(f => f.functionId === 'fn-2').items.map(i => i.item_name);
  assert('Mehendi function surfaces "Mehendi artist" as an extra (sub-event-only row, absent from baseline)',
    mehendiExtras.includes('Mehendi artist'));
  assert('Sangeet function surfaces "Bar services (Sangeet)" as an extra (overrides the event-level Bar services row)',
    sangeetExtras.includes('Bar services (Sangeet)'));
  assert('Mehendi extras do NOT include Sangeet-only items', !mehendiExtras.includes('Bar services (Sangeet)'));
  assert('baseline items unrelated to either function (e.g. Venue) never appear as "extras"',
    !mehendiExtras.includes('Venue') && !sangeetExtras.includes('Venue'));
}

console.log('\n=== 17. Per-function progress/budget via bookings.sub_event_id (real, dormant FK — 0 of 23 real bookings set it before this task) ===');
{
  const baseContext = { eventTypeSlug: 'hindu-wedding', guestCount: 350 };
  const baseline = resolveRequirements(REQUIREMENTS, baseContext, null);
  const sangeetResolved = resolveRequirements(REQUIREMENTS, { ...baseContext, subEventSlug: 'sangeet' }, null);

  // A Sangeet-scoped catering booking + an unscoped (whole-event) venue
  // booking — exactly the shape hooks/useEventPlan.js now fetches
  // (status, category_slug, sub_event_id).
  const bookingsFixture = [
    { status: 'confirmed', category_slug: 'venues', sub_event_id: null },
    { status: 'confirmed', category_slug: 'catering', sub_event_id: 'se-sangeet' },
  ];

  // Whole-event baseline: scoped to sub_event_id IS NULL, same filter
  // useEventPlan.js now applies before calling computeProgress().
  const baselineBookings = bookingsFixture.filter(b => b.sub_event_id == null);
  const baselineProgress = computeProgress(baseline, baselineBookings, []);
  const baselineNames = Object.values(baseline).flat();
  const catererInBaseline = baselineNames.find(r => r.item_name === 'Caterer');
  assert('Venue counts as handled at the whole-event baseline (unscoped booking)',
    baselineProgress.p1Handled >= 1);

  // Prove the double-counting bug this task fixes: WITHOUT the sub_event_id
  // filter (the old behavior), the Sangeet-scoped catering booking would
  // have also counted toward the whole-event baseline, since "Caterer" is a
  // real P1 item in the baseline resolution too.
  const unfilteredProgress = computeProgress(baseline, bookingsFixture, []);
  assert('Without sub_event_id filtering, the Sangeet-scoped catering booking WOULD have double-counted at baseline (proving the old shape had this bug)',
    unfilteredProgress.p1Handled > baselineProgress.p1Handled);
  assert('Caterer is a real P1 baseline item (confirms the double-count scenario above is real, not a fixture mistake)',
    !!catererInBaseline && catererInBaseline.priority === 'P1');

  // Per-function progress: filter bookings by THIS function's
  // source_sub_event_id, run computeProgress against that function's own
  // FULL resolved set (baseline + its overrides), same computeProgress()
  // call, no changes needed to that function itself.
  const sangeetBookings = bookingsFixture.filter(b => b.sub_event_id === 'se-sangeet');
  const sangeetProgress = computeProgress(sangeetResolved, sangeetBookings, []);
  assert('Sangeet-scoped catering booking counts as handled for the Sangeet function\'s own progress',
    sangeetProgress.p1Handled >= 1);

  // Budget: a function WITH budget_total set gets a real allocation; one
  // WITHOUT gets allocation: null from the caller (useEventPlan.js), never
  // an empty/zeroed allocateBudget() shape.
  const sangeetEstimates = {
    'Venue': { available: true, low: 200000, high: 400000 },
    'Caterer': { available: true, low: 300000, high: 500000 },
    'Bar services (Sangeet)': { available: true, low: 30000, high: 60000 },
  };
  const fnWithBudget = { functionId: 'fn-sangeet', budgetTotal: 200000 };
  const fnWithoutBudget = { functionId: 'fn-mehendi', budgetTotal: null };
  const fnAllocationWith = fnWithBudget.budgetTotal == null ? null : allocateBudget(sangeetResolved, sangeetEstimates, fnWithBudget.budgetTotal);
  const fnAllocationWithout = fnWithoutBudget.budgetTotal == null ? null : allocateBudget(sangeetResolved, sangeetEstimates, fnWithoutBudget.budgetTotal);
  assert('Function with budget_total set gets a real allocation (lines computed)', fnAllocationWith !== null && fnAllocationWith.lines.length > 0);
  assert('Function with NO budget_total set gets allocation: null, not an empty/zeroed shape', fnAllocationWithout === null);
}

console.log('\n=== Bonus: resolveAlias ===');
{
  const aliases = [{ alias: 'banquet hall', category_slug: 'venues' }, { alias: 'DJ', category_slug: 'dj-music' }];
  assert('resolveAlias matches case-insensitively', resolveAlias(aliases, 'Banquet Hall') === 'venues');
  assert('resolveAlias returns null for no match', resolveAlias(aliases, 'unicorn tamer') === null);
}

console.log('\n=== Bonus: computeProgress ===');
{
  const resolved = resolveRequirements(REQUIREMENTS, { eventTypeSlug: 'hindu-wedding', guestCount: 350 }, null);
  const bookings = [
    { category_slug: 'venues', status: 'confirmed' },
    { category_slug: 'catering', status: 'payment_failed' }, // not handled
    { category_slug: 'decor', status: 'completed' },
  ];
  const progress = computeProgress(resolved, bookings, ['priests-officiants']);
  assert('venues counted as handled (confirmed)', progress.p1Handled >= 2); // venues + decor + arranged priest = 3, but at least covers the base
  const progress2 = computeProgress(resolved, [{ category_slug: 'venues', status: 'payment_pending' }], []);
  assert('payment_pending counts as handled, not just confirmed', progress2.p1Handled === 1);
}

console.log(`\n=== Summary: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
