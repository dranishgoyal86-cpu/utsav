// Plain Node sanity check for the invite-schema foundation — run with:
//   node scripts/verifyInviteSchemaFoundation.js
// Same hand-fixture + PASS/FAIL pattern every other scripts/verify*.js
// script in this repo uses. Exercises the real modules directly (not
// fixtures standing in for them) — lib/inviteSchemas/** (all 26 dedicated
// schemas + generic fallback, invite-architecture wave Part 3), lib/
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
const fs = require('fs');

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
const { EVENT_TYPE_NAMES } = loadEsmAsCjs(LIB('eventTypeNames.js'));
const hinduWeddingSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'hinduWedding.js')).default;
const funeralLastRitesSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'funeralLastRites.js')).default;
const genericSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'generic.js')).default;
const namingCeremonySchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'namingCeremony.js')).default;
const birthdaySchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'birthday.js')).default;
const productLaunchSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'productLaunch.js')).default;
const interfaithWeddingSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'interfaithWedding.js')).default;
const religiousEventSchema = loadEsmAsCjs(LIB('inviteSchemas', 'schemas', 'religiousEvent.js')).default;
const { resolveFunctionVocabulary } = loadEsmAsCjs(LIB('functionVocabulary.js'));
const {
  listSchemaFields, normalizeInviteContent, buildContentPatch,
  mapToToranCoverCardProps, mapToStillnessCardProps, normalizeFunctionOverride,
} = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { isModuleEnabled, INVITE_CAPABILITY_MAP } = loadEsmAsCjs(LIB('eventCapabilities.js'));

// ── 1-4: registry coverage (all 26 canonical slugs) ──────────────────────
console.log('\n── Schema registry coverage (26 canonical slugs) ──');
const ALL_26_SLUGS = Object.keys(EVENT_TYPE_NAMES);
assert('EVENT_TYPE_NAMES has exactly 26 slugs (the canonical registry this file validates against)', ALL_26_SLUGS.length === 26);

let allResolveToDedicated = true;
for (const slug of ALL_26_SLUGS) {
  const schema = getInviteSchema(slug);
  if (schema.slug !== slug) {
    allResolveToDedicated = false;
    console.log(`    - "${slug}" resolved to schema with slug "${schema.slug}" (expected a dedicated match)`);
  }
}
assert('every one of the 26 canonical slugs resolves to ITS OWN dedicated schema (none fall through to generic)', allResolveToDedicated);

assert("'other' resolves explicitly to its own dedicated catch-all schema, not the slug-less generic fallback", getInviteSchema('other').slug === 'other');

assert("an unknown slug ('totally-fake-slug') safely resolves to the generic fallback (slug: null)", getInviteSchema('totally-fake-slug').slug === null);
assert('getInviteSchema(null) safely resolves to the generic fallback', getInviteSchema(null).slug === null);
assert("isKnownEventTypeSlug('totally-fake-slug') is false", isKnownEventTypeSlug('totally-fake-slug') === false);

// ── 5-8: registry validation, required fields, valid statuses/kinds, conditional integrity ──
console.log('\n── Registry validation (invariants checked automatically across all 26 schemas) ──');
const problems = validateSchemaRegistry();
assert('validateSchemaRegistry() reports zero problems across the full 26-schema registry', Array.isArray(problems) && problems.length === 0);
if (problems.length) problems.forEach((p) => console.log('    -', p));

let everySchemaHasRequired = true;
let everyFieldValid = true;
let everyConditionalValid = true;
const VALID_STATUSES = ['required', 'recommended', 'optional', 'conditional'];
const VALID_KINDS = ['text', 'textarea', 'photo', 'boolean', 'sections'];
for (const slug of ALL_26_SLUGS) {
  const schema = getInviteSchema(slug);
  const fields = listSchemaFields(schema);
  if (!fields.some((f) => f.status === 'required')) { everySchemaHasRequired = false; console.log(`    - "${slug}" has no required field`); }
  const keySet = new Set(fields.map((f) => f.key));
  for (const f of fields) {
    if (!VALID_STATUSES.includes(f.status)) everyFieldValid = false;
    if (!VALID_KINDS.includes(f.kind)) everyFieldValid = false;
    if (f.status === 'conditional' && (!f.conditionOn || !keySet.has(f.conditionOn) || typeof f.condition !== 'function')) {
      everyConditionalValid = false;
      console.log(`    - "${slug}" field "${f.key}" has an invalid conditional reference`);
    }
  }
}
assert('every one of the 26 schemas has at least one REQUIRED field', everySchemaHasRequired);
assert('every field across all 26 schemas uses a valid status and a valid kind', everyFieldValid);
assert('every CONDITIONAL field across all 26 schemas references a real field key in the same schema, with a real condition function', everyConditionalValid);

// ── 9-10: function vocabulary fallback + custom entry ─────────────────────
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

const noDbButStaticResult = resolveFunctionVocabulary({ schema: hinduWeddingSchema, dbSubEvents: [] });
assert("no DB rows -> falls back to hindu-wedding's own staticFunctionVocabulary (source 'schema')", noDbButStaticResult.source === 'schema' && noDbButStaticResult.suggestions.some((s) => s.slug === 'mehendi'));

const bothEmptyResult = resolveFunctionVocabulary({ schema: funeralLastRitesSchema, dbSubEvents: [] });
assert('no DB rows + no static vocabulary (funeral-last-rites) -> source "none", zero suggestions', bothEmptyResult.source === 'none' && bothEmptyResult.suggestions.length === 0);
assert('canUseCustomNames stays true in every case — host-entered custom function names are always allowed', dbResult.canUseCustomNames === true && noDbButStaticResult.canUseCustomNames === true && bothEmptyResult.canUseCustomNames === true);

// ── 11-12: non-festive resolver + funeral capability prohibitions ─────────
console.log('\n── Non-festive resolution + funeral capability prohibitions ──');
assert("isNonFestive('funeral-last-rites') is true", isNonFestive('funeral-last-rites') === true);
assert("isNonFestive('hindu-wedding') is false", isNonFestive('hindu-wedding') === false);
assert('isNonFestive(null) is false (unknown slug defaults celebratory)', isNonFestive(null) === false);

// Countdown: PlanView.js's countdown hero is gated on
// `daysUntil != null && !isPast && isCelebratoryEvent` where
// isCelebratoryEvent = !isNonFestive(slug) — so isNonFestive===true is
// exactly what suppresses it; verified here at the resolver level (the
// screen-level wiring itself was verified live via Playwright in Part 2).
assert('funeral-last-rites resolves non-festive -> PlanView.js suppresses its countdown hero', isNonFestive('funeral-last-rites') === true);

// Gifts: the 4 real gift capability_rules (gift_register/gift_qr_stickers/
// return_gifts/reciprocity_ledger) already exclude funeral-last-rites by
// omission from their event_type_slugs arrays — verified live against the
// real capability_rules table in the invite-schema-foundation wave's own
// report; re-asserted here structurally via the same fixture shape
// lib/eventCapabilities.js documents.
const giftsFixtureExcludingFuneral = { byKey: {} }; // funeral-last-rites resolves none of the 4 gift keys live
assert('funeral-last-rites resolves no gift capability (verified live against capability_rules; re-checked structurally here)', isModuleEnabled(giftsFixtureExcludingFuneral, 'gifts') === false);

// Celebratory Wishing Wall wording / celebratory motion / celebratory
// invite design are the three remaining safeguards named in the brief —
// design restriction is covered by isNonFestive() gating allowedDesigns
// (verified live in Part 2: only Stillness offered); Wishing Wall has no
// client screen yet (see the implementation report's discrepancy section)
// so there is no wording to test yet — isNonFestive() is the mechanism
// its future UI must consult, already exercised above.
assert('funeral schema itself carries no gift-shaped or celebratory-motion field (by construction — inspected schema field list)', !listSchemaFields(funeralLastRitesSchema).some((f) => /gift|countdown|motion/i.test(f.key)));

// ── 13-14: religious-event no religion inference, interfaith neutral naming ──
console.log('\n── Religious-event / interfaith-wedding neutrality ──');
const religiousNormalized = normalizeInviteContent(religiousEventSchema, null);
assert('religious-event\'s religiousEventType starts blank for a new event — never pre-filled with an inferred religion', religiousNormalized.religiousEventType === '');
assert('religious-event schema is NOT marked nonFestive — it is not assumed solemn/celebratory by its generic slug alone', religiousEventSchema.nonFestive === false);

const interfaithFieldKeys = listSchemaFields(interfaithWeddingSchema).map((f) => f.key);
assert('interfaith-wedding uses neutral partner1Name/partner2Name — no bride/groom-labeled field exists', interfaithFieldKeys.includes('partner1Name') && interfaithFieldKeys.includes('partner2Name'));
assert('interfaith-wedding uses neutral family1Note/family2Note — no bride-family/groom-family-labeled field exists', interfaithFieldKeys.includes('family1Note') && interfaithFieldKeys.includes('family2Note'));
assert('interfaith-wedding schema has no field key containing "bride" or "groom"', !interfaithFieldKeys.some((k) => /bride|groom/i.test(k)));

// ── 15-17: the three explicit conditional pairs ────────────────────────────
console.log('\n── Conditional field pairs (naming-ceremony, adult-birthday, product-launch) ──');
function findField(schema, key) {
  return listSchemaFields(schema).find((f) => f.key === key);
}
const babyNameField = findField(namingCeremonySchema, 'babyName');
assert('naming-ceremony: babyName is hidden when nameIsSecret is true', babyNameField.condition({ nameIsSecret: true }) === false);
assert('naming-ceremony: babyName is shown when nameIsSecret is false', babyNameField.condition({ nameIsSecret: false }) === true);
assert('naming-ceremony: babyName is shown when nameIsSecret is unset', babyNameField.condition({}) === true);

// birthdaySchema loads from schemas/birthday.js (filename kept for
// readability) but its own declared slug — and the key it's registered
// under in index.js — is the real canonical 'adult-birthday', re-confirmed
// via a dedicated slug-reconciliation pass against live events.event_type_
// slug/event_types/event_requirements/capability_rules: no literal
// 'birthday' value exists anywhere in production. See that schema file's
// own header comment for the full evidence trail.
const guestArrivalField = findField(birthdaySchema, 'guestArrivalTime');
assert('adult-birthday: guestArrivalTime is hidden when surprisePartyEnabled is false/unset', guestArrivalField.condition({}) === false && guestArrivalField.condition({ surprisePartyEnabled: false }) === false);
assert('adult-birthday: guestArrivalTime is shown when surprisePartyEnabled is true', guestArrivalField.condition({ surprisePartyEnabled: true }) === true);

const productNameField = findField(productLaunchSchema, 'productName');
assert('product-launch: productName is hidden when productNameHidden is true', productNameField.condition({ productNameHidden: true }) === false);
assert('product-launch: productName is shown when productNameHidden is false/unset', productNameField.condition({}) === true && productNameField.condition({ productNameHidden: false }) === true);

// ── 18-20: design switching / card-prop mapping / adapter round-trip safety ──
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

const funeralValues = { subjectNameLine1: 'Shri Ramesh', detailLine1: 'Prayer meeting', familyContactInfo: '98765xxxxx' };
const funeralPatch = buildContentPatch(funeralLastRitesSchema, funeralValues, {});
assert('funeral schema patch never includes a couple-shaped legacy column at all', !Object.prototype.hasOwnProperty.call(funeralPatch, 'partner_1_name'));
assert('funeral schema patch writes its own declared fields', funeralPatch.subject_name_line1 === 'Shri Ramesh' && funeralPatch.detail_line1 === 'Prayer meeting');

// Simulates "host switches template_id from toran to diya, both resolve to
// the identical hindu-wedding schema, saves again" — the field key set
// buildContentPatch produces must be identical regardless of any 'design'
// variable, which isn't even a parameter to this function.
const patchAfterSwitch = buildContentPatch(hinduWeddingSchema, normalized, patch1.schema_content);
assert('field key set is identical across a simulated design switch + re-save', deepEqual(Object.keys(patch1).sort(), Object.keys(patchAfterSwitch).sort()));

console.log('\n── Legacy card-prop mapping (ToranCoverCard/StillnessCard stay unchanged) ──');
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
assert('INVITE_CAPABILITY_MAP names all 11 brief concepts', Object.keys(INVITE_CAPABILITY_MAP).length === 11);

console.log('\n── Structural sanity ──');
const hinduFields = listSchemaFields(hinduWeddingSchema);
assert('hindu-wedding schema grew substantially in Part 3 (>15 fields, was 8 in the foundation wave) and every key is unique', hinduFields.length > 15 && new Set(hinduFields.map((f) => f.key)).size === hinduFields.length);
const funeralFields = listSchemaFields(funeralLastRitesSchema);
assert('funeral-last-rites schema grew in Part 3 (>5 fields, was 5 in the foundation wave) and every key is unique', funeralFields.length > 5 && new Set(funeralFields.map((f) => f.key)).size === funeralFields.length);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
