// Plain Node sanity check for Visual Production Batch 1 (Hindu Wedding,
// Engagement, Nikah, Kids Birthday) — run with:
//   node scripts/verifyProductionBatch1.js
// Same hand-fixture + PASS/FAIL pattern, same recursive ESM loader every
// other scripts/verify*.js in this repo uses. This script is specific to
// THIS wave's own new surface area (production archetypes/variants, the
// theme-pack mechanism, religious-sensitivity safeguards, static/PDF photo
// handling, utility-card additions, selector production-safety) — the
// pre-existing verifyInviteDesignArchetypes.js / verifyDesignCompatibility
// Matrix.js / verifyInviteSchemaFoundation.js scripts remain the source of
// truth for the architecture this wave builds on, and were re-run
// (unchanged in substance, only their hardcoded counts updated to reflect
// the newly-implemented archetypes) as part of this same pass.

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

const { getArchetype, getVariant, getVariantsForArchetype, listArchetypes, validateArchetypeRegistry, FUTURE_ARCHETYPE_IDS } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS, COMPATIBILITY_LEVEL, STATIC_SLOT, validateArchetypeShape, validateVariantShape } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { CATALOGUE, listCatalogueEntries, getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { getSelectableArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { UTILITY_REGISTRY, listUtilityDefinitions } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'utilityRegistry.js'));
const { getThemePack, listThemePacks, resolveThemePackForPartyTheme } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'themePacks.js'));
const { buildStaticLayoutModel, buildPdfPageModels, buildPdfHtml } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));

const NEW_ARCHETYPE_IDS = ['botanical-romance', 'photo-editorial', 'mughal-garden', 'night-bloom', 'playful-pop', 'illustrated-story', 'celestial'];

// ── 1: new archetypes have complete production token sets ──────────────────
console.log('\n── New archetypes have complete token sets ──');
let allTokensComplete = true;
for (const archetypeId of NEW_ARCHETYPE_IDS) {
  const archetype = getArchetype(archetypeId);
  if (!archetype) { allTokensComplete = false; console.log('    - missing archetype', archetypeId); continue; }
  for (const variantId of archetype.variantIds) {
    const variant = getVariant(variantId);
    const problems = validateVariantShape(variant, archetypeId);
    if (problems.length) { allTokensComplete = false; console.log('    -', variantId, problems); }
    if (!variant.tokens?.colors || !variant.tokens?.fonts) { allTokensComplete = false; console.log('    -', variantId, 'missing colors/fonts'); }
  }
}
assert('every new archetype\'s variants have a complete, valid token set', allTokensComplete);

// ── 2-3: every implemented variant belongs to a valid archetype; all resolve ──
console.log('\n── Variant/archetype resolution ──');
assert('validateArchetypeRegistry() reports zero problems (no orphaned/mismatched variants)', validateArchetypeRegistry().length === 0);
// Batch 2 added 5 more implemented archetypes on top of Batch 1's 10.
assert('registry now has exactly 16 implemented archetypes', listArchetypes().length === 16); // Batch 3 added wellness-earth
let allVariantsResolve = true;
for (const a of listArchetypes()) {
  for (const vId of a.variantIds) {
    if (!getVariant(vId)) allVariantsResolve = false;
  }
}
assert('every archetype\'s declared variantIds resolve to a real variant', allVariantsResolve);

// ── 4: selector returns only implemented, compatible designs ───────────────
console.log('\n── Selector production-safety ──');
const weddingSelectable = getSelectableArchetypes({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: { partner1Name: 'A', partner2Name: 'B' }, isNonFestive: false });
assert('getSelectableArchetypes() never returns a planned entry', weddingSelectable.every((r) => r.status === ARCHETYPE_STATUS.IMPLEMENTED));
assert('getSelectableArchetypes() never returns an unsupported-level entry', weddingSelectable.every((r) => r.level !== COMPATIBILITY_LEVEL.UNSUPPORTED));

// ── 5: Hindu Wedding / Engagement / Nikah / Kids Birthday each receive
//      appropriate production options ──────────────────────────────────────
console.log('\n── Per-event-type production options ──');
const huWedding = getSelectableArchetypes({ eventTypeSlug: 'hindu-wedding', schema: getInviteSchema('hindu-wedding'), values: {}, isNonFestive: false }).map((r) => r.archetypeId);
assert('hindu-wedding offers heritage (toran-heritage), regal (royal-palace), minimal (ivory-mandala) and romantic (botanical-romance) directions', ['toran-heritage', 'royal-palace', 'ivory-mandala', 'botanical-romance'].every((id) => huWedding.includes(id)));

const engagement = getSelectableArchetypes({ eventTypeSlug: 'engagement', schema: getInviteSchema('engagement'), values: {}, isNonFestive: false }).map((r) => r.archetypeId);
assert('engagement offers royal-palace, botanical-romance and photo-editorial', ['royal-palace', 'botanical-romance', 'photo-editorial'].every((id) => engagement.includes(id)));

const nikah = getSelectableArchetypes({ eventTypeSlug: 'nikah', schema: getInviteSchema('nikah'), values: {}, isNonFestive: false }).map((r) => r.archetypeId);
assert('nikah offers mughal-garden as its primary rich archetype', nikah.includes('mughal-garden'));
assert('nikah offers night-bloom and botanical-romance as additional contemporary options', ['night-bloom', 'botanical-romance'].every((id) => nikah.includes(id)));
assert('nikah does NOT offer ivory-mandala — deliberately scoped out this wave (see completion report)', !nikah.includes('ivory-mandala'));

const kidsBirthday = getSelectableArchetypes({ eventTypeSlug: 'kids-birthday', schema: getInviteSchema('kids-birthday'), values: { childName: 'Aanya' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('kids-birthday offers playful-pop, illustrated-story and celestial', ['playful-pop', 'illustrated-story', 'celestial'].every((id) => kidsBirthday.includes(id)));

const playfulPop = getArchetype('playful-pop');
assert('playful-pop has at least 2 materially different variants (confetti-pop, comic-burst)', playfulPop.variantIds.length >= 2 && new Set(playfulPop.variantIds.map((id) => getVariant(id).tokens.colors.accent)).size === playfulPop.variantIds.length);

// ── 6: Kids Birthday theme packs resolve correctly ──────────────────────────
console.log('\n── Kids-birthday theme packs ──');
assert('exactly 5 theme packs exist (Space, Jungle, Fairytale, Sports, Generic Celebration)', listThemePacks().length === 5);
assert('"space adventure" resolves to the space pack', resolveThemePackForPartyTheme('Space Adventure').id === 'space');
assert('"jungle safari" resolves to the jungle pack', resolveThemePackForPartyTheme('Jungle Safari').id === 'jungle');
assert('"princess castle" resolves to the fairytale pack', resolveThemePackForPartyTheme('Princess Castle').id === 'fairytale');
assert('"cricket team" resolves to the sports pack', resolveThemePackForPartyTheme('Cricket Team').id === 'sports');
// ── 7: unknown/custom theme falls back to Generic Celebration ──────────────
assert('an unrecognized custom theme falls back to generic-celebration', resolveThemePackForPartyTheme('Purple Dinosaurs From Mars').id === 'generic-celebration');
assert('an empty/missing theme falls back to generic-celebration', resolveThemePackForPartyTheme('').id === 'generic-celebration' && resolveThemePackForPartyTheme(undefined).id === 'generic-celebration');
assert('getThemePack() falls back for an unknown id rather than returning undefined', getThemePack('nonexistent-pack-id').id === 'generic-celebration');

// ── 8: no trademarked/copyrighted character dependency ─────────────────────
console.log('\n── No copyrighted-character dependency ──');
const suspiciousTerms = ['disney', 'marvel', 'pixar', 'mickey', 'elsa', 'spiderman', 'spider-man', 'batman', 'pokemon', 'barbie', 'hello kitty'];
const themePackSource = fs.readFileSync(LIB('inviteDesignArchetypes', 'themePacks.js'), 'utf8').toLowerCase();
assert('themePacks.js contains no known trademarked/copyrighted character or brand names', suspiciousTerms.every((term) => !themePackSource.includes(term)));
assert('theme-pack icons are plain emoji only (no image/asset URLs, no external dependency)', listThemePacks().every((p) => p.icons.every((icon) => icon.length <= 4 && !icon.startsWith('http'))));

// ── 9-10: religious content not injected by Nikah/Hindu renderers ──────────
console.log('\n── Religious-sensitivity safeguards ──');
const nikahSchema = getInviteSchema('nikah');
const mughalGardenModel = buildStaticLayoutModel({ archetypeId: 'mughal-garden', variantId: 'emerald-mehfil', event: { name: 'Test Nikah', event_date: '2026-12-01', venue: 'Test Venue' }, values: {}, isNonFestive: false });
assert('a Nikah static layout with no host-supplied invocation text has an empty symbol slot (no auto-inserted Bismillah/Quran verse)', mughalGardenModel.slots[STATIC_SLOT.SYMBOL] === null);
const mughalGardenModelWithInvocation = buildStaticLayoutModel({ archetypeId: 'mughal-garden', variantId: 'emerald-mehfil', event: { name: 'Test Nikah' }, values: { invocationText: 'Bismillah ir-Rahman ir-Rahim' }, isNonFestive: false });
assert('a Nikah static layout DOES render the symbol slot when the host explicitly supplied invocation text', mughalGardenModelWithInvocation.slots[STATIC_SLOT.SYMBOL]?.text === 'Bismillah ir-Rahman ir-Rahim');
assert('the nikah schema never marks invocation/Quranic/Bismillah fields as REQUIRED (all host-optional)', nikahSchema.sections.flatMap((s) => s.fields).filter((f) => ['invocationText', 'quranicVerseText', 'bismillahText', 'duaText'].includes(f.key)).every((f) => f.status !== 'required'));

const hinduWeddingModel = buildStaticLayoutModel({ archetypeId: 'toran-heritage', variantId: 'marigold-garland', event: { name: 'Test Wedding' }, values: {}, isNonFestive: false });
assert('a Hindu Wedding static layout with no host-supplied invocation text has an empty symbol slot (no auto-inserted shloka)', hinduWeddingModel.slots[STATIC_SLOT.SYMBOL] === null);

const mughalGardenArchetype = getArchetype('mughal-garden');
assert('mughal-garden does not declare eventSlugs beyond nikah (no religious content inferred for other traditions)', mughalGardenArchetype.eventSlugs.length === 1 && mughalGardenArchetype.eventSlugs[0] === 'nikah');

// ── 11: static card model works across all four categories ─────────────────
console.log('\n── Static card model — all 4 event categories ──');
const kidsModel = buildStaticLayoutModel({ archetypeId: 'playful-pop', variantId: 'confetti-pop', event: { name: 'Aanya turns 5', event_date: '2026-11-10', venue: 'Home' }, values: { childName: 'Aanya', turningAge: '5' }, isNonFestive: false });
assert('kids-birthday static layout carries the child\'s name into primaryNames', kidsModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name === 'Aanya');
const engagementModel = buildStaticLayoutModel({ archetypeId: 'royal-palace', variantId: 'jaipur-peacock', event: { name: 'Test Engagement' }, values: { partner1Name: 'Rhea', partner2Name: 'Kabir' }, isNonFestive: false });
assert('engagement static layout carries both partner names', engagementModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name1 === 'Rhea' && engagementModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name2 === 'Kabir');
assert('every static layout carries mandatory attribution regardless of event category', [kidsModel, engagementModel, mughalGardenModel, hinduWeddingModel].every((m) => !!m.slots[STATIC_SLOT.ATTRIBUTION]));

// Photo-crop shape resolution — split-photo -> circle, photo-editorial -> hero.
const botanicalWithPhoto = buildStaticLayoutModel({ archetypeId: 'botanical-romance', variantId: 'rose-garden', event: {}, values: {}, isNonFestive: false, photoUrl: 'https://example.com/photo.jpg' });
assert('a photo on a split-photo layout (botanical-romance) resolves a circle crop shape', botanicalWithPhoto.slots[STATIC_SLOT.PHOTO]?.shape === 'circle');
const editorialWithPhoto = buildStaticLayoutModel({ archetypeId: 'photo-editorial', variantId: 'editorial-ivory', event: {}, values: {}, isNonFestive: false, photoUrl: 'https://example.com/photo.jpg' });
assert('a photo on a photo-editorial layout resolves a hero crop shape', editorialWithPhoto.slots[STATIC_SLOT.PHOTO]?.shape === 'hero');
const toranWithPhoto = buildStaticLayoutModel({ archetypeId: 'toran-heritage', variantId: 'marigold-garland', event: {}, values: {}, isNonFestive: false, photoUrl: 'https://example.com/photo.jpg' });
assert('a photo on a layout with no photo treatment (toran-heritage/centered-ceremonial) is silently omitted, never force-cropped', toranWithPhoto.slots[STATIC_SLOT.PHOTO] === null);

// ── 12: PDF page models work across all 4 categories ───────────────────────
console.log('\n── PDF page models + HTML rendering ──');
const kidsPdf = buildPdfPageModels({ staticLayoutModel: kidsModel });
assert('kids-birthday PDF model has exactly 1 page when no functions/travel/stay exist (usually one page, per the brief)', kidsPdf.pages.length === 1);
const weddingPdf = buildPdfPageModels({ staticLayoutModel: hinduWeddingModel, functions: [{ name: 'Mehendi', date: '2026-12-01', time: '4pm' }], travelNote: 'Outstation details available.' });
assert('hindu-wedding PDF model adds functions + travel-stay pages when that content exists', weddingPdf.pages.map((p) => p.kind).join(',') === 'invitation,functions,travel-stay');
const nikahPdf = buildPdfPageModels({ staticLayoutModel: mughalGardenModel });
assert('nikah PDF model is a single invitation page when no Walima/functions content exists (optional Walima page only added when real content exists)', nikahPdf.pages.length === 1);
const html = buildPdfHtml({ pdfPageModels: weddingPdf, tokens: getVariant('marigold-garland').tokens });
assert('buildPdfHtml() produces a non-empty HTML document reusing the same page models (no second template system)', typeof html === 'string' && html.includes('<html>') && html.includes('page-break-after'));
assert('buildPdfHtml() escapes host-supplied text (no raw HTML injection from event content)', buildPdfHtml({ pdfPageModels: buildPdfPageModels({ staticLayoutModel: buildStaticLayoutModel({ archetypeId: 'toran-heritage', variantId: 'marigold-garland', event: { venue: '<script>alert(1)</script>' }, values: {}, isNonFestive: false }) }), tokens: getVariant('marigold-garland').tokens }).includes('&lt;script&gt;'));

// ── 13: web scenes omit unavailable modules ─────────────────────────────────
console.log('\n── Web scene composition ──');
const celestialArchetype = getArchetype('celestial');
const celestialScenes = resolveScenes({ archetype: celestialArchetype, hasCoupleOrSubjectContent: false, hasHonoureeContent: true, hasVenue: true, hasTravelInfo: true, gatePassActive: true });
assert('celestial (gatePass:false, travel not in supports) never resolves guest-access even when gatePassActive is true', !celestialScenes.includes('guest-access'));
assert('celestial resolves honouree when hasHonoureeContent is true (a solo-subject scene, distinct from couple)', celestialScenes.includes('honouree'));

// ── 14: GatePass/DressCode/WishingWall utilities obey capability/content ───
console.log('\n── Utility card capability/content gating ──');
assert('gate-pass-card, dress-code-card and wishing-wall-card are now implemented with real componentPaths', ['gate-pass-card', 'dress-code-card', 'wishing-wall-card'].every((id) => UTILITY_REGISTRY[id].status === ARCHETYPE_STATUS.IMPLEMENTED && !!UTILITY_REGISTRY[id].componentPath));
const dressCodeScenes = resolveScenes({ archetype: getArchetype('royal-palace'), hasCoupleOrSubjectContent: true, hasDressCodeContent: false });
assert('dress-code scene does not resolve when there is no dress-code content, even on an archetype whose preset offers it', !dressCodeScenes.includes('dress-code'));
const dressCodeScenesWithContent = resolveScenes({ archetype: getArchetype('royal-palace'), hasCoupleOrSubjectContent: true, hasDressCodeContent: true });
assert('dress-code scene resolves once real dress-code content exists', dressCodeScenesWithContent.includes('dress-code'));

// ── 15: design switching does not mutate event/schema content ──────────────
console.log('\n── Design switching never mutates content ──');
const sharedValues = Object.freeze({ partner1Name: 'A', partner2Name: 'B', hostedBy: 'Family' });
const modelA = buildStaticLayoutModel({ archetypeId: 'toran-heritage', variantId: 'marigold-garland', event: { name: 'X' }, values: sharedValues, isNonFestive: false });
const modelB = buildStaticLayoutModel({ archetypeId: 'royal-palace', variantId: 'jaipur-peacock', event: { name: 'X' }, values: sharedValues, isNonFestive: false });
assert('switching archetype/variant never mutates the shared values object passed in', Object.isFrozen(sharedValues) && sharedValues.partner1Name === 'A');
assert('both designs render the same underlying content (names), only the presentation differs', modelA.slots[STATIC_SLOT.PRIMARY_NAMES].name1 === modelB.slots[STATIC_SLOT.PRIMARY_NAMES].name1);

// ── 16: legacy invite / compatibility-matrix / schema tests remain green ───
// (run as separate scripts in the same pass — see the completion report for
// their own pass/fail counts; this script does not re-embed them to avoid
// a second, drifting copy of their assertions.)
console.log('\n── Cross-suite note ──');
console.log('  (legacy invite / compatibility-matrix / schema-foundation suites run separately — see completion report)');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
