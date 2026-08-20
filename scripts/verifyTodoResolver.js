// Plain Node sanity check for the new context-aware event_todos system —
// run with: node scripts/verifyTodoResolver.js
// Same hand-fixture + PASS/FAIL pattern as scripts/verifyPlanEngine.js.
// Feeds hand-written fixture data through the real lib/todoResolver.js and
// lib/checklistContext.js, not the live DB.

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

const { resolveTodoTemplates, evaluateAutoCheckCondition } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'todoResolver.js'));
const { buildChecklistContext, monthToSeason } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'checklistContext.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}`); }
}

function tmpl(overrides) {
  return {
    id: null, event_type_slug: null, sub_event_slug: null, section: 'vendors', category: null,
    title: null, item_type: 'auto', kind: 'confirmation', condition_field: null, condition_value: null,
    auto_check_condition: null, sort_order: 0,
    ...overrides,
  };
}

// ── event_todo_templates fixture — the real seed shape, condensed to the
// items these tests actually exercise ──
const TEMPLATES = [
  tmpl({ id: 't-guest-list', category: 'guest_list', title: 'Make guest list', sort_order: 0 }),
  tmpl({ id: 't-venue', category: 'venue', title: 'Confirm venue', condition_field: 'location', condition_value: 'venue', auto_check_condition: 'is_home_venue', sort_order: 1 }),
  tmpl({ id: 't-venue-visit', category: 'venue_visit', title: 'Venue site visit', item_type: 'manual', condition_field: 'location', condition_value: 'venue', auto_check_condition: 'is_home_venue', sort_order: 2 }),
  tmpl({ id: 't-photography', category: 'photography', title: 'Finalize photographer & videographer', condition_field: 'needsPhotography', sort_order: 3 }),
  tmpl({ id: 't-beauty-mehendi', event_type_slug: 'hindu-wedding', sub_event_slug: 'mehendi', category: 'beauty_mehendi', title: 'Book mehendi artist', condition_field: 'needsMehendi', sort_order: 4 }),
  tmpl({ id: 't-beauty-makeup', category: 'beauty_makeup', title: 'Book makeup artist', condition_field: 'needsMakeup', sort_order: 5 }),
  tmpl({ id: 't-budget', category: 'budget', title: 'Budget check', sort_order: 6 }),
];

console.log('=== 1. Event-level template (null event_type_slug) resolves for any event type ===');
{
  const resolved = resolveTodoTemplates(TEMPLATES, { eventTypeSlug: 'kids-birthday' }, [], null);
  const ids = resolved.map(t => t.id);
  assert('guest_list (universal) present for kids-birthday', ids.includes('t-guest-list'));
  assert('budget (universal) present for kids-birthday', ids.includes('t-budget'));
}

console.log('\n=== 2. beauty_mehendi split: event-type + sub-event scoped ===');
{
  // Hindu wedding, Mehendi function exists, needsMehendi true -> resolves.
  const resolvedWithMehendi = resolveTodoTemplates(
    TEMPLATES, { eventTypeSlug: 'hindu-wedding' }, ['mehendi'], { needsMehendi: true, needsMakeup: true }
  );
  assert('beauty_mehendi resolves when hindu-wedding + Mehendi function + needsMehendi',
    resolvedWithMehendi.some(t => t.id === 't-beauty-mehendi'));
  assert('beauty_makeup resolves independently of any function (needsMakeup true)',
    resolvedWithMehendi.some(t => t.id === 't-beauty-makeup'));

  // Same wedding, no Mehendi function on this event -> beauty_mehendi absent,
  // beauty_makeup still present (event-level, function-independent).
  const resolvedNoMehendiFunction = resolveTodoTemplates(
    TEMPLATES, { eventTypeSlug: 'hindu-wedding' }, [], { needsMehendi: true, needsMakeup: true }
  );
  assert('beauty_mehendi ABSENT with no Mehendi function even though needsMehendi is true',
    !resolvedNoMehendiFunction.some(t => t.id === 't-beauty-mehendi'));
  assert('beauty_makeup still present with no Mehendi function',
    resolvedNoMehendiFunction.some(t => t.id === 't-beauty-makeup'));

  // Different event type entirely -> beauty_mehendi never applies, even
  // with a (nonsensical) 'mehendi' function slug present.
  const resolvedWrongEventType = resolveTodoTemplates(
    TEMPLATES, { eventTypeSlug: 'kids-birthday' }, ['mehendi'], { needsMehendi: true }
  );
  assert('beauty_mehendi ABSENT for kids-birthday regardless of function match (event_type_slug gate)',
    !resolvedWrongEventType.some(t => t.id === 't-beauty-mehendi'));

  // needsMehendi false -> excluded even with the right event type + function.
  const resolvedNotNeeded = resolveTodoTemplates(
    TEMPLATES, { eventTypeSlug: 'hindu-wedding' }, ['mehendi'], { needsMehendi: false }
  );
  assert('beauty_mehendi ABSENT when needsMehendi is false',
    !resolvedNotNeeded.some(t => t.id === 't-beauty-mehendi'));
}

console.log('\n=== 3. condition_value equality (venue/venue_visit) vs plain truthy checks ===');
{
  const atVenue = resolveTodoTemplates(TEMPLATES, {}, [], { location: 'venue' });
  assert('venue template resolves when location === "venue"', atVenue.some(t => t.id === 't-venue'));

  const atHome = resolveTodoTemplates(TEMPLATES, {}, [], { location: 'home' });
  assert('venue template ABSENT when location === "home" (equality, not truthiness — "home" is equally truthy)',
    !atHome.some(t => t.id === 't-venue'));
  assert('venue_visit template ABSENT when location === "home"', !atHome.some(t => t.id === 't-venue-visit'));
}

console.log('\n=== 4. No linked plan (formData null) -> over-show, same as old relevantIf precedent ===');
{
  const resolved = resolveTodoTemplates(TEMPLATES, { eventTypeSlug: 'hindu-wedding' }, ['mehendi'], null);
  assert('venue template included with no formData at all', resolved.some(t => t.id === 't-venue'));
  assert('beauty_mehendi included with no formData (event type + function still match)',
    resolved.some(t => t.id === 't-beauty-mehendi'));
}

console.log('\n=== 5. evaluateAutoCheckCondition — is_home_venue ===');
{
  assert('is_home_venue true when context.isHomeVenue is true', evaluateAutoCheckCondition('is_home_venue', { isHomeVenue: true }) === true);
  assert('is_home_venue false when context.isHomeVenue is false', evaluateAutoCheckCondition('is_home_venue', { isHomeVenue: false }) === false);
  assert('unknown condition name returns false, not a throw', evaluateAutoCheckCondition('not_a_real_condition', { isHomeVenue: true }) === false);
}

console.log('\n=== 6. "possibly_outdated" scenario: venue booked -> switched to home ===');
{
  // Simulates loadTodos' diff: resolve once with a booked-venue context,
  // again after the host switches to home — the venue/venue_visit
  // templates should drop out of the resolved set (this is exactly what
  // flips possibly_outdated: true for the existing rows in the real sync).
  const bookedVenueContext = { eventTypeSlug: 'hindu-wedding' };
  const beforeIds = new Set(resolveTodoTemplates(TEMPLATES, bookedVenueContext, [], { location: 'venue' }).map(t => t.id));

  const homeVenueContext = { eventTypeSlug: 'hindu-wedding' };
  const afterIds = new Set(resolveTodoTemplates(TEMPLATES, homeVenueContext, [], { location: 'home' }).map(t => t.id));

  assert('venue template resolved BEFORE the switch', beforeIds.has('t-venue'));
  assert('venue template no longer resolves AFTER switching to home (would trigger possibly_outdated:true)',
    !afterIds.has('t-venue'));
  assert('venue_visit no longer resolves AFTER the switch', !afterIds.has('t-venue-visit'));
  assert('guest_list (unrelated template) still resolves after the switch — unaffected rows stay unaffected',
    afterIds.has('t-guest-list'));

  // And the reverse: switching back should make it resolve again (this is
  // exactly what clears possibly_outdated back to false on a later sync).
  const backToVenueIds = new Set(resolveTodoTemplates(TEMPLATES, bookedVenueContext, [], { location: 'venue' }).map(t => t.id));
  assert('venue template resolves again after switching back to a booked venue (possibly_outdated would clear)',
    backToVenueIds.has('t-venue'));
}

console.log('\n=== 7. buildChecklistContext — season mapping ===');
{
  assert('January is winter', monthToSeason(0) === 'winter');
  assert('April is summer', monthToSeason(3) === 'summer');
  assert('August is monsoon', monthToSeason(7) === 'monsoon');
  assert('October is autumn', monthToSeason(9) === 'autumn');
  assert('December is winter', monthToSeason(11) === 'winter');
}

console.log('\n=== 8. buildChecklistContext — timeOfDay precedence and real outstation-guest signal ===');
{
  const event = { event_type_slug: 'hindu-wedding', event_date: '2026-12-20', venue_type: 'venue', has_children: false };
  const ctxWithEventTime = buildChecklistContext(event, null, [], { timeOfDay: 'day' });
  assert('events.event_time (unset here) falls back to formData.timeOfDay when event_time is null',
    ctxWithEventTime.timeOfDay === 'day');

  const eventWithTime = { ...event, event_time: '10:00' };
  const ctxEventTimeWins = buildChecklistContext(eventWithTime, null, [], { timeOfDay: 'night' });
  assert('events.event_time (10:00 -> day) wins over conflicting formData.timeOfDay',
    ctxEventTimeWins.timeOfDay === 'day');

  const ctxNoSignal = buildChecklistContext(event, null, [], null);
  assert('timeOfDay is null when neither event_time nor formData has it (never guessed)',
    ctxNoSignal.timeOfDay === null);

  const ctxNoOutstation = buildChecklistContext(event, null, [{ is_outstation: false }, { is_outstation: false }], null);
  assert('hasOutstationGuests false when no real invitee row has is_outstation true',
    ctxNoOutstation.hasOutstationGuests === false);

  const ctxWithOutstation = buildChecklistContext(event, null, [{ is_outstation: false }, { is_outstation: true }], null);
  assert('hasOutstationGuests true when at least one real invitee row has is_outstation true',
    ctxWithOutstation.hasOutstationGuests === true);

  const homeEvent = { ...event, venue_type: 'home' };
  const ctxHome = buildChecklistContext(homeEvent, null, [], null);
  assert('isHomeVenue true for venue_type "home"', ctxHome.isHomeVenue === true);
  const ctxVenue = buildChecklistContext(event, null, [], null);
  assert('isHomeVenue false for venue_type "venue"', ctxVenue.isHomeVenue === false);
}

console.log(`\n=== Summary: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
