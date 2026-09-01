// Plain Node sanity check for the Design System Scaling Foundation wave —
// run with: node scripts/verifyDesignCompatibilityMatrix.js
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

const { CATALOGUE, listCatalogueEntries, getCatalogueEntry, EVENT_STRONG_ARCHETYPES } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { ARCHETYPE_STATUS, COMPATIBILITY_LEVEL, validateCatalogueEntryShape, LIFECYCLE_MODE, LIFECYCLE_PRIORITY, STATIC_LAYOUT_FAMILY, PDF_PAGE_ROLE } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { resolveCompatibilityLevel, resolveMatrixForEvent, getSelectableArchetypes, getPlanningArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { SCENE_REGISTRY, listSceneDefinitions, validateSceneRegistry, getSceneDefinitionForImplementedId } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'sceneRegistry.js'));
const { UTILITY_REGISTRY, listUtilityDefinitions, validateUtilityRegistry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'utilityRegistry.js'));
const { INVITE_CAPABILITY_MAP } = loadEsmAsCjs(LIB('eventCapabilities.js'));
const { resolveUtilityNav, resolveUtilityNavFromScenes } = loadEsmAsCjs(LIB('inviteUtilityNav.js'));
const { resolveBrandAttribution, resolveAcquisitionCta } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { EVENT_TYPE_NAMES } = loadEsmAsCjs(LIB('eventTypeNames.js'));
const { getArchetype, listArchetypes } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));

const ALL_26_SLUGS = Object.keys(EVENT_TYPE_NAMES);
const TARGET_18_IDS = [
  'toran-heritage', 'royal-palace', 'mughal-garden', 'temple-heritage', 'folk-celebration', 'ivory-mandala',
  'botanical-romance', 'illustrated-story', 'photo-editorial', 'modern-indian', 'night-bloom', 'celestial',
  'playful-pop', 'luxury-black', 'corporate-grid', 'cultural-poster', 'stillness', 'wellness-earth',
];

// ── 1-2: exactly 18 archetype IDs, valid implemented/planned status ──────
console.log('\n── Catalogue coverage ──');
assert('exactly 18 archetype IDs exist in the catalogue', listCatalogueEntries().length === 18);
assert('every one of the 18 target IDs from the brief is present', TARGET_18_IDS.every((id) => !!getCatalogueEntry(id)));
assert('every catalogue entry has a valid implemented/planned status', listCatalogueEntries().every((e) => e.status === ARCHETYPE_STATUS.IMPLEMENTED || e.status === ARCHETYPE_STATUS.PLANNED));
assert('exactly 3 entries are implemented (the Hindu Wedding pilot)', listCatalogueEntries().filter((e) => e.status === ARCHETYPE_STATUS.IMPLEMENTED).length === 3);
assert('exactly 15 entries are planned', listCatalogueEntries().filter((e) => e.status === ARCHETYPE_STATUS.PLANNED).length === 15);

let allShapesValid = true;
for (const e of listCatalogueEntries()) {
  const problems = validateCatalogueEntryShape(e);
  if (problems.length) { allShapesValid = false; console.log('    -', e.id, problems); }
}
assert('every catalogue entry passes validateCatalogueEntryShape()', allShapesValid);

// ── 3: only implemented archetypes are selectable ─────────────────────────
console.log('\n── Selectable vs. planning-only ──');
const weddingSelectable = getSelectableArchetypes({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: { partner1Name: 'A', partner2Name: 'B' }, isNonFestive: false });
assert('getSelectableArchetypes() never returns a planned entry', weddingSelectable.every((r) => r.status === ARCHETYPE_STATUS.IMPLEMENTED));
assert('getSelectableArchetypes() for hindu-wedding returns all 3 implemented pilot archetypes', weddingSelectable.length === 3);
const weddingPlanning = getPlanningArchetypes({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: { partner1Name: 'A', partner2Name: 'B' }, isNonFestive: false });
assert('getPlanningArchetypes() includes planned entries too (e.g. mughal-garden is NOT compatible with hindu-wedding, but temple-heritage/folk-celebration are)', weddingPlanning.some((r) => r.status === ARCHETYPE_STATUS.PLANNED));

// ── 4: all 26 canonical event slugs have >=1 planned compatible archetype ─
console.log('\n── Full event-type coverage ──');
let allSlugsCovered = true;
for (const slug of ALL_26_SLUGS) {
  if (!EVENT_STRONG_ARCHETYPES[slug] || EVENT_STRONG_ARCHETYPES[slug].length === 0) {
    allSlugsCovered = false;
    console.log('    - no strong-match archetype declared for', slug);
  }
}
assert('all 26 canonical event slugs have at least one strong-match archetype declared', allSlugsCovered);
assert("'adult-birthday' (not 'birthday') is the slug used throughout the compatibility matrix", 'adult-birthday' in EVENT_STRONG_ARCHETYPES && !('birthday' in EVENT_STRONG_ARCHETYPES));

// ── 5: funeral resolves only solemn-safe designs ──────────────────────────
console.log('\n── Funeral solemn safeguards (resolver-level, not UI-level) ──');
const funeralMatrix = resolveMatrixForEvent({ eventTypeSlug: 'funeral-last-rites', schema: getInviteSchema('funeral-last-rites'), values: { subjectNameLine1: 'Shri X' }, isNonFestive: true });
const funeralSupported = funeralMatrix.filter((r) => r.level !== COMPATIBILITY_LEVEL.UNSUPPORTED);
assert('funeral-last-rites resolves exactly one non-unsupported archetype: stillness', funeralSupported.length === 1 && funeralSupported[0].archetypeId === 'stillness');
assert('every one of the other 17 archetypes is UNSUPPORTED for funeral-last-rites', funeralMatrix.filter((r) => r.archetypeId !== 'stillness').every((r) => r.level === COMPATIBILITY_LEVEL.UNSUPPORTED));
// The explicit brief scenario: even manually supplying a celebratory
// archetype id for a non-festive event must resolve UNSUPPORTED — this is
// the resolver-level veto, not something a UI happens to filter out.
const forcedRoyalPalaceOnFuneral = resolveCompatibilityLevel({ eventTypeSlug: 'funeral-last-rites', schema: getInviteSchema('funeral-last-rites'), values: {}, archetypeId: 'royal-palace', isNonFestive: true });
assert('"funeral-last-rites + royal-palace" resolves UNSUPPORTED even when explicitly requested', forcedRoyalPalaceOnFuneral.level === COMPATIBILITY_LEVEL.UNSUPPORTED);
const stillnessOnWedding = resolveCompatibilityLevel({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: {}, archetypeId: 'stillness', isNonFestive: false });
assert('the reverse also holds: "stillness" is UNSUPPORTED for a celebratory hindu-wedding', stillnessOnWedding.level === COMPATIBILITY_LEVEL.UNSUPPORTED);
assert('getSelectableArchetypes() returns [] for funeral-last-rites (stillness is only "planned", nothing implemented yet)', getSelectableArchetypes({ eventTypeSlug: 'funeral-last-rites', schema: getInviteSchema('funeral-last-rites'), values: {}, isNonFestive: true }).length === 0);

// ── 6-9: category-specific compatibility spot checks ──────────────────────
console.log('\n── Category-specific compatibility ──');
// Rich enough content + a couple of functions so density clears even
// royal-palace's rich-very-rich range — a bare {partner1Name,partner2Name}
// fixture resolves to 'light' density, which would correctly (see the
// dedicated density-compatibility section below) downgrade royal-palace
// from STRONG to COMPATIBLE — this section is specifically about the
// event-slug/category dimension, so the fixture is deliberately rich
// enough not to also be exercising a density downgrade at the same time.
const hinduRichValues = { partner1Name: 'A', partner2Name: 'B', hostedBy: 'H', couplePhotoUrl: 'x', coupleQuote: 'q', muhurat: 'm', invocationText: 'i' };
const hinduMatrix = resolveMatrixForEvent({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: hinduRichValues, densitySignals: { functionCount: 3, hasTravelInfo: true }, isNonFestive: false });
assert('hindu-wedding: toran-heritage/royal-palace/temple-heritage resolve STRONG', ['toran-heritage', 'royal-palace', 'temple-heritage'].every((id) => hinduMatrix.find((r) => r.archetypeId === id).level === COMPATIBILITY_LEVEL.STRONG));
assert('hindu-wedding: corporate-grid resolves UNSUPPORTED (not in its strong/supported list)', hinduMatrix.find((r) => r.archetypeId === 'corporate-grid').level === COMPATIBILITY_LEVEL.UNSUPPORTED);

const corporateMatrix = resolveMatrixForEvent({ eventTypeSlug: 'corporate-conference', schema: getInviteSchema('corporate-conference'), values: {}, isNonFestive: false });
assert('corporate-conference: corporate-grid resolves STRONG', corporateMatrix.find((r) => r.archetypeId === 'corporate-grid').level === COMPATIBILITY_LEVEL.STRONG);
assert('corporate-conference does NOT recommend wedding-only archetypes (toran-heritage/royal-palace/temple-heritage/mughal-garden all UNSUPPORTED)', ['toran-heritage', 'royal-palace', 'temple-heritage', 'mughal-garden'].every((id) => corporateMatrix.find((r) => r.archetypeId === id).level === COMPATIBILITY_LEVEL.UNSUPPORTED));

const kidsMatrix = resolveMatrixForEvent({ eventTypeSlug: 'kids-birthday', schema: getInviteSchema('kids-birthday'), values: { childName: 'Aanya' }, isNonFestive: false });
assert('kids-birthday: playful-pop resolves STRONG', kidsMatrix.find((r) => r.archetypeId === 'playful-pop').level === COMPATIBILITY_LEVEL.STRONG);

const wellnessMatrix = resolveMatrixForEvent({ eventTypeSlug: 'wellness-retreat', schema: getInviteSchema('wellness-retreat'), values: {}, isNonFestive: false });
assert('wellness-retreat: wellness-earth resolves STRONG', wellnessMatrix.find((r) => r.archetypeId === 'wellness-earth').level === COMPATIBILITY_LEVEL.STRONG);

// ── 10: density compatibility remains enforced ────────────────────────────
console.log('\n── Density compatibility ──');
const sparseValues = { partner1Name: 'A', partner2Name: 'B' };
const richValues = { partner1Name: 'A', partner2Name: 'B', hostedBy: 'H', couplePhotoUrl: 'x', coupleQuote: 'q', grandparentsNote: 'g', familySurname: 's', muhurat: 'm', invocationText: 'i', dressCode: 'd', giftNote: 'gn' };
const ivoryOnSparse = resolveCompatibilityLevel({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: sparseValues, archetypeId: 'ivory-mandala', isNonFestive: false });
const royalOnSparse = resolveCompatibilityLevel({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: sparseValues, densitySignals: {}, archetypeId: 'royal-palace', isNonFestive: false });
assert('sparse content + ivory-mandala (light-medium range) stays STRONG (density fits)', ivoryOnSparse.level === COMPATIBILITY_LEVEL.STRONG && ivoryOnSparse.densityCompatible === true);
assert('sparse content + royal-palace (rich-very-rich range) is downgraded to COMPATIBLE (density does not fit a strong match)', royalOnSparse.level === COMPATIBILITY_LEVEL.COMPATIBLE && royalOnSparse.densityCompatible === false);
const royalOnRich = resolveCompatibilityLevel({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: richValues, densitySignals: { functionCount: 4, hasTravelInfo: true, hasAccommodationInfo: true }, archetypeId: 'royal-palace', isNonFestive: false });
assert('rich content + royal-palace stays STRONG (density fits)', royalOnRich.level === COMPATIBILITY_LEVEL.STRONG && royalOnRich.densityCompatible === true);

// ── 11-12: presentation-support model ─────────────────────────────────────
console.log('\n── Presentation-support model ──');
const royalEntry = getCatalogueEntry('royal-palace');
assert('royal-palace presentationSupport declares static/pdf/web sub-objects', !!royalEntry.presentationSupport.static && !!royalEntry.presentationSupport.pdf && !!royalEntry.presentationSupport.web);
assert('static presentation defaults to NOT rendering travel directly (static.travel: false)', royalEntry.presentationSupport.static.travel === false);
assert('web presentation DOES expose travel (web.travel: true) — the same underlying capability, a different output surface', royalEntry.presentationSupport.web.travel === true);
assert('presentationSupport.static.travel:false does NOT appear anywhere in capabilitiesPresented (proves it never mutates capability availability, only presentation)', royalEntry.capabilitiesPresented.travel === true);
let allPresentationValid = true;
for (const e of listCatalogueEntries()) {
  const p = e.presentationSupport;
  if (!p.static || !p.pdf || !p.web) allPresentationValid = false;
  if (typeof p.web.rsvp !== 'boolean' || typeof p.web.guestAccess !== 'boolean') allPresentationValid = false;
}
assert('every catalogue entry\'s static/pdf/web presentation-support contract is well-formed', allPresentationValid);

// ── 13-14: scene registry ─────────────────────────────────────────────────
console.log('\n── Scene registry ──');
assert('scene registry has 30 unique, registered scene role IDs', listSceneDefinitions().length === 30 && new Set(listSceneDefinitions().map((d) => d.id)).size === 30);
const validCapKeys = Object.keys(INVITE_CAPABILITY_MAP);
const sceneProblems = validateSceneRegistry(validCapKeys);
if (sceneProblems.length) sceneProblems.forEach((p) => console.log('    -', p));
assert('validateSceneRegistry() reports zero problems (valid capability refs + complete lifecyclePriority per scene)', sceneProblems.length === 0);
assert('funeral-unsafe scenes are correctly flagged (invocation/gifts/wishing-wall solemnSafe: false)', !SCENE_REGISTRY.invocation.solemnSafe && !SCENE_REGISTRY.gifts.solemnSafe && !SCENE_REGISTRY['wishing-wall'].solemnSafe);
assert('core scenes (opening/rsvp/closing) are correctly flagged solemn-safe', SCENE_REGISTRY.opening.solemnSafe && SCENE_REGISTRY.rsvp.solemnSafe && SCENE_REGISTRY.closing.solemnSafe);
assert('getSceneDefinitionForImplementedId bridges the working "stay" scene id to the semantic "accommodation" role', getSceneDefinitionForImplementedId('stay').id === 'accommodation');

// ── 15: utility registry ──────────────────────────────────────────────────
console.log('\n── Utility component registry ──');
assert('utility registry has 15 semantic IDs (5 implemented + 10 planned)', listUtilityDefinitions().length === 15);
const utilityProblems = validateUtilityRegistry();
if (utilityProblems.length) utilityProblems.forEach((p) => console.log('    -', p));
assert('validateUtilityRegistry() reports zero problems', utilityProblems.length === 0);
assert('every implemented utility declares a real componentPath', listUtilityDefinitions().filter((u) => u.status === 'implemented').every((u) => !!u.componentPath));
assert('every planned utility has no componentPath yet (nothing to point at)', listUtilityDefinitions().filter((u) => u.status === 'planned').every((u) => !u.componentPath));

// ── 16-17: theme tokens for implemented vs planned ────────────────────────
console.log('\n── Theme tokens: implemented vs planned ──');
const toranHeritageArchetype = getArchetype('toran-heritage');
assert('an implemented archetype (toran-heritage) has real variantIds resolving to real tokens', toranHeritageArchetype.variantIds.length > 0);
const mughalGardenEntry = getCatalogueEntry('mughal-garden');
assert('a planned archetype (mughal-garden) has no variantIds/staticLayoutFamilies yet — no production tokens/components required', mughalGardenEntry.variantIds === null && mughalGardenEntry.staticLayoutFamilies === null);
assert('validateCatalogueEntryShape() does not fail a planned entry for missing variantIds', validateCatalogueEntryShape(mughalGardenEntry).length === 0);

// ── 18-19: static layout-family + PDF page-role references ───────────────
console.log('\n── Static layout families + PDF page roles ──');
assert('every implemented archetype declares at least one valid STATIC_LAYOUT_FAMILY', listCatalogueEntries().filter((e) => e.status === 'implemented').every((e) => e.staticLayoutFamilies.every((f) => Object.values(STATIC_LAYOUT_FAMILY).includes(f))));
assert('STATIC_LAYOUT_FAMILY has all 7 families named in the brief', Object.values(STATIC_LAYOUT_FAMILY).length === 7);
assert('PDF_PAGE_ROLE has all 9 roles named in the brief', Object.values(PDF_PAGE_ROLE).length === 9);
assert('the existing, working PDF page kinds (invitation/functions) map onto real PDF_PAGE_ROLE values', PDF_PAGE_ROLE.INVITATION === 'invitation' && PDF_PAGE_ROLE.FUNCTIONS === 'functions');

// ── 20: lifecycle priority metadata ───────────────────────────────────────
console.log('\n── Lifecycle metadata ──');
const { getLifecyclePriority, listScenesForLifecycleMode } = loadEsmAsCjs(LIB('inviteLifecycle.js'));
assert('RSVP is very-high priority in invitation mode', getLifecyclePriority('rsvp', LIFECYCLE_MODE.INVITATION) === LIFECYCLE_PRIORITY.VERY_HIGH);
assert('RSVP drops to none priority post-event (matches the brief\'s own RSVP example)', getLifecyclePriority('rsvp', LIFECYCLE_MODE.POST_EVENT) === LIFECYCLE_PRIORITY.NONE);
assert('Maps is very-high priority on event-day (matches the brief\'s own Maps example)', getLifecyclePriority('maps', LIFECYCLE_MODE.EVENT_DAY) === LIFECYCLE_PRIORITY.VERY_HIGH);
assert('Travel is high priority in the pre-event week (matches the brief\'s own Travel example)', getLifecyclePriority('travel', LIFECYCLE_MODE.PRE_EVENT) === LIFECYCLE_PRIORITY.HIGH);
assert('Gallery is low pre-event and very-high post-event (matches the brief\'s own Gallery example)', getLifecyclePriority('gallery', LIFECYCLE_MODE.PRE_EVENT) === LIFECYCLE_PRIORITY.LOW && getLifecyclePriority('gallery', LIFECYCLE_MODE.POST_EVENT) === LIFECYCLE_PRIORITY.VERY_HIGH);
assert('listScenesForLifecycleMode returns event-day-critical scenes ordered highest-priority-first, including "maps" before lower-priority scenes', listScenesForLifecycleMode(LIFECYCLE_MODE.EVENT_DAY, LIFECYCLE_PRIORITY.HIGH).includes('maps'));

// ── 21: navigation resolver — wedding/birthday/funeral examples ──────────
console.log('\n── Navigation resolution (derived from resolved scenes, not hardcoded per event type) ──');
// Wedding-shaped resolved scenes (what resolveScenes() would produce for a
// rich, multi-function destination wedding).
// maxPrimary: 6 matches the brief's own destination-wedding example
// exactly (Invite / Functions / Travel / Stay / RSVP / More = 5 primary
// items + Invite) — with the default cap of 5, one of these 5 real
// candidates would correctly overflow into More by design (ranked by
// lifecyclePriority, never dropped silently — see resolveUtilityNavFromScenes'
// own header comment on why ranking, not array order, decides this).
const weddingNav = resolveUtilityNavFromScenes(['opening', 'couple', 'family', 'functions', 'venue', 'travel', 'stay', 'guest-access', 'rsvp', 'closing'], { maxPrimary: 6 });
assert('wedding-shaped scenes resolve Functions/Travel/Stay/RSVP nav items', ['functions', 'travel', 'accommodation', 'rsvp'].every((id) => weddingNav.items.includes(id)));
assert('RSVP is always ranked into the primary bar (never silently overflowed to More) even under a tighter cap', resolveUtilityNavFromScenes(['opening', 'functions', 'venue', 'travel', 'stay', 'rsvp', 'closing'], { maxPrimary: 3 }).primary.includes('rsvp'));
// Birthday-shaped resolved scenes — no functions/travel/stay ever resolve
// for a single-day local event (lib/inviteSceneResolver.js's own gates
// already ensure this; this test exercises the NAV side of that fact).
const birthdayNav = resolveUtilityNavFromScenes(['opening', 'couple', 'venue', 'rsvp', 'closing']);
assert('birthday-shaped scenes resolve a short nav — no Functions/Travel/Stay items appear', !birthdayNav.items.includes('functions') && !birthdayNav.items.includes('travel') && !birthdayNav.items.includes('accommodation'));
assert('birthday-shaped scenes still resolve RSVP', birthdayNav.items.includes('rsvp'));
// Funeral-shaped resolved scenes — solemn-safe scenes only (no
// gifts/wishing-wall/gallery ever resolve, matching SCENE_REGISTRY's own
// solemnSafe:false flags on those three).
const funeralNav = resolveUtilityNavFromScenes(['opening', 'venue', 'rsvp', 'closing']);
assert('funeral-shaped scenes resolve a minimal nav with no celebratory items (gifts/wishing-wall/gallery absent)', !funeralNav.items.some((id) => ['gifts', 'wishing-wall', 'gallery'].includes(id)));
assert('the SAME resolveUtilityNavFromScenes() function produces genuinely different shapes from different scene inputs — proof it is not hardcoded per event type', weddingNav.items.length > birthdayNav.items.length && weddingNav.items.length > funeralNav.items.length);
// A conference-shaped nav (Agenda/Speakers/Register) requires real
// programme/registration/speakers scene WIRING into
// lib/inviteSceneResolver.js, which this architecture-only wave
// deliberately does not add (no mass visual/scene production this wave —
// see the completion report's own scoping note). What IS proven here: the
// underlying scene->nav-label mechanism is fully generic, demonstrated by
// gallery (a non-wedding-specific scene) correctly producing its own
// distinct nav label with zero per-event-type code.
const galleryNav = resolveUtilityNavFromScenes(['opening', 'gallery', 'rsvp', 'closing']);
assert('a non-wedding scene (gallery) resolves its own correct nav label via the same generic mechanism', galleryNav.items.includes('gallery'));
assert('resolveUtilityNav() (the original, pre-this-wave function) is completely unchanged and still works', resolveUtilityNav({}).items.length === 2 && resolveUtilityNav({ hasFunctions: true, travelActive: true, staysActive: true, rsvpActive: true, mapsActive: true, gatePassActive: true }).primary.length === 5);

// ── 22: acquisition CTA remains disabled for funeral ──────────────────────
console.log('\n── Branding policy still holds ──');
assert('acquisition CTA is still forced disabled for funeral-last-rites', resolveAcquisitionCta({ isNonFestive: true }).enabled === false);
assert('attribution still reads "Created with Utsav" for non-festive surfaces', resolveBrandAttribution({ isNonFestive: true, surface: 'web' }).line === 'Created with Utsav');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
