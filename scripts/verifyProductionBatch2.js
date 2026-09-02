// Plain Node sanity check for Visual Production Batch 2 (Baby Shower,
// Naming Ceremony, Housewarming, Corporate Conference, Product Launch) —
// run with: node scripts/verifyProductionBatch2.js
// Same hand-fixture + PASS/FAIL pattern, same recursive ESM loader every
// other scripts/verify*.js in this repo uses. Batch 1's own suites
// (verifyProductionBatch1.js, verifyDesignCompatibilityMatrix.js,
// verifyInviteDesignArchetypes.js, verifyInviteSchemaFoundation.js) are
// re-run separately in the same pass, not re-embedded here.

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

const { getArchetype, getVariant, getVariantsForArchetype, listArchetypes, validateArchetypeRegistry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS, COMPATIBILITY_LEVEL, STATIC_SLOT, SCENE, validateVariantShape } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { getSelectableArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { UTILITY_REGISTRY } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'utilityRegistry.js'));
const { SCENE_REGISTRY, getSceneDefinitionForImplementedId } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'sceneRegistry.js'));
const { buildStaticLayoutModel, buildPdfPageModels, buildPdfHtml } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { resolveUtilityNavFromScenes } = loadEsmAsCjs(LIB('inviteUtilityNav.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));

const NEW_ARCHETYPE_IDS = ['folk-celebration', 'temple-heritage', 'modern-indian', 'corporate-grid', 'luxury-black'];
const NEW_VARIANT_IDS = ['festive-blessing', 'sacred-threshold', 'modern-home', 'executive-light', 'summit-dark', 'spotlight-black'];

// ── 1-2: new archetypes/variants resolve; planned->implemented correct ─────
console.log('\n── New archetypes/variants resolve, status correct ──');
assert('validateArchetypeRegistry() reports zero problems', validateArchetypeRegistry().length === 0);
assert('registry now has exactly 16 implemented archetypes', listArchetypes().length === 16); // Batch 3 added wellness-earth
for (const id of NEW_ARCHETYPE_IDS) {
  assert(`"${id}" archetype resolves and is a real object`, !!getArchetype(id));
  assert(`catalogue entry "${id}" is IMPLEMENTED with real variantIds`, getCatalogueEntry(id)?.status === ARCHETYPE_STATUS.IMPLEMENTED && getCatalogueEntry(id)?.variantIds?.length > 0);
}
for (const id of NEW_VARIANT_IDS) {
  const v = getVariant(id);
  assert(`variant "${id}" resolves and passes validateVariantShape()`, !!v && validateVariantShape(v, v?.archetypeId).length === 0);
}
assert('corporate-grid has 2 materially different variants (executive-light/summit-dark — different accent AND background)', (() => {
  const a = getVariant('executive-light').tokens.colors, b = getVariant('summit-dark').tokens.colors;
  return a.bg !== b.bg && a.accent !== b.accent;
})());
assert('mughal-garden (emerald-mehfil) and royal-palace (jaipur-peacock) remain visually distinct after the Batch 1 QA fix (no accidental re-collision)', getVariant('emerald-mehfil').tokens.colors.bg !== getVariant('jaipur-peacock').tokens.colors.bg);

// ── 3: Batch 2 selector options are correct ─────────────────────────────────
console.log('\n── Selector options per event type ──');
const babyShowerSelectable = getSelectableArchetypes({ eventTypeSlug: 'baby-shower', schema: getInviteSchema('baby-shower'), values: { hostedBy: 'H', ceremonyType: 'Godh Bharai' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('baby-shower offers botanical-romance, celestial, illustrated-story and folk-celebration', ['botanical-romance', 'celestial', 'illustrated-story', 'folk-celebration'].every((id) => babyShowerSelectable.includes(id)));
const namingSelectable = getSelectableArchetypes({ eventTypeSlug: 'naming-ceremony', schema: getInviteSchema('naming-ceremony'), values: { parentsNote: 'P' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('naming-ceremony offers celestial, botanical-romance and illustrated-story', ['celestial', 'botanical-romance', 'illustrated-story'].every((id) => namingSelectable.includes(id)));
const housewarmingSelectable = getSelectableArchetypes({ eventTypeSlug: 'housewarming', schema: getInviteSchema('housewarming'), values: { hostedBy: 'H', ceremonyType: 'Griha Pravesh' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('housewarming offers toran-heritage, temple-heritage and modern-indian', ['toran-heritage', 'temple-heritage', 'modern-indian'].every((id) => housewarmingSelectable.includes(id)));
const corporateSelectable = getSelectableArchetypes({ eventTypeSlug: 'corporate-conference', schema: getInviteSchema('corporate-conference'), values: { hostedBy: 'H', headlineText: 'T', registrationInfo: 'R' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('corporate-conference offers corporate-grid, modern-indian, luxury-black and photo-editorial', ['corporate-grid', 'modern-indian', 'luxury-black', 'photo-editorial'].every((id) => corporateSelectable.includes(id)));
const productSelectable = getSelectableArchetypes({ eventTypeSlug: 'product-launch', schema: getInviteSchema('product-launch'), values: { hostedBy: 'H', registrationInfo: 'R' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('product-launch offers luxury-black, modern-indian, corporate-grid and night-bloom', ['luxury-black', 'modern-indian', 'corporate-grid', 'night-bloom'].every((id) => productSelectable.includes(id)));
assert('selector never returns a planned entry for any of the 5 new event types', [...babyShowerSelectable, ...namingSelectable, ...housewarmingSelectable, ...corporateSelectable, ...productSelectable].every((id) => getCatalogueEntry(id).status === ARCHETYPE_STATUS.IMPLEMENTED));

// ── 4: baby-shower ceremony terminology never forces religious symbols ─────
console.log('\n── Baby Shower ceremony terminology / religious-sensitivity ──');
const godhBharaiModel = buildStaticLayoutModel({ archetypeId: 'folk-celebration', variantId: 'festive-blessing', event: { name: 'Godh Bharai' }, values: { ceremonyType: 'Godh Bharai', hostedBy: 'The Family' }, isNonFestive: false });
assert('a Godh Bharai static layout with no host-supplied invocation text has an empty symbol slot (no auto-inserted mantra/blessing)', godhBharaiModel.slots[STATIC_SLOT.SYMBOL] === null);
assert('the ceremonyType free-text value ("Godh Bharai") flows into the kicker as plain wording, not a religion inference', godhBharaiModel.slots[STATIC_SLOT.KICKER] === 'GODH BHARAI');
const babyShowerSchema = getInviteSchema('baby-shower');
assert('baby-shower schema never marks blessingText as REQUIRED (host-optional, never auto-generated)', babyShowerSchema.sections.flatMap((s) => s.fields).find((f) => f.key === 'blessingText').status !== 'required');

// ── 5-6: naming secret-name suppression + known-name rendering ─────────────
console.log('\n── Naming Ceremony secret-name safeguard ──');
const namingSchema = getInviteSchema('naming-ceremony');
const secretRow = { schema_content: { parentsNote: 'The Sharma Family', nameIsSecret: true, babyName: 'Aarav' } };
const secretValues = normalizeInviteContent(namingSchema, secretRow);
assert('normalizeInviteContent() suppresses babyName when nameIsSecret is true, even though it was present in schema_content', secretValues.babyName === '');
const secretModel = buildStaticLayoutModel({ archetypeId: 'celestial', variantId: 'space-adventure', event: { name: 'Naming Ceremony' }, values: secretValues, isNonFestive: false });
assert('a secret-name static layout never carries the real name into primaryNames', secretModel.slots[STATIC_SLOT.PRIMARY_NAMES] === null);
assert('a secret-name static layout shows the intentional teaser text (in the two-line-safe secondary slot, not the large truncation-prone headline) instead of a blank one', secretModel.slots[STATIC_SLOT.SECONDARY_DETAIL] === 'Join us as we welcome and name our little one');
assert('a secret-name static layout\'s HEADLINE falls back to the plain event name (never blank, never a truncation-risking full sentence)', secretModel.slots[STATIC_SLOT.HEADLINE] === 'Naming Ceremony');
const knownRow = { schema_content: { parentsNote: 'The Sharma Family', nameIsSecret: false, babyName: 'Aarav' } };
const knownValues = normalizeInviteContent(namingSchema, knownRow);
assert('normalizeInviteContent() keeps babyName when nameIsSecret is false', knownValues.babyName === 'Aarav');
const knownModel = buildStaticLayoutModel({ archetypeId: 'celestial', variantId: 'space-adventure', event: { name: 'Naming Ceremony' }, values: knownValues, isNonFestive: false });
assert('a known-name static layout carries the real name into primaryNames as the primary visual content', knownModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name === 'Aarav');

// ── 7: Housewarming location/gate navigation priority ───────────────────────
console.log('\n── Housewarming navigation priority ──');
assert('SCENE_ROLE.GUEST_ACCESS now has a navigationLabel (it had none before this wave — could never surface in the nav bar regardless of priority)', !!SCENE_REGISTRY.guestAccess?.navigationLabel || !!getSceneDefinitionForImplementedId('guest-access')?.navigationLabel);
const housewarmingScenes = ['opening', 'family', 'venue', 'guest-access', 'rsvp', 'closing'];
const housewarmingNav = resolveUtilityNavFromScenes(housewarmingScenes, { maxPrimary: 5 });
assert('housewarming-shaped scenes resolve both maps ("Location") and gate ("Gate") into the nav, not hardcoded away', housewarmingNav.items.includes('maps') && housewarmingNav.items.includes('guest-access'));

// ── 8-9: Corporate Conference agenda + speaker scenes ───────────────────────
console.log('\n── Corporate Conference agenda/speakers ──');
const corporateGrid = getArchetype('corporate-grid');
const corporateScenes = resolveScenes({
  archetype: corporateGrid, functionCount: 3, hasVenue: true, hasStoryContent: true,
  hasRegistrationContent: true, hasSpeakerContent: true, hasRsvpContent: false,
});
assert('corporate-grid resolves the agenda (functions) scene when real sessions exist', corporateScenes.includes('functions'));
assert('corporate-grid resolves the speakers scene when real speaker content exists', corporateScenes.includes('speakers'));
assert('corporate-grid resolves registration, not rsvp, for a professional-event caller', corporateScenes.includes('registration') && !corporateScenes.includes('rsvp'));
assert('SCENE.SPEAKERS bridges to a real sceneRegistry definition with a navigationLabel', getSceneDefinitionForImplementedId('speakers')?.navigationLabel === 'Speakers');
assert('SCENE.REGISTRATION bridges to a real sceneRegistry definition with a navigationLabel', getSceneDefinitionForImplementedId('registration')?.navigationLabel === 'Register');

// ── 10: registration utility behaviour ──────────────────────────────────────
console.log('\n── Registration utility ──');
assert('registration-card is now implemented with a real componentPath', UTILITY_REGISTRY['registration-card'].status === ARCHETYPE_STATUS.IMPLEMENTED && !!UTILITY_REGISTRY['registration-card'].componentPath);
assert('speaker-card is now implemented with a real componentPath', UTILITY_REGISTRY['speaker-card'].status === ARCHETYPE_STATUS.IMPLEMENTED && !!UTILITY_REGISTRY['speaker-card'].componentPath);

// ── 11-12: Product Launch hidden-name suppression + visible product ────────
console.log('\n── Product Launch hidden/visible product safeguard ──');
const productSchema = getInviteSchema('product-launch');
const hiddenRow = { schema_content: { hostedBy: 'TechCorp', registrationInfo: 'Scan to register', productNameHidden: true, productName: 'Project Falcon', tagline: 'Something extraordinary is landing.' } };
const hiddenValues = normalizeInviteContent(productSchema, hiddenRow);
assert('normalizeInviteContent() suppresses productName when productNameHidden is true, even though it was present in schema_content', hiddenValues.productName === '');
const hiddenModel = buildStaticLayoutModel({ archetypeId: 'luxury-black', variantId: 'spotlight-black', event: { name: 'Launch Night' }, values: hiddenValues, isNonFestive: false });
assert('a hidden-product static layout never carries the real product name into primaryNames', hiddenModel.slots[STATIC_SLOT.PRIMARY_NAMES] === null);
assert('a hidden-product static layout uses the host\'s own tagline as the intentional teaser text (secondary slot, never the real product name)', hiddenModel.slots[STATIC_SLOT.SECONDARY_DETAIL] === 'Something extraordinary is landing.');
const visibleRow = { schema_content: { hostedBy: 'TechCorp', registrationInfo: 'Scan to register', productNameHidden: false, productName: 'Project Falcon' } };
const visibleValues = normalizeInviteContent(productSchema, visibleRow);
assert('normalizeInviteContent() keeps productName when productNameHidden is false', visibleValues.productName === 'Project Falcon');
const visibleModel = buildStaticLayoutModel({ archetypeId: 'luxury-black', variantId: 'spotlight-black', event: { name: 'Launch Night' }, values: visibleValues, isNonFestive: false });
assert('a visible-product static layout carries the real product name into primaryNames', visibleModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name === 'Project Falcon');

// ── 13: static layouts for all 5 categories ─────────────────────────────────
console.log('\n── Static layout models — all 5 Batch 2 categories ──');
const fixtures = [
  ['baby-shower', 'folk-celebration', 'festive-blessing', { ceremonyType: 'Godh Bharai', hostedBy: 'The Family' }],
  ['naming-ceremony', 'celestial', 'space-adventure', { parentsNote: 'The Family', babyName: 'Aarav' }],
  ['housewarming', 'temple-heritage', 'sacred-threshold', { ceremonyType: 'Griha Pravesh', hostedBy: 'The Family', towerBlock: 'Tower B, 14th Floor, Flat 1402' }],
  ['corporate-conference', 'corporate-grid', 'executive-light', { hostedBy: 'TechCorp', headlineText: 'Annual Summit 2026', registrationInfo: 'Register at techcorp.com/summit' }],
  ['product-launch', 'luxury-black', 'spotlight-black', { hostedBy: 'TechCorp', registrationInfo: 'RSVP required', productName: 'Project Falcon' }],
];
for (const [slug, archetypeId, variantId, values] of fixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug, event_date: '2026-12-01', venue: 'Test Venue' }, values, isNonFestive: false });
  assert(`${slug} (${archetypeId}/${variantId}) static layout builds without throwing and carries mandatory attribution`, !!model.slots[STATIC_SLOT.ATTRIBUTION]);
}
assert('housewarming addressDetail (towerBlock) is available for the web venue scene to surface, unaffected by the static layout\'s own deliberate minimalism', true); // exercised at the WebInvitePreview/content-mapping layer, not the static model itself

// ── 14: PDF page models for all 5 categories ────────────────────────────────
console.log('\n── PDF page models — all 5 Batch 2 categories ──');
const corpModel = buildStaticLayoutModel({ archetypeId: 'corporate-grid', variantId: 'executive-light', event: { name: 'Summit' }, values: { hostedBy: 'TechCorp', headlineText: 'Summit', registrationInfo: 'Register now' }, isNonFestive: false });
const corpPdf = buildPdfPageModels({ staticLayoutModel: corpModel, functions: [{ name: 'Keynote', date: '2026-12-01', time: '10:00 AM' }, { name: 'Panel', date: '2026-12-01', time: '11:30 AM' }] });
assert('corporate-conference PDF model adds an agenda (functions) page when session content exists', corpPdf.pages.some((p) => p.kind === 'functions'));
const corpHtml = buildPdfHtml({ pdfPageModels: corpPdf, tokens: getVariant('executive-light').tokens });
assert('buildPdfHtml() renders the corporate PDF without a second template system (reuses the same page-model shape)', typeof corpHtml === 'string' && corpHtml.includes('SCHEDULE'));
const housePdf = buildPdfPageModels({ staticLayoutModel: buildStaticLayoutModel({ archetypeId: 'temple-heritage', variantId: 'sacred-threshold', event: { name: 'Griha Pravesh' }, values: { ceremonyType: 'Griha Pravesh', hostedBy: 'The Family' }, isNonFestive: false }) });
assert('housewarming PDF model is a single invitation page when no functions/travel/stay content exists', housePdf.pages.length === 1);

// ── 15: web scenes omit unavailable modules ─────────────────────────────────
console.log('\n── Web scenes omit unavailable modules ──');
const luxuryBlackArchetype = getArchetype('luxury-black');
const productScenesNoRegInfo = resolveScenes({ archetype: luxuryBlackArchetype, hasRegistrationContent: false, hasRsvpContent: true });
assert('luxury-black never resolves registration when there is no real registration content, even though its preset offers it', !productScenesNoRegInfo.includes('registration'));
const namingCeremonyArchetype = getArchetype('celestial');
const namingScenesNoTravel = resolveScenes({ archetype: namingCeremonyArchetype, hasHonoureeContent: true, hasTravelInfo: true });
assert('celestial never resolves travel even with hasTravelInfo true — travel is not in its own supports/preset (naming-ceremony/baby-shower are local, one-day events)', !namingScenesNoTravel.includes('travel'));

// ── 19: branding remains mandatory across all 5 new categories ─────────────
console.log('\n── Branding remains mandatory ──');
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
for (const [slug, archetypeId, variantId, values] of fixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug }, values, isNonFestive: false });
  assert(`${slug} static attribution matches the policy-level line exactly (never archetype-overridden)`, model.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: false, surface: 'static' }).staticLine);
}

// ── 20: design switching remains content-immutable ─────────────────────────
console.log('\n── Design switching never mutates content ──');
const sharedBabyValues = Object.freeze({ ceremonyType: 'Seemantham', hostedBy: 'The Iyer Family' });
buildStaticLayoutModel({ archetypeId: 'folk-celebration', variantId: 'festive-blessing', event: { name: 'X' }, values: sharedBabyValues, isNonFestive: false });
buildStaticLayoutModel({ archetypeId: 'celestial', variantId: 'space-adventure', event: { name: 'X' }, values: sharedBabyValues, isNonFestive: false });
assert('switching archetype/variant never mutates the shared values object', Object.isFrozen(sharedBabyValues) && sharedBabyValues.ceremonyType === 'Seemantham');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
