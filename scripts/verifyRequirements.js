// Plain Node sanity check for the event_requirements seed data — run with:
//   node scripts/verifyRequirements.js
// Feeds hand-written fixture data (independently transcribed from
// supabase/migrations/event_requirements.sql, as a double-entry check on
// that file, not read from it) through the real resolver in
// lib/eventRequirements.js and prints the resolved checklist for all 10
// event types, plus the specific age/guest-count filtering cases.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

// lib/eventRequirements.js uses ESM `export function` (required so the
// app's own Metro/Babel bundler can import it) — this project's
// package.json has no "type":"module", so plain `node` can't `require()`
// ESM directly. Transform-then-eval into a throwaway CJS module instead,
// so this script runs with zero extra flags/setup.
function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { resolveRequirements, computeChecklistProgress, suggestBudgetSplit, findUnsuppliedCategories } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'eventRequirements.js'));

// ── Fixture data — one flat array per event type, [eventTypeSlug, subEventSlug|null, category, priority, contextualLabel, minGuest, maxGuest, minAge, maxAge, sortOrder] ──
const ROWS = [
  // hindu-wedding, event level
  ['hindu-wedding', null, 'Pandit', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', null, 'Decorators', 'essential', 'Mandap decoration', null, null, null, null, 1],
  ['hindu-wedding', null, 'Caterers', 'essential', null, null, null, null, null, 2],
  ['hindu-wedding', null, 'Photographers', 'essential', null, null, null, null, null, 3],
  ['hindu-wedding', null, 'Tent House', 'essential', null, null, null, null, null, 4],
  ['hindu-wedding', null, 'Videography', 'recommended', null, null, null, null, null, 0],
  ['hindu-wedding', null, 'Makeup', 'recommended', null, null, null, null, null, 1],
  ['hindu-wedding', null, 'Mehendi', 'recommended', null, null, null, null, null, 2],
  ['hindu-wedding', null, 'DJ & Music', 'recommended', null, null, null, null, null, 3],
  ['hindu-wedding', null, 'Lighting', 'recommended', null, null, null, null, null, 4],
  ['hindu-wedding', null, 'Florist', 'recommended', null, null, null, null, null, 5],
  ['hindu-wedding', null, 'Invitation Cards', 'recommended', null, null, null, null, null, 6],
  ['hindu-wedding', null, 'Dhol', 'optional', null, null, null, null, null, 0],
  ['hindu-wedding', null, 'Baraat Transport', 'optional', null, null, null, null, null, 1],
  ['hindu-wedding', null, 'Choreographer', 'optional', null, null, null, null, null, 2],
  ['hindu-wedding', null, 'Generator', 'optional', null, 200, null, null, null, 3],
  ['hindu-wedding', null, 'Valet', 'optional', null, 200, null, null, null, 4],
  ['hindu-wedding', null, 'Bartender', 'optional', null, null, null, null, null, 5],
  // hindu-wedding / mehendi
  ['hindu-wedding', 'mehendi', 'Mehendi', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', 'mehendi', 'Decorators', 'recommended', 'Mehendi setup', null, null, null, null, 0],
  ['hindu-wedding', 'mehendi', 'Caterers', 'recommended', 'Snacks and chaat', null, null, null, null, 1],
  ['hindu-wedding', 'mehendi', 'DJ & Music', 'optional', null, null, null, null, null, 0],
  ['hindu-wedding', 'mehendi', 'Photographers', 'optional', null, null, null, null, null, 1],
  // hindu-wedding / haldi
  ['hindu-wedding', 'haldi', 'Decorators', 'essential', 'Marigold and haldi setup', null, null, null, null, 0],
  ['hindu-wedding', 'haldi', 'Photographers', 'recommended', null, null, null, null, null, 0],
  ['hindu-wedding', 'haldi', 'Caterers', 'recommended', null, null, null, null, null, 1],
  // hindu-wedding / sangeet
  ['hindu-wedding', 'sangeet', 'DJ & Music', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', 'sangeet', 'Sound System', 'essential', null, null, null, null, null, 1],
  ['hindu-wedding', 'sangeet', 'Choreographer', 'recommended', null, null, null, null, null, 0],
  ['hindu-wedding', 'sangeet', 'Lighting', 'recommended', null, null, null, null, null, 1],
  ['hindu-wedding', 'sangeet', 'Decorators', 'recommended', 'Stage setup', null, null, null, null, 2],
  ['hindu-wedding', 'sangeet', 'Caterers', 'recommended', null, null, null, null, null, 3],
  ['hindu-wedding', 'sangeet', 'Photographers', 'optional', null, null, null, null, null, 0],
  ['hindu-wedding', 'sangeet', 'Bartender', 'optional', null, null, null, null, null, 1],
  // hindu-wedding / baraat
  ['hindu-wedding', 'baraat', 'Dhol', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', 'baraat', 'Baraat Transport', 'recommended', 'Ghodi or vintage car', null, null, null, null, 0],
  ['hindu-wedding', 'baraat', 'Lighting', 'recommended', null, null, null, null, null, 1],
  ['hindu-wedding', 'baraat', 'Photographers', 'optional', null, null, null, null, null, 0],
  // hindu-wedding / pheras
  ['hindu-wedding', 'pheras', 'Pandit', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', 'pheras', 'Decorators', 'essential', 'Mandap', null, null, null, null, 1],
  ['hindu-wedding', 'pheras', 'Photographers', 'recommended', null, null, null, null, null, 0],
  ['hindu-wedding', 'pheras', 'Videography', 'recommended', null, null, null, null, null, 1],
  ['hindu-wedding', 'pheras', 'Florist', 'recommended', null, null, null, null, null, 2],
  // hindu-wedding / reception
  ['hindu-wedding', 'reception', 'Caterers', 'essential', null, null, null, null, null, 0],
  ['hindu-wedding', 'reception', 'Decorators', 'essential', 'Reception stage', null, null, null, null, 1],
  ['hindu-wedding', 'reception', 'Photographers', 'essential', null, null, null, null, null, 2],
  ['hindu-wedding', 'reception', 'DJ & Music', 'recommended', null, null, null, null, null, 0],
  ['hindu-wedding', 'reception', 'Lighting', 'recommended', null, null, null, null, null, 1],
  ['hindu-wedding', 'reception', 'Makeup', 'recommended', null, null, null, null, null, 2],
  ['hindu-wedding', 'reception', 'Bartender', 'optional', null, null, null, null, null, 0],
  ['hindu-wedding', 'reception', 'Live Band', 'optional', null, null, null, null, null, 1],
  // kids-birthday
  ['kids-birthday', null, 'Cake', 'essential', null, null, null, null, null, 0],
  ['kids-birthday', null, 'Decorators', 'essential', 'Theme decoration and balloons', null, null, null, null, 1],
  ['kids-birthday', null, 'Caterers', 'essential', 'Kids snacks', null, null, null, null, 2],
  ['kids-birthday', null, 'Mascot', 'recommended', 'Cartoon character', null, null, null, null, 0],
  ['kids-birthday', null, 'Game Host', 'recommended', null, null, null, null, null, 1],
  ['kids-birthday', null, 'Return Gifts', 'recommended', null, null, null, null, null, 2],
  ['kids-birthday', null, 'Photographers', 'recommended', null, null, null, null, null, 3],
  ['kids-birthday', null, 'Magician', 'optional', null, null, null, null, 12, 0],
  ['kids-birthday', null, 'Bouncy Castle', 'optional', null, null, null, null, 10, 1],
  ['kids-birthday', null, 'Face Painter', 'optional', null, null, null, null, 12, 2],
  ['kids-birthday', null, 'Puppet Show', 'optional', null, null, null, null, 8, 3],
  ['kids-birthday', null, 'Science Show', 'optional', null, null, null, 7, null, 4],
  ['kids-birthday', null, 'Tattoo Artist', 'optional', null, null, null, 6, null, 5],
  // adult-birthday
  ['adult-birthday', null, 'Cake', 'essential', null, null, null, null, null, 0],
  ['adult-birthday', null, 'Decorators', 'essential', null, null, null, null, null, 1],
  ['adult-birthday', null, 'Caterers', 'essential', null, null, null, null, null, 2],
  ['adult-birthday', null, 'DJ & Music', 'recommended', null, null, null, null, null, 0],
  ['adult-birthday', null, 'Photographers', 'recommended', null, null, null, null, null, 1],
  ['adult-birthday', null, 'Bartender', 'optional', null, null, null, null, null, 0],
  ['adult-birthday', null, 'Lighting', 'optional', null, null, null, null, null, 1],
  // engagement
  ['engagement', null, 'Decorators', 'essential', 'Ring ceremony stage', null, null, null, null, 0],
  ['engagement', null, 'Caterers', 'essential', null, null, null, null, null, 1],
  ['engagement', null, 'Photographers', 'essential', null, null, null, null, null, 2],
  ['engagement', null, 'Makeup', 'recommended', null, null, null, null, null, 0],
  ['engagement', null, 'DJ & Music', 'recommended', null, null, null, null, null, 1],
  ['engagement', null, 'Lighting', 'recommended', null, null, null, null, null, 2],
  ['engagement', null, 'Florist', 'recommended', null, null, null, null, null, 3],
  ['engagement', null, 'Videography', 'optional', null, null, null, null, null, 0],
  ['engagement', null, 'Choreographer', 'optional', null, null, null, null, null, 1],
  // satyanarayan-katha
  ['satyanarayan-katha', null, 'Pandit', 'essential', null, null, null, null, null, 0],
  ['satyanarayan-katha', null, 'Havan Samagri', 'essential', null, null, null, null, null, 1],
  ['satyanarayan-katha', null, 'Prasad Caterer', 'essential', null, null, null, null, null, 2],
  ['satyanarayan-katha', null, 'Florist', 'recommended', 'Flowers and mala', null, null, null, null, 0],
  ['satyanarayan-katha', null, 'Chowki and Asan', 'recommended', null, null, null, null, null, 1],
  ['satyanarayan-katha', null, 'Sound System', 'recommended', null, null, null, null, null, 2],
  ['satyanarayan-katha', null, 'Tent House', 'optional', null, null, null, null, null, 0],
  ['satyanarayan-katha', null, 'Bhajan Mandali', 'optional', null, null, null, null, null, 1],
  // griha-pravesh
  ['griha-pravesh', null, 'Pandit', 'essential', null, null, null, null, null, 0],
  ['griha-pravesh', null, 'Havan Samagri', 'essential', null, null, null, null, null, 1],
  ['griha-pravesh', null, 'Prasad Caterer', 'essential', null, null, null, null, null, 2],
  ['griha-pravesh', null, 'Decorators', 'recommended', 'Entrance toran and rangoli', null, null, null, null, 0],
  ['griha-pravesh', null, 'Florist', 'recommended', null, null, null, null, null, 1],
  ['griha-pravesh', null, 'Caterers', 'recommended', null, null, null, null, null, 2],
  ['griha-pravesh', null, 'Photographers', 'optional', null, null, null, null, null, 0],
  ['griha-pravesh', null, 'Sound System', 'optional', null, null, null, null, null, 1],
  // mundan
  ['mundan', null, 'Pandit', 'essential', null, null, null, null, null, 0],
  ['mundan', null, 'Nai', 'essential', 'Barber for mundan', null, null, null, null, 1],
  ['mundan', null, 'Prasad Caterer', 'essential', null, null, null, null, null, 2],
  ['mundan', null, 'Photographers', 'recommended', null, null, null, null, null, 0],
  ['mundan', null, 'Decorators', 'recommended', null, null, null, null, null, 1],
  // godh-bharai
  ['godh-bharai', null, 'Decorators', 'essential', null, null, null, null, null, 0],
  ['godh-bharai', null, 'Caterers', 'essential', null, null, null, null, null, 1],
  ['godh-bharai', null, 'Cake', 'essential', null, null, null, null, null, 2],
  ['godh-bharai', null, 'Photographers', 'recommended', null, null, null, null, null, 0],
  ['godh-bharai', null, 'Game Host', 'recommended', null, null, null, null, null, 1],
  ['godh-bharai', null, 'Return Gifts', 'recommended', null, null, null, null, null, 2],
  // anniversary
  ['anniversary', null, 'Cake', 'essential', null, null, null, null, null, 0],
  ['anniversary', null, 'Decorators', 'essential', null, null, null, null, null, 1],
  ['anniversary', null, 'Caterers', 'essential', null, null, null, null, null, 2],
  ['anniversary', null, 'Photographers', 'recommended', null, null, null, null, null, 0],
  ['anniversary', null, 'DJ & Music', 'recommended', null, null, null, null, null, 1],
  ['anniversary', null, 'Florist', 'optional', null, null, null, null, null, 0],
  ['anniversary', null, 'Bartender', 'optional', null, null, null, null, null, 1],
  // corporate-event
  ['corporate-event', null, 'Sound System', 'essential', null, null, null, null, null, 0],
  ['corporate-event', null, 'Caterers', 'essential', null, null, null, null, null, 1],
  ['corporate-event', null, 'Seating', 'essential', 'Chairs and tables', null, null, null, null, 2],
  ['corporate-event', null, 'Stage Setup', 'recommended', null, null, null, null, null, 0],
  ['corporate-event', null, 'Emcee', 'recommended', null, null, null, null, null, 1],
  ['corporate-event', null, 'Photographers', 'recommended', null, null, null, null, null, 2],
  ['corporate-event', null, 'Branding', 'recommended', 'Standees and backdrop', null, null, null, null, 3],
  ['corporate-event', null, 'Entertainment', 'optional', null, null, null, null, null, 0],
  ['corporate-event', null, 'Gifting', 'optional', null, null, null, null, null, 1],
  ['corporate-event', null, 'Valet', 'optional', null, 150, null, null, null, 2],
];

// Fixture "IDs" are just slugs — resolveRequirements only ever compares
// them for equality, it doesn't care whether they're real UUIDs.
const requirementsByEventType = {};
for (const [eventTypeSlug, subEventSlug, category, priority, contextual_label, min_guest_count, max_guest_count, min_age, max_age, sort_order] of ROWS) {
  (requirementsByEventType[eventTypeSlug] ??= []).push({
    sub_event_id: subEventSlug,
    category, priority, contextual_label,
    min_guest_count, max_guest_count, min_age, max_age, sort_order,
  });
}

const EVENT_TYPES = [
  'hindu-wedding', 'engagement', 'kids-birthday', 'adult-birthday', 'griha-pravesh',
  'satyanarayan-katha', 'mundan', 'godh-bharai', 'anniversary', 'corporate-event',
];

function printChecklist(label, resolved) {
  console.log(`\n=== ${label} ===`);
  for (const priority of ['essential', 'recommended', 'optional']) {
    const items = resolved[priority];
    console.log(`  ${priority} (${items.length}):`);
    if (items.length === 0) console.log('    (none)');
    for (const r of items) {
      const label2 = r.contextual_label ? ` — "${r.contextual_label}"` : '';
      console.log(`    - ${r.category}${label2}`);
    }
  }
}

console.log('EVENT-DRIVEN VENDOR REQUIREMENTS — VERIFICATION\n' + '='.repeat(60));

// ── All 10 event types, event-level view (no sub-event, no filters) ──
for (const slug of EVENT_TYPES) {
  const resolved = resolveRequirements(requirementsByEventType[slug], {});
  printChecklist(slug, resolved);
}

console.log('\n' + '='.repeat(60));
console.log('SPECIFIC FILTERING CASES');
console.log('='.repeat(60));

// ── 300-guest wedding, event level ──
{
  const resolved = resolveRequirements(requirementsByEventType['hindu-wedding'], { guestCount: 300 });
  printChecklist('hindu-wedding, event level, 300 guests', resolved);
  const hasGenerator = resolved.optional.some(r => r.category === 'Generator');
  const hasValet = resolved.optional.some(r => r.category === 'Valet');
  console.log(`  -> Generator present (min_guest_count:200, 300>=200): ${hasGenerator ? 'YES (correct)' : 'NO (BUG)'}`);
  console.log(`  -> Valet present (min_guest_count:200, 300>=200): ${hasValet ? 'YES (correct)' : 'NO (BUG)'}`);
}

// ── Same wedding, filtered to sangeet ──
{
  const resolved = resolveRequirements(requirementsByEventType['hindu-wedding'], { guestCount: 300, subEventId: 'sangeet' });
  printChecklist('hindu-wedding, filtered to sangeet, 300 guests', resolved);
  const djEntry = resolved.essential.find(r => r.category === 'DJ & Music') || resolved.recommended.find(r => r.category === 'DJ & Music');
  console.log(`  -> "DJ & Music" bucket in sangeet context (event-level=recommended, sangeet=essential): ${resolved.essential.some(r => r.category === 'DJ & Music') ? 'essential (correct — sub-event wins)' : 'NOT essential (BUG)'}`);
  const decoratorEntry = [...resolved.essential, ...resolved.recommended].find(r => r.category === 'Decorators');
  console.log(`  -> "Decorators" label in sangeet context (event-level="Mandap decoration", sangeet="Stage setup"): "${decoratorEntry?.contextual_label}" ${decoratorEntry?.contextual_label === 'Stage setup' ? '(correct)' : '(BUG)'}`);
  console.log(`  -> Event-level-only items still present (e.g. "Pandit"): ${resolved.essential.some(r => r.category === 'Pandit') ? 'YES (correct — event-level always included)' : 'NO (BUG)'}`);
}

// ── 5-year-old's birthday ──
{
  const resolved = resolveRequirements(requirementsByEventType['kids-birthday'], { childAge: 5 });
  printChecklist("kids-birthday, child age 5", resolved);
  const cats = resolved.optional.map(r => r.category);
  console.log(`  -> Optional categories at age 5: ${cats.join(', ')}`);
  console.log(`  -> Bouncy Castle (max_age:10, 5<=10) present: ${cats.includes('Bouncy Castle') ? 'YES (correct)' : 'NO (BUG)'}`);
  console.log(`  -> Science Show (min_age:7, 5<7) present: ${cats.includes('Science Show') ? 'YES (BUG)' : 'NO (correct)'}`);
}

// ── 9-year-old's birthday — confirms Bouncy Castle drops at 10, Science Show appears at 7 ──
{
  const resolved = resolveRequirements(requirementsByEventType['kids-birthday'], { childAge: 9 });
  printChecklist("kids-birthday, child age 9", resolved);
  const cats = resolved.optional.map(r => r.category);
  console.log(`  -> Optional categories at age 9: ${cats.join(', ')}`);
  console.log(`  -> Bouncy Castle (max_age:10, 9<=10) present: ${cats.includes('Bouncy Castle') ? 'YES (correct)' : 'NO (BUG)'}`);
  console.log(`  -> Science Show (min_age:7, 9>=7) present: ${cats.includes('Science Show') ? 'YES (correct)' : 'NO (BUG)'}`);
  console.log(`  -> Tattoo Artist (min_age:6, 9>=6) present: ${cats.includes('Tattoo Artist') ? 'YES (correct)' : 'NO (BUG)'}`);
  console.log(`  -> Puppet Show (max_age:8, 9>8) present: ${cats.includes('Puppet Show') ? 'YES (BUG)' : 'NO (correct — dropped)'}`);
}

// ── satyanarayan-katha ──
{
  const resolved = resolveRequirements(requirementsByEventType['satyanarayan-katha'], {});
  printChecklist('satyanarayan-katha', resolved);
}

console.log('\n' + '='.repeat(60));
console.log('checklist progress / budget split / unsupplied-categories smoke test');
console.log('='.repeat(60));
{
  const resolved = resolveRequirements(requirementsByEventType['hindu-wedding'], {});
  const bookings = [
    { category: 'Pandit', status: 'confirmed' },
    { category: 'Caterers', status: 'payment_pending' },
    { category: 'Photographers', status: 'cancelled' }, // should NOT count as handled
  ];
  const arranged = ['Tent House']; // handled offline, no booking
  const progress = computeChecklistProgress(resolved, bookings, arranged);
  console.log('\nprogress:', progress);
  console.log(`  -> Pandit+Caterers via active bookings, Tent House via arranged = 3/5 essentials handled: ${progress.essentialHandled === 3 ? 'correct' : 'BUG'}`);
  console.log(`  -> cancelled Photographers booking NOT counted: ${progress.essentialHandled !== 4 ? 'correct' : 'BUG'}`);

  const split = suggestBudgetSplit(resolved, 500000);
  console.log('\nbudget split (₹5,00,000 total):', split);
  console.log('\nbudget split with no budget given:', suggestBudgetSplit(resolved, 0));

  const unsupplied = findUnsuppliedCategories(resolved, ['Pandit', 'Caterers']);
  console.log(`\nunsupplied categories (${unsupplied.length}):`, unsupplied.map(r => r.category).join(', '));
}

console.log('\nDone.');
