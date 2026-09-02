// Production Integration Wave — connects the archetype system to the real
// save/render/share pipeline (ToranInvites.js/InviteDesignerDesktop.js/
// GuestList.js). Run with: node scripts/verifyProductionIntegration.js
// Same hand-fixture + PASS/FAIL pattern, same recursive ESM loader every
// other scripts/verify*.js in this repo uses.

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
const { normalizeInviteContent, buildContentPatch, mapToToranCoverCardProps, mapToStillnessCardProps } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { getArchetype } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));

// ── 1-5: legacy templates still parse/render correctly ─────────────────────
console.log('\n── Legacy template_id compatibility ──');
for (const legacyId of [...CELEBRATORY_DESIGNS, ...SOLEMN_DESIGNS]) {
  const parsed = parseProductionDesign(legacyId);
  assert(`legacy '${legacyId}' parses as kind:'legacy' with legacyDesignId:'${legacyId}' unchanged`, parsed.kind === 'legacy' && parsed.legacyDesignId === legacyId);
}
assert('legacy toran maps through mapToToranCoverCardProps unchanged', mapToToranCoverCardProps('toran', { partner1Name: 'A', partner2Name: 'B' }, { name: 'Test' }).design === 'toran');
assert('legacy stillness maps through mapToStillnessCardProps unchanged', mapToStillnessCardProps({ subjectNameLine1: 'X' }).nameLine1 === 'X');
assert('a null/undefined template_id parses as kind:"none" (fresh, never-saved invite)', parseProductionDesign(null).kind === 'none' && parseProductionDesign(undefined).kind === 'none');
assert('a malformed archetype-prefixed string never crashes, parses as kind:"none"', parseProductionDesign('archetype:onlyonepart').kind === 'none');

// ── 6-8: new archetype selection persists / round-trips ─────────────────────
console.log('\n── New archetype selection storage contract ──');
const composite = buildArchetypeTemplateId('cultural-poster', 'live-poster');
assert('buildArchetypeTemplateId() produces the documented archetype:<id>:<variant> shape', composite === 'archetype:cultural-poster:live-poster');
const reparsed = parseProductionDesign(composite);
assert('the composite string round-trips through parseProductionDesign() to the exact same archetypeId/variantId (production reload resolves the same design)', reparsed.kind === 'archetype' && reparsed.archetypeId === 'cultural-poster' && reparsed.variantId === 'live-poster');
assert('a saved archetype selection is confirmed valid/implemented via isValidArchetypeSelection()', isValidArchetypeSelection('cultural-poster', 'live-poster') === true);
assert('an archetype id that does not exist is never valid', isValidArchetypeSelection('does-not-exist', 'x') === false);
assert('a real archetype with a variant id that does not belong to it is never valid', isValidArchetypeSelection('cultural-poster', 'jaipur-peacock') === false);

// ── 9: design switching preserves semantic content ──────────────────────────
console.log('\n── Design switching never mutates content ──');
const contentSchema = getInviteSchema('hindu-wedding');
const contentValues = normalizeInviteContent(contentSchema, buildContentPatch(contentSchema, { partner1Name: 'Aishwarya', partner2Name: 'Siddharth', hostedBy: 'The Families' }, {}));
const beforeJson = JSON.stringify(contentValues);
buildPresentationContent({ eventTypeSlug: 'hindu-wedding', values: contentValues, event: { name: 'Test', venue: 'V' }, functions: [] });
buildPresentationContent({ eventTypeSlug: 'hindu-wedding', values: contentValues, event: { name: 'Test', venue: 'V' }, functions: [] });
assert('calling buildPresentationContent() twice (simulating a design switch + re-render) never mutates the underlying values object', JSON.stringify(contentValues) === beforeJson);

// ── 12-13: adult-birthday / funeral real-path content ───────────────────────
console.log('\n── Adult-birthday real-path content ──');
const abSchema = getInviteSchema('adult-birthday');
const abValues = normalizeInviteContent(abSchema, buildContentPatch(abSchema, {
  celebrantName: 'Rohan Mehta', milestoneAge: '40', surprisePartyEnabled: true,
  guestArrivalTime: '7:30 PM', celebrantArrivalTime: '8:15 PM', secrecyNote: 'Keep it a secret!',
}, {}));
const abPresentation = buildPresentationContent({ eventTypeSlug: 'adult-birthday', values: abValues, event: { name: 'Test' }, functions: [] });
assert('adult-birthday real-path honoureeAgeLine includes milestoneAge ("Turning 40")', abPresentation.honoureeAgeLine === 'Turning 40');
assert('adult-birthday real-path storyText includes the surprise-party guest-arrival sentence', abPresentation.storyText.includes('7:30 PM'));
assert('adult-birthday real-path storyText includes the celebrant-arrival sentence', abPresentation.storyText.includes('8:15 PM'));
assert('adult-birthday real-path storyText includes the secrecy note', abPresentation.storyText.includes('Keep it a secret!'));

console.log('\n── Funeral-last-rites real path (legacy StillnessCard, not the archetype registry) ──');
const funeralSchema = getInviteSchema('funeral-last-rites');
const funeralValues = normalizeInviteContent(funeralSchema, buildContentPatch(funeralSchema, {
  subjectNameLine1: 'Ramesh Kumar Goyal', subjectYears: '1947 – 2026', riteType: 'Prayer Meeting (Uthala)',
  detailLine1: 'Prayer meeting, 4 PM', familyContactInfo: 'Contact: 98765 43210',
}, {}));
const stillnessProps = mapToStillnessCardProps(funeralValues);
assert('funeral real path: riteType reaches StillnessCard props', stillnessProps.riteType === 'Prayer Meeting (Uthala)');
assert('funeral real path: familyContactInfo reaches StillnessCard props as contactInfo', stillnessProps.contactInfo === 'Contact: 98765 43210');
assert('funeral is non-festive (isNonFestive true — drives the SOLEMN_DESIGNS-only gate)', isNonFestive('funeral-last-rites') === true);
const funeralDesignOptions = getProductionDesignOptions({ eventTypeSlug: 'funeral-last-rites', schema: funeralSchema, values: funeralValues, densitySignals: {}, isNonFestive: true });
assert('funeral real path: getProductionDesignOptions() offers ZERO archetype options (Stillness-only, no celebratory design selector)', funeralDesignOptions.recommended.length === 0 && funeralDesignOptions.moreStyles.length === 0);
assert('funeral real path: legacyDesigns is exactly SOLEMN_DESIGNS (Stillness only)', JSON.stringify(funeralDesignOptions.legacyDesigns) === JSON.stringify(SOLEMN_DESIGNS));
// Per-function StillnessCard props (functionOverride set) must NOT carry
// riteType/contactInfo — only the main event card does (see
// mapToStillnessCardProps' own comment) — a real regression risk this
// integration wave's own change to that function could have introduced.
const stillnessFnProps = mapToStillnessCardProps(funeralValues, { name: 'Tehravi', date: '2026-12-27', time: '11:00 AM' });
assert('funeral per-function card: riteType/contactInfo are suppressed (undefined) when rendering a per-function override, not leaked from the main card', stillnessFnProps.riteType === undefined && stillnessFnProps.contactInfo === undefined);

// ── 14-19: professional/public-event real path selects a compatible design ──
console.log('\n── Professional/public-event real-path design offering ──');
function realPathOffersArchetype(eventTypeSlug, expectedArchetypeId, values) {
  const schema = getInviteSchema(eventTypeSlug);
  const opts = getProductionDesignOptions({ eventTypeSlug, schema, values, densitySignals: {}, isNonFestive: false });
  return [...opts.recommended, ...opts.moreStyles].includes(expectedArchetypeId);
}
assert('corporate-conference real path offers corporate-grid (was wedding-coded-only before this wave)', realPathOffersArchetype('corporate-conference', 'corporate-grid', { headlineText: 'Summit' }));
assert('product-launch real path offers luxury-black', realPathOffersArchetype('product-launch', 'luxury-black', { headlineText: 'Launch' }));
assert('exhibition real path offers cultural-poster', realPathOffersArchetype('exhibition', 'cultural-poster', { headlineText: 'Show' }));
assert('concert real path offers cultural-poster', realPathOffersArchetype('concert', 'cultural-poster', { headlineText: 'Concert' }));
assert('sports-event real path offers cultural-poster', realPathOffersArchetype('sports-event', 'cultural-poster', { sportName: 'Cricket', headlineText: 'League', participationMode: 'Both' }));
assert('festival-fair real path offers folk-celebration AND cultural-poster (no longer constrained to Diya alone)', realPathOffersArchetype('festival-fair', 'folk-celebration', { headlineText: 'Mela' }) && realPathOffersArchetype('festival-fair', 'cultural-poster', { headlineText: 'Mela' }));

// ── 20: interfaith ceremony content survives ────────────────────────────────
console.log('\n── Interfaith ceremony content ──');
const ifSchema = getInviteSchema('interfaith-wedding');
const ifValues = normalizeInviteContent(ifSchema, buildContentPatch(ifSchema, {
  partner1Name: 'Fatima', partner2Name: 'Daniel', family1Note: 'The Rahmans', family2Note: 'The Coelhos',
  interfaithCeremonies: [{ id: 'c1', title: 'Nikah', venue: 'Home', date: '2026-12-12', sortOrder: 0 }, { id: 'c2', title: 'Church', venue: 'Cathedral', date: '2026-12-12', sortOrder: 1 }],
}, {}));
const ifPresentation = buildPresentationContent({ eventTypeSlug: 'interfaith-wedding', values: ifValues, event: { name: 'Test' }, functions: [] });
assert('interfaith real-path storyText includes both ceremonies (Nikah and Church), neither dropped', ifPresentation.storyText.includes('Nikah') && ifPresentation.storyText.includes('Church'));
assert('interfaith real-path functionsTitle is "Ceremonies"', ifPresentation.functionsTitle === 'Ceremonies');

// ── 21-23: conditional/privacy suppression remains intact ──────────────────
console.log('\n── Conditional/privacy suppression regression ──');
const nikahSchema = getInviteSchema('nikah');
const nikahNoReligion = normalizeInviteContent(nikahSchema, buildContentPatch(nikahSchema, { partner1Name: 'A', partner2Name: 'B' }, {}));
assert('nikah: bismillahText still suppressed with no bismillahEnabled (regression, real production path)', !nikahNoReligion.bismillahText);
const namingSchema = getInviteSchema('naming-ceremony');
const secretBaby = normalizeInviteContent(namingSchema, buildContentPatch(namingSchema, { nameIsSecret: true, babyName: 'Should Never Appear' }, {}));
assert('secret baby name remains suppressed (regression, real production path)', !secretBaby.babyName);
const launchSchema = getInviteSchema('product-launch');
const hiddenProduct = normalizeInviteContent(launchSchema, buildContentPatch(launchSchema, { productNameHidden: true, productName: 'Should Never Appear' }, {}));
assert('hidden product name remains suppressed (regression, real production path)', !hiddenProduct.productName);

// ── 24: mandatory branding remains (ProductionInviteCard's archetype path) ──
console.log('\n── Branding via the real production bridge path ──');
const { buildStaticLayoutModel } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
const { STATIC_SLOT } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const brandModel = buildStaticLayoutModel({ archetypeId: 'cultural-poster', variantId: 'live-poster', event: { name: 'Test' }, values: { headlineText: 'Test' }, eventTypeSlug: 'concert', isNonFestive: false, qrTargetUrl: null });
assert('a real production-path archetype selection still carries mandatory, policy-exact branding (qrTargetUrl:null, matching ProductionInviteCard\'s own no-guest-leak rule, does not affect it)', brandModel.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: false, surface: 'static' }).staticLine);
assert('qrTargetUrl:null (the real production bridge\'s deliberate choice — no guest-specific pass_code baked into the shared capture) correctly omits the QR slot', !brandModel.slots[STATIC_SLOT.QR_FOOTER]);

// ── 25-26: selector safety — no planned/unsupported design persistable ─────
console.log('\n── Selector safety ──');
for (const slug of ['hindu-wedding', 'nikah', 'corporate-conference', 'concert', 'other']) {
  const schema = getInviteSchema(slug);
  const opts = getProductionDesignOptions({ eventTypeSlug: slug, schema, values: { headlineText: 'x', partner1Name: 'a', partner2Name: 'b' }, densitySignals: {}, isNonFestive: false });
  const allIds = [...opts.recommended, ...opts.moreStyles];
  assert(`${slug}: no planned archetype ever appears in the real production picker's options`, allIds.every((id) => getCatalogueEntry(id).status === ARCHETYPE_STATUS.IMPLEMENTED));
}
// An archetype not supported for a given slug must never be persistable —
// isValidArchetypeSelection() only checks "does this archetype/variant
// exist at all", so the REAL guard against an unsupported-for-this-slug
// selection is that the picker UI only ever offers getProductionDesignOptions()'s
// own recommended/moreStyles ids — verified here by confirming a
// deliberately wrong pairing (a wedding archetype for corporate-conference,
// which the catalogue does list as compatible in this specific case — use
// a genuinely unsupported one instead: cultural-poster is NOT offered for
// hindu-wedding).
const hinduWeddingOpts = getProductionDesignOptions({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: { partner1Name: 'a', partner2Name: 'b' }, densitySignals: {}, isNonFestive: false });
assert('hindu-wedding\'s real picker never offers cultural-poster (not in its catalogue-declared strong/compatible set)', ![...hinduWeddingOpts.recommended, ...hinduWeddingOpts.moreStyles].includes('cultural-poster'));

// ── 27: legacy invite rows with no new selection still work ────────────────
console.log('\n── Legacy-only invite rows (no archetype ever selected) ──');
const legacyOnlyParsed = parseProductionDesign('toran');
assert('a legacy-only row (template_id="toran", never touched by this wave\'s picker) still parses and renders via the legacy path, unaffected', legacyOnlyParsed.kind === 'legacy' && legacyOnlyParsed.legacyDesignId === 'toran');

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);
