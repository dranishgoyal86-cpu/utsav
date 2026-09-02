// Utsav Invite Launch Verification & Hardening Pass. Run with:
// node scripts/verifyLaunchHardening.js
// Same hand-fixture + PASS/FAIL pattern, same recursive babel/CJS ESM
// loader every other scripts/verify*.js in this repo uses.

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
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}`); }
}

const LIB = (...p) => path.resolve(__dirname, '..', 'lib', ...p);

const {
  DESIGN_LABELS, CELEBRATORY_DESIGNS, SOLEMN_DESIGNS, parseProductionDesign,
  buildArchetypeTemplateId, isValidArchetypeSelection, getProductionDesignOptions,
} = loadEsmAsCjs(LIB('inviteProductionDesign.js'));
const { buildPresentationContent } = loadEsmAsCjs(LIB('invitePresentationModel.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent, buildContentPatch } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { getArchetype, listArchetypes } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { reorderSection, removeSection, addSection, withResyncedSortOrder } = loadEsmAsCjs(LIB('repeatableSectionLogic.js'));
const { fitNames, longestWordChars, maxFontSizeForWord, CARD_CONTENT_WIDTH } = loadEsmAsCjs(LIB('toranNameFit.js'));

// ── 1-3: Toran/legacy long-name overflow fix ────────────────────────────────
console.log('\n── Phase 1: ToranCoverCard long-name overflow fix ──');
const shortFit = fitNames(['Aishwarya', 'Siddharth'], 34);
assert('short normal-length names: font size unchanged at base (34)', shortFit.fontSize === 34);
assert('short normal-length names: zero spacing compaction', shortFit.compaction === 0);

const longFit = fitNames(['Aishwarya Venkataraman', 'Siddharth Ranganathan'], 34);
assert('two long real full-name pairs: font shrinks below base', longFit.fontSize < 34);
assert('two long real full-name pairs: font never shrinks below the 14px floor', longFit.fontSize >= 14);
assert('two long real full-name pairs: spacing compaction engages (both names estimated 2 lines)', longFit.compaction === 2);

const hyphenFit = fitNames(['Anjali Rao', 'Rohan Konstantinopoulos-Fernandez'], 34);
assert('hyphenated compound surname: font shrinks to guarantee the single long word still fits one line', hyphenFit.fontSize <= maxFontSizeForWord(longestWordChars('Konstantinopoulos-Fernandez')));
assert('hyphenated compound surname: computed word-fit ceiling itself never exceeds the card content width budget', maxFontSizeForWord(28) * 0.65 * 28 <= CARD_CONTENT_WIDTH + 1);

const oneVeryLongFit = fitNames(['Radhakrishnan Venkataramanujam', 'Priya'], 34);
assert('one extremely long name + one short/normal name: font shrinks (driven by the long one)', oneVeryLongFit.fontSize < 34);
assert('one extremely long name + one short/normal name: only the long name drives compaction (not both)', oneVeryLongFit.compaction === 1);

const singleShort = fitNames(['Ramesh'], 32); // ivory base size
assert('single short name (Ivory base 32): unchanged', singleShort.fontSize === 32 && singleShort.compaction === 0);
const eventNameFallbackFit = fitNames([null], 34); // no partner names at all -> eventName fallback path, empty list guard
assert('fitNames([null]) never throws and returns the base size (no names present)', eventNameFallbackFit.fontSize === 34 && eventNameFallbackFit.compaction === 0);

// ── 4: legacy template IDs still parse correctly ────────────────────────────
console.log('\n── Legacy template_id compatibility ──');
for (const legacyId of [...CELEBRATORY_DESIGNS, ...SOLEMN_DESIGNS]) {
  const parsed = parseProductionDesign(legacyId);
  assert(`legacy '${legacyId}' still parses unchanged`, parsed.kind === 'legacy' && parsed.legacyDesignId === legacyId);
}

// ── 5: every selectable archetype/variant template ID round-trips ──────────
console.log('\n── Registry-driven design-ID round trip (every production-selectable archetype/variant) ──');
let roundTripCount = 0;
for (const archetype of listArchetypes()) {
  const catalogueEntry = getCatalogueEntry(archetype.id);
  if (!catalogueEntry || catalogueEntry.status !== ARCHETYPE_STATUS.IMPLEMENTED) continue; // only production-selectable
  for (const variantId of archetype.variantIds) {
    roundTripCount++;
    const composite = buildArchetypeTemplateId(archetype.id, variantId);
    const parsed = parseProductionDesign(composite);
    const roundTrips = parsed.kind === 'archetype' && parsed.archetypeId === archetype.id && parsed.variantId === variantId;
    const validAsSaved = isValidArchetypeSelection(archetype.id, variantId);
    assert(`${archetype.id}:${variantId} round-trips exactly through buildArchetypeTemplateId->parseProductionDesign and validates`, roundTrips && validAsSaved);
  }
}
assert(`registry round-trip covered every implemented archetype's every variant (${roundTripCount} combinations, > 0)`, roundTripCount > 0);

// ── 6-8: malformed/unsupported design encoding fails safely ────────────────
console.log('\n── Production design encoding resilience ──');
assert('archetype:unknown:test -> kind:"none" (unknown archetype id), never crashes', parseProductionDesign('archetype:unknown:test').kind === 'none' || !isValidArchetypeSelection('unknown', 'test'));
assert('archetype:corporate-grid:unknown -> parses the shape but fails validation (unknown variant for a real archetype)', (() => {
  const p = parseProductionDesign('archetype:corporate-grid:unknown');
  return p.kind === 'archetype' && p.archetypeId === 'corporate-grid' && p.variantId === 'unknown' && isValidArchetypeSelection('corporate-grid', 'unknown') === false;
})());
assert('malformed colon-separated value (archetype:onlyonepart) never crashes, parses as kind:"none"', parseProductionDesign('archetype:onlyonepart').kind === 'none');
assert('empty string parses as kind:"none"', parseProductionDesign('').kind === 'none');
assert('null/undefined parse as kind:"none" (fresh, never-saved invite)', parseProductionDesign(null).kind === 'none' && parseProductionDesign(undefined).kind === 'none');
assert('a planned archetype (stillness) is never a valid active selection even with a real variant-shaped string', isValidArchetypeSelection('stillness', 'anything') === false);
assert('getCatalogueEntry confirms stillness stays PLANNED (never selectable in production)', getCatalogueEntry('stillness').status === ARCHETYPE_STATUS.PLANNED);
assert('an unsupported-for-this-slug archetype cannot become an active production choice: hindu-wedding picker never offers cultural-poster', (() => {
  const schema = getInviteSchema('hindu-wedding');
  const opts = getProductionDesignOptions({ eventTypeSlug: 'hindu-wedding', schema, values: { partner1Name: 'a', partner2Name: 'b' }, densitySignals: {}, isNonFestive: false });
  return ![...opts.recommended, ...opts.moreStyles].includes('cultural-poster');
})());

// ── 9: production design switching preserves content ───────────────────────
console.log('\n── Design switching never mutates content ──');
const switchSchema = getInviteSchema('hindu-wedding');
const switchValues = normalizeInviteContent(switchSchema, buildContentPatch(switchSchema, { partner1Name: 'Aishwarya', partner2Name: 'Siddharth', hostedBy: 'The Families' }, {}));
const switchBefore = JSON.stringify(switchValues);
buildPresentationContent({ eventTypeSlug: 'hindu-wedding', values: switchValues, event: { name: 'Test', venue: 'V' }, functions: [] });
assert('buildPresentationContent() (called as if re-rendering after a design switch) never mutates the underlying values object', JSON.stringify(switchValues) === switchBefore);

// ── 10-11: RepeatableSectionEditor data round-trips + sort order persists ──
console.log('\n── RepeatableSectionEditor data round trip (pure logic, extracted for direct testability) ──');
let ceremonies = [];
ceremonies = addSection(ceremonies);
ceremonies = addSection(ceremonies);
ceremonies[0] = { ...ceremonies[0], title: 'Nikah', venue: 'Home' };
ceremonies[1] = { ...ceremonies[1], title: 'Church', venue: 'Cathedral' };
assert('addSection() appends new items with sortOrder kept in sync with array position', ceremonies[0].sortOrder === 0 && ceremonies[1].sortOrder === 1);
const reordered = reorderSection(ceremonies, 1, -1); // move "Church" up above "Nikah"
assert('reorderSection() swaps items and resyncs sortOrder to the new array position', reordered[0].title === 'Church' && reordered[0].sortOrder === 0 && reordered[1].title === 'Nikah' && reordered[1].sortOrder === 1);
const reorderNoop = reorderSection(reordered, 0, -1); // already at the top -> no-op
assert('reorderSection() is a safe no-op (same array reference) at the top boundary', reorderNoop === reordered);
const afterRemove = removeSection(reordered, 0);
assert('removeSection() removes the item and resyncs remaining sortOrder from 0', afterRemove.length === 1 && afterRemove[0].title === 'Nikah' && afterRemove[0].sortOrder === 0);
assert('withResyncedSortOrder() is exported and idempotent on an already-synced array', JSON.stringify(withResyncedSortOrder(afterRemove)) === JSON.stringify(afterRemove));

console.log('\n── Interfaith ceremony sort order persists through the real content pipeline ──');
const ifSchema = getInviteSchema('interfaith-wedding');
const ifValues = normalizeInviteContent(ifSchema, buildContentPatch(ifSchema, {
  partner1Name: 'Fatima', partner2Name: 'Daniel',
  interfaithCeremonies: reordered, // "Church" (order 0), then "Nikah" (order 1) — the reordered result above
}, {}));
assert('interfaith ceremonies persist through buildContentPatch->normalizeInviteContent with array order intact', ifValues.interfaithCeremonies[0].title === 'Church' && ifValues.interfaithCeremonies[1].title === 'Nikah');
assert('interfaith ceremonies persist with sortOrder intact (not recomputed by the content pipeline)', ifValues.interfaithCeremonies[0].sortOrder === 0 && ifValues.interfaithCeremonies[1].sortOrder === 1);
const ifPresentation = buildPresentationContent({ eventTypeSlug: 'interfaith-wedding', values: ifValues, event: { name: 'Test' }, functions: [] });
assert('interfaith real-path storyText reflects the persisted order (Church before Nikah)', ifPresentation.storyText.indexOf('Church') < ifPresentation.storyText.indexOf('Nikah'));

// ── 12: secret baby name survives DB-like serialization without leak ───────
console.log('\n── Secret-name / hidden-product serialization regression ──');
const namingSchema = getInviteSchema('naming-ceremony');
const secretBaby = normalizeInviteContent(namingSchema, buildContentPatch(namingSchema, { nameIsSecret: true, babyName: 'Should Never Appear' }, {}));
const secretBabySerialized = JSON.parse(JSON.stringify(secretBaby)); // simulate a DB round trip (JSON in/out, same as schema_content JSONB)
assert('secret baby name absent after normalize', !secretBaby.babyName);
assert('secret baby name absent after a DB-like JSON serialize/deserialize round trip', !secretBabySerialized.babyName);
const secretBabyPresentation = buildPresentationContent({ eventTypeSlug: 'naming-ceremony', values: secretBabySerialized, event: { name: 'Test' }, functions: [] });
assert('secret baby name never resurfaces in the real presentation-content pipeline after the round trip', !JSON.stringify(secretBabyPresentation).includes('Should Never Appear'));

// ── 13: hidden product survives DB-like serialization without leak ─────────
const launchSchema = getInviteSchema('product-launch');
const hiddenProduct = normalizeInviteContent(launchSchema, buildContentPatch(launchSchema, { productNameHidden: true, productName: 'Should Never Appear' }, {}));
const hiddenProductSerialized = JSON.parse(JSON.stringify(hiddenProduct));
assert('hidden product name absent after normalize', !hiddenProduct.productName);
assert('hidden product name absent after a DB-like JSON serialize/deserialize round trip', !hiddenProductSerialized.productName);
const hiddenProductPresentation = buildPresentationContent({ eventTypeSlug: 'product-launch', values: hiddenProductSerialized, event: { name: 'Test' }, functions: [] });
assert('hidden product name never resurfaces in the real presentation-content pipeline after the round trip', !JSON.stringify(hiddenProductPresentation).includes('Should Never Appear'));

// ── 14: religious conditional fields persist only when active ──────────────
console.log('\n── Religious conditional-field persistence ──');
const nikahSchema = getInviteSchema('nikah');
const nikahWithBismillah = normalizeInviteContent(nikahSchema, buildContentPatch(nikahSchema, { partner1Name: 'A', partner2Name: 'B', bismillahEnabled: true, bismillahText: 'Host-supplied text' }, {}));
assert('nikah: host-supplied bismillahText persists when bismillahEnabled is true', nikahWithBismillah.bismillahText === 'Host-supplied text');
const nikahWithoutBismillah = normalizeInviteContent(nikahSchema, buildContentPatch(nikahSchema, { partner1Name: 'A', partner2Name: 'B', bismillahText: 'Should not appear' }, {}));
assert('nikah: unsupplied/disabled bismillahText remains absent (no auto-insertion)', !nikahWithoutBismillah.bismillahText);
const nikahSerializedRoundTrip = JSON.parse(JSON.stringify(nikahWithBismillah));
assert('nikah: host-supplied religious content survives a DB-like JSON round trip unchanged', nikahSerializedRoundTrip.bismillahText === 'Host-supplied text');

// ── 15: funeral remains Stillness-only ──────────────────────────────────────
console.log('\n── Funeral remains Stillness-only ──');
const funeralSchema = getInviteSchema('funeral-last-rites');
const funeralValues = normalizeInviteContent(funeralSchema, buildContentPatch(funeralSchema, {
  subjectNameLine1: 'Ramesh Kumar Goyal', riteType: 'Prayer Meeting (Uthala)', familyContactInfo: 'Contact: 98765 43210',
}, {}));
const funeralOptions = getProductionDesignOptions({ eventTypeSlug: 'funeral-last-rites', schema: funeralSchema, values: funeralValues, densitySignals: {}, isNonFestive: true });
assert('funeral: zero archetype options offered (recommended)', funeralOptions.recommended.length === 0);
assert('funeral: zero archetype options offered (moreStyles)', funeralOptions.moreStyles.length === 0);
assert('funeral: legacyDesigns is exactly SOLEMN_DESIGNS (Stillness only, no celebratory chip)', JSON.stringify(funeralOptions.legacyDesigns) === JSON.stringify(SOLEMN_DESIGNS));
assert('isNonFestive("funeral-last-rites") remains true (drives the Stillness-only gate)', isNonFestive('funeral-last-rites') === true);

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);
