// Plain Node sanity check for the invite-schema foundation — run with:
//   node scripts/verifyInviteSchemaFoundation.js
// Same hand-fixture + PASS/FAIL pattern every other scripts/verify*.js
// script in this repo uses. Exercises the real modules directly (not
// fixtures standing in for them) — lib/inviteSchemas/**, lib/
// functionVocabulary.js, lib/inviteContentAdapter.js, lib/eventCapabilities.js.
//
// Loader note: every other scripts/verify*.js loads exactly one
// self-contained lib/*.js file (by convention, those pure-resolver modules
// never locally import each other). lib/inviteSchemas/ is the first family
// with real cross-file local imports (index.js -> schemas/*.js -> fields.js
// + sections.js + types.js), by explicit design — the brief asked for a
// modular registry, not one large file. The plain single-file loadEsmAsCjs()
// every other script uses can't follow those nested `require()` calls (they
// arrive untransformed, still real ESM `export` syntax Node's own require()
// chokes on) — this script's loader recursively re-routes any relative
// `require()` a loaded module makes back through itself, memoized by
// resolved path, so the whole local dependency graph loads correctly.
// Bare-specifier requires (react, react-native, ...) fall through to
// Node's real require unchanged; nothing under test here needs one to
// resolve, but the fallback keeps the loader generically correct.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

const moduleCache = new Map();

function loadEsmAsCjs(filePath) {
  const resolved = require.resolve(filePath);
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;

  const { code } = babel.transformFileSync(resolved, { presets: ['babel-preset-expo'] });
  const m = new Module(resolved);
  m.filename = resolved;
  m.paths = Module._nodeModulePaths(path.dirname(resolved));
  moduleCache.set(resolved, m);

  const realRequire = m.require.bind(m);
  m.require = (request) => {
    if (request.startsWith('.')) {
      const abs = path.resolve(path.dirname(resolved), request);
      // Mirrors Node's own resolution order for an extension-less relative
      // specifier: exact file, then file.js, then directory/index.js (this
      // family imports directories — e.g. inviteContentAdapter.js's
      // `from './inviteSchemas'` resolves to inviteSchemas/index.js).
      const fs = require('fs');
      let target = abs;
      if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        if (fs.existsSync(`${abs}.js`)) target = `${abs}.js`;
        else target = path.join(abs, 'index.js');
      }
      return loadEsmAsCjs(target);
    }
    return realRequire(request);
  };

  m._compile(code, resolved);
  return m.exports;
}

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`);
  }
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const LIB = (...p) => path.resolve(__dirname, '..', 'lib', ...p);

const { getInviteSchema, isKnownEventTypeSlug, validateSchemaRegistry, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const hinduWeddingSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'hinduWedding.js')).default;
const funeralLastRitesSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'funeralLastRites.js')).default;
const { resolveFunctionVocabulary } = loadEsmAsCjs(LIB('functionVocabulary.js'));
const {
  listSchemaFields, normalizeInviteContent, buildContentPatch,
  mapToToranCoverCardProps, mapToStillnessCardProps, normalizeFunctionOverride,
} = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { isModuleEnabled, INVITE_CAPABILITY_MAP } = loadEsmAsCjs(LIB('eventCapabilities.js'));

console.log('\n── Schema resolution ──');
assert("getInviteSchema('hindu-wedding') returns the dedicated schema", getInviteSchema('hindu-wedding').slug === 'hindu-wedding');
assert("getInviteSchema('funeral-last-rites') returns the dedicated schema", getInviteSchema('funeral-last-rites').slug === 'funeral-last-rites');
assert("getInviteSchema('housewarming') falls back to generic (no dedicated schema yet)", getInviteSchema('housewarming').slug === null);
assert('getInviteSchema(null) falls back to generic', getInviteSchema(null).slug === null);

console.log('\n── Unknown-slug fallback ──');
assert("isKnownEventTypeSlug('hindu-wedding') is true", isKnownEventTypeSlug('hindu-wedding') === true);
assert("isKnownEventTypeSlug('totally-fake-slug') is false", isKnownEventTypeSlug('totally-fake-slug') === false);
assert("getInviteSchema('totally-fake-slug') never throws, returns generic", getInviteSchema('totally-fake-slug').slug === null);

console.log('\n── Registry validation ──');
const problems = validateSchemaRegistry();
assert('validateSchemaRegistry() reports zero problems', Array.isArray(problems) && problems.length === 0);
if (problems.length) problems.forEach((p) => console.log('    -', p));

console.log('\n── Non-festive resolution ──');
assert("isNonFestive('funeral-last-rites') is true (dedicated schema flag)", isNonFestive('funeral-last-rites') === true);
assert("isNonFestive('hindu-wedding') is false (dedicated schema flag)", isNonFestive('hindu-wedding') === false);
assert("isNonFestive('housewarming') is false (isCelebratory fallback, no dedicated schema)", isNonFestive('housewarming') === false);
assert('isNonFestive(null) is false (unknown slug defaults celebratory)', isNonFestive(null) === false);
assert("isNonFestive('totally-fake-slug') is false (unknown slug defaults celebratory)", isNonFestive('totally-fake-slug') === false);

console.log('\n── Function-vocabulary fallback ──');
const dbResult = resolveFunctionVocabulary({
  schema: hinduWeddingSchema,
  dbSubEvents: [
    { slug: 'sangeet', name: 'Sangeet', sort_order: 3, typical_day_offset: -1 },
    { slug: 'mehendi', name: 'Mehendi', sort_order: 1, typical_day_offset: -2 },
  ],
});
assert('real sub_events rows win: source is "db"', dbResult.source === 'db');
assert('db suggestions carry through, sorted by sort_order', dbResult.suggestions[0].slug === 'mehendi' && dbResult.suggestions[1].slug === 'sangeet');
assert('canUseCustomNames is always true alongside db suggestions', dbResult.canUseCustomNames === true);

const noDbResult = resolveFunctionVocabulary({ schema: hinduWeddingSchema, dbSubEvents: [] });
assert('no DB rows + hindu-wedding has no static vocabulary either -> source "none"', noDbResult.source === 'none' && noDbResult.suggestions.length === 0);
assert('canUseCustomNames stays true even with zero suggestions', noDbResult.canUseCustomNames === true);

const schemaFallbackSchema = { staticFunctionVocabulary: [{ name: 'Test Function', sortOrder: 0 }] };
const schemaFallbackResult = resolveFunctionVocabulary({ schema: schemaFallbackSchema, dbSubEvents: [] });
assert('no DB rows but schema declares a static vocabulary -> source "schema"', schemaFallbackResult.source === 'schema');
assert('schema-vocabulary suggestion carries through', schemaFallbackResult.suggestions[0].name === 'Test Function');

const funeralVocabResult = resolveFunctionVocabulary({ schema: funeralLastRitesSchema, dbSubEvents: [] });
assert('funeral-last-rites (functionVocabularyKey: null) resolves to "none" with zero suggestions', funeralVocabResult.source === 'none' && funeralVocabResult.suggestions.length === 0);

console.log('\n── Content-patch round trip / no-null-on-switch (the Critical Data Rule) ──');
const savedRow = {
  partner_1_name: 'Aarav', partner_2_name: 'Meera', hosted_by: null,
  couple_photo_url: null, couple_quote: null,
  kicker_text: null, headline_text: null,
  schema_content: { invocationText: 'Om Namah Shivaya' },
};
const normalized = normalizeInviteContent(hinduWeddingSchema, savedRow);
assert('normalizeInviteContent reads legacy-column fields correctly', normalized.partner1Name === 'Aarav' && normalized.partner2Name === 'Meera');
assert('normalizeInviteContent reads JSONB-only field correctly', normalized.invocationText === 'Om Namah Shivaya');

const patch1 = buildContentPatch(hinduWeddingSchema, normalized, savedRow.schema_content);
const patch2 = buildContentPatch(hinduWeddingSchema, normalized, savedRow.schema_content);
assert('buildContentPatch is deterministic given the same schema + values (no hidden design dependency)', deepEqual(patch1, patch2));
assert('buildContentPatch round-trips the legacy field unchanged', patch1.partner_1_name === 'Aarav');
assert('buildContentPatch round-trips the JSONB field unchanged', patch1.schema_content.invocationText === 'Om Namah Shivaya');

const funeralValues = { subjectNameLine1: 'Shri Ramesh', subjectNameLine2: '', subjectYears: '', detailLine1: 'Prayer meeting', detailLine2: '' };
const funeralPatch = buildContentPatch(funeralLastRitesSchema, funeralValues, {});
assert('funeral schema patch never includes a couple-shaped legacy column at all', !Object.prototype.hasOwnProperty.call(funeralPatch, 'partner_1_name'));
assert('funeral schema patch never includes couplePhotoUrl/coupleQuote columns', !Object.prototype.hasOwnProperty.call(funeralPatch, 'couple_photo_url') && !Object.prototype.hasOwnProperty.call(funeralPatch, 'couple_quote'));
assert('funeral schema patch writes its own declared fields', funeralPatch.subject_name_line1 === 'Shri Ramesh' && funeralPatch.detail_line1 === 'Prayer meeting');

// The actual regression this whole adapter exists to fix: two saves of the
// SAME schema with DIFFERENT values never touch a field the schema doesn't
// declare — modeling "host switches template_id from toran to diya, both
// resolve to the identical hindu-wedding schema, saves again" as two
// buildContentPatch calls that must produce identical key sets regardless
// of any 'design' variable (which isn't even a parameter to this function).
const patchAfterSwitch = buildContentPatch(hinduWeddingSchema, normalized, patch1.schema_content);
assert('field key set is identical across a simulated design switch + re-save', deepEqual(Object.keys(patch1).sort(), Object.keys(patchAfterSwitch).sort()));

console.log('\n── Adapter card-prop mapping ──');
const toranProps = mapToToranCoverCardProps('toran', { partner1Name: 'A', partner2Name: 'B', hostedBy: 'H', kickerText: 'K', headlineText: '' }, { name: 'Event', event_date: '2026-01-01', venue: 'V' });
assert('mapToToranCoverCardProps carries design + event fields through', toranProps.design === 'toran' && toranProps.eventName === 'Event' && toranProps.venue === 'V');
assert('mapToToranCoverCardProps maps semantic keys to ToranCoverCard prop names', toranProps.partner1Name === 'A' && toranProps.partner2Name === 'B' && toranProps.hostedBy === 'H');

const stillnessProps = mapToStillnessCardProps({ subjectNameLine1: 'X', subjectNameLine2: '', subjectYears: '1947 — 2026', detailLine1: 'D1', detailLine2: '' });
assert('mapToStillnessCardProps translates subjectNameLine1 -> nameLine1', stillnessProps.nameLine1 === 'X');
assert('mapToStillnessCardProps translates detailLine1 -> detailLine1 unchanged', stillnessProps.detailLine1 === 'D1');

assert('normalizeFunctionOverride(null) is null', normalizeFunctionOverride(null) === null);
const override = normalizeFunctionOverride({ template_id: 'diya', headline_text: 'H', name: 'Sangeet', date: '2026-02-01', time: '18:00' });
assert('normalizeFunctionOverride maps a real event_functions row correctly', override.headlineText === 'H' && override.name === 'Sangeet');

const toranPropsWithFunction = mapToToranCoverCardProps('toran', { headlineText: 'EventLevel' }, { name: 'Event' }, override);
assert('a function-row headlineText override wins over the event-level value', toranPropsWithFunction.headlineText === 'H');

console.log('\n── lib/eventCapabilities.js (thin wrapper, no reimplementation) ──');
const gateFixture = { entryControl: { capability_key: 'society_gate_pass' } };
assert('isModuleEnabled("gatePass") true when entryControl resolved to a real gate', isModuleEnabled(gateFixture, 'gatePass') === true);
assert('isModuleEnabled("gatePass") false for the explicit no_entry_control fallback', isModuleEnabled({ entryControl: { capability_key: 'no_entry_control' } }, 'gatePass') === false);
const giftsFixture = { byKey: { gift_register: { capability_key: 'gift_register' } } };
assert('isModuleEnabled("gifts") true when any one of the composite keys resolved', isModuleEnabled(giftsFixture, 'gifts') === true);
assert('isModuleEnabled("gifts") false when none of the composite keys resolved', isModuleEnabled({ byKey: {} }, 'gifts') === false);
assert('INVITE_CAPABILITY_MAP names all 11 brief concepts', Object.keys(INVITE_CAPABILITY_MAP).length === 11);

console.log('\n── listSchemaFields sanity ──');
const hinduFields = listSchemaFields(hinduWeddingSchema);
assert('hindu-wedding schema exposes exactly 8 fields (7 legacy-column + 1 JSONB-only)', hinduFields.length === 8);
assert('every hindu-wedding field key is unique', new Set(hinduFields.map((f) => f.key)).size === hinduFields.length);
const funeralFields = listSchemaFields(funeralLastRitesSchema);
assert('funeral-last-rites schema exposes exactly 5 fields', funeralFields.length === 5);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
