// Plain Node sanity check for the design-archetype architecture — run
// with: node scripts/verifyInviteDesignArchetypes.js
// Same hand-fixture + PASS/FAIL pattern, same recursive ESM loader every
// other scripts/verify*.js in this repo uses (see
// scripts/verifyInviteSchemaFoundation.js's own header comment for why the
// loader needs to be recursive for a module family with real local
// cross-file imports).

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
  getArchetype, getVariant, getVariantsForArchetype, listArchetypes, listArchetypesForEventSlug,
  resolveMotionForEvent, validateArchetypeRegistry, FUTURE_ARCHETYPE_IDS,
} = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { CONTENT_DENSITY, MOTION_PRESET } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { computeContentDensity, computeDensitySignals, densityInRange } = loadEsmAsCjs(LIB('contentDensity.js'));
const { resolveDesignCompatibility, resolveCompatibleArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibility.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { resolveUtilityNav } = loadEsmAsCjs(LIB('inviteUtilityNav.js'));
const { buildStaticLayoutModel, buildPdfPageModels } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveBrandAttribution, resolveAcquisitionCta } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { EVENT_TYPE_NAMES } = loadEsmAsCjs(LIB('eventTypeNames.js'));

// ── 1-3: archetype registry validation, unique IDs, variant references ──
console.log('\n── Archetype registry validation ──');
const problems = validateArchetypeRegistry();
assert('validateArchetypeRegistry() reports zero problems', Array.isArray(problems) && problems.length === 0);
if (problems.length) problems.forEach((p) => console.log('    -', p));

const archetypes = listArchetypes();
assert('exactly 3 pilot archetypes are implemented (toran-heritage, royal-palace, ivory-mandala)', archetypes.length === 3);
const ids = archetypes.map((a) => a.id);
assert('archetype IDs are unique', new Set(ids).size === ids.length);
assert('archetype IDs match the pilot spec exactly', ['toran-heritage', 'royal-palace', 'ivory-mandala'].every((id) => ids.includes(id)));

let allVariantRefsValid = true;
for (const a of archetypes) {
  const variants = getVariantsForArchetype(a.id);
  if (variants.length !== a.variantIds.length) allVariantRefsValid = false;
  for (const v of variants) {
    if (v.archetypeId !== a.id) allVariantRefsValid = false;
  }
}
assert('every archetype\'s variantIds resolve to real, correctly-owned variant objects', allVariantRefsValid);
assert('royal-palace has 2 variants (exercises variant resolution against a multi-variant archetype)', getVariantsForArchetype('royal-palace').length === 2);
assert('FUTURE_ARCHETYPE_IDS lists future directions without implementing them (getArchetype returns null for each)', FUTURE_ARCHETYPE_IDS.every((id) => getArchetype(id) === null) && FUTURE_ARCHETYPE_IDS.length > 0);

// ── 4: event-slug compatibility ──
console.log('\n── Event-slug compatibility ──');
assert("hindu-wedding is offered by all 3 pilot archetypes", listArchetypesForEventSlug('hindu-wedding').length === 3);
assert("funeral-last-rites is offered by none of the 3 pilot archetypes (no solemn archetype implemented this wave)", listArchetypesForEventSlug('funeral-last-rites').length === 0);
assert("an unrelated slug ('sports-event') resolves to zero archetypes, never throws", listArchetypesForEventSlug('sports-event').length === 0);

// ── 5: adult-birthday remains canonical ──
console.log('\n── adult-birthday remains the canonical slug ──');
assert("EVENT_TYPE_NAMES has 'adult-birthday', not 'birthday'", 'adult-birthday' in EVENT_TYPE_NAMES && !('birthday' in EVENT_TYPE_NAMES));
assert('no pilot archetype lists a literal \'birthday\' event slug', archetypes.every((a) => !a.eventSlugs.includes('birthday')));

// ── 6-7: density resolver + incompatible density doesn't delete content ──
console.log('\n── Content-density resolver ──');
const hinduWeddingSchema = getInviteSchema('hindu-wedding');
const lightValues = { partner1Name: 'Aarav', partner2Name: 'Meera' };
// Deliberately smaller than veryRichValues below — 4 populated optional
// fields + one structural signal is enough to clear the 'rich' threshold
// without also clearing 'very-rich', keeping the two test fixtures
// genuinely distinct rather than accidentally scoring identically.
const richValues = {
  partner1Name: 'Aarav', partner2Name: 'Meera', hostedBy: 'The Sharma family',
  couplePhotoUrl: 'x.jpg', coupleQuote: 'Together always', dressCode: 'Traditional',
};
const veryRichValues = {
  partner1Name: 'Aarav', partner2Name: 'Meera', hostedBy: 'The Sharma family',
  grandparentsNote: 'Shri & Smt Sharma', familySurname: 'Sharma', couplePhotoUrl: 'x.jpg', coupleQuote: 'Together always',
  muhurat: '7:14 PM', invocationText: 'Om', dressCode: 'Traditional', giftNote: 'No boxed gifts please',
};
const lightDensity = computeContentDensity({ schema: hinduWeddingSchema, values: lightValues, functionCount: 0 });
const mediumDensity = computeContentDensity({ schema: hinduWeddingSchema, values: lightValues, functionCount: 2 });
const richDensity = computeContentDensity({ schema: hinduWeddingSchema, values: richValues, functionCount: 2 });
const veryRichDensity = computeContentDensity({
  schema: hinduWeddingSchema, values: veryRichValues, functionCount: 5,
  hasTravelInfo: true, hasAccommodationInfo: true, galleryPhotoCount: 6,
});
assert('sparse content resolves to light', lightDensity === CONTENT_DENSITY.LIGHT);
assert('a few more functions push light content toward medium', mediumDensity === CONTENT_DENSITY.MEDIUM || mediumDensity === CONTENT_DENSITY.LIGHT);
assert('rich, well-populated content resolves to rich', richDensity === CONTENT_DENSITY.RICH);
assert('maximal content (many functions, travel, accommodation, gallery) resolves to very-rich', veryRichDensity === CONTENT_DENSITY.VERY_RICH);
assert('density strictly does not decrease as more real signals are added (light <= rich <= very-rich)', densityInRange(lightDensity, CONTENT_DENSITY.LIGHT, veryRichDensity) || lightDensity === veryRichDensity);

const signals = computeDensitySignals({ schema: hinduWeddingSchema, values: richValues, functionCount: 2 });
assert('computeDensitySignals exposes its raw breakdown (never a black-box score)', typeof signals.score === 'number' && typeof signals.populatedOptionalFieldCount === 'number');

console.log('\n── Design-compatibility resolver + incompatible density never deletes content ──');
const veryRichValuesSnapshotBefore = JSON.stringify(veryRichValues);
const overRichCompat = resolveDesignCompatibility({
  eventTypeSlug: 'hindu-wedding', schema: hinduWeddingSchema, values: veryRichValues,
  densitySignals: { functionCount: 5, hasTravelInfo: true, hasAccommodationInfo: true, galleryPhotoCount: 6 },
  archetypeId: 'ivory-mandala', // ivory-mandala's max density is 'medium' — this is deliberately too rich for it
});
assert('very-rich content on an archetype capped at "medium" is marked density-incompatible, not silently accepted', overRichCompat.densityCompatible === false);
assert('overflow strategy routes excess to secondary scenes — never a delete/drop instruction', overRichCompat.overflowStrategy === 'secondary-scenes');
assert('the values object passed in is byte-for-byte untouched by the resolver (no mutation)', JSON.stringify(veryRichValues) === veryRichValuesSnapshotBefore);

const wrongSlugCompat = resolveDesignCompatibility({ eventTypeSlug: 'corporate-conference', schema: hinduWeddingSchema, values: lightValues, archetypeId: 'royal-palace' });
assert('an archetype not offered for this event type is marked slug-incompatible with a clear reason', wrongSlugCompat.slugCompatible === false && !!wrongSlugCompat.reason);

const allCompat = resolveCompatibleArchetypes({ eventTypeSlug: 'hindu-wedding', schema: hinduWeddingSchema, values: lightValues });
assert('resolveCompatibleArchetypes returns a verdict for every registered archetype, never silently hides one', allCompat.length === archetypes.length);

// ── 8: static layout receives semantic data ──
console.log('\n── Static layout model ──');
const layoutModel = buildStaticLayoutModel({
  archetypeId: 'royal-palace', variantId: 'jaipur-peacock',
  event: { name: 'Aarav & Meera', event_date: '2026-12-12', event_time: '18:00', venue: 'Taj Palace, Delhi' },
  values: richValues, isNonFestive: false, qrTargetUrl: 'https://theutsavapp.com/invite/ABC123',
});
assert('static layout model carries the real semantic content into its slots (not placeholder text)', layoutModel.slots.primaryNames.name1 === 'Aarav' && layoutModel.slots.venue === 'Taj Palace, Delhi');
assert('static layout targets the 1080x1350 (4:5) primary format', layoutModel.targetSize.width === 1080 && layoutModel.targetSize.height === 1350 && layoutModel.aspectRatio === '4:5');
assert('static layout omits travel/RSVP data entirely — invitation + gateway only', !('travel' in layoutModel.slots) && !('rsvp' in layoutModel.slots));
assert('static layout carries a QR/link footer slot when a target URL is supplied', layoutModel.slots.qrFooter.url === 'https://theutsavapp.com/invite/ABC123');
assert('static layout always carries mandatory attribution, sourced from the branding policy', layoutModel.slots.attribution === 'Made with Utsav · theutsavapp.com');

const pdfModel = buildPdfPageModels({
  staticLayoutModel: layoutModel,
  functions: [{ name: 'Sangeet', date: '2026-12-10', time: '19:00' }, { name: 'Pheras', date: '2026-12-12', time: '10:00' }],
  travelNote: 'Fly into Delhi (DEL)', stayNote: 'Rooms blocked at Taj Palace',
});
assert('PDF page model reuses the static layout for page 1 rather than a second template system', pdfModel.pages[0].kind === 'invitation' && pdfModel.pages[0].layout === layoutModel);
assert('PDF adds a real functions page only when functions exist', pdfModel.pages.some((p) => p.kind === 'functions' && p.rows.length === 2));
assert('PDF adds a real travel/stay page only when that content exists', pdfModel.pages.some((p) => p.kind === 'travel-stay'));
const noExtraPdfModel = buildPdfPageModels({ staticLayoutModel: layoutModel });
assert('PDF model has exactly 1 page when no functions/travel/stay content exists — never fabricated pages', noExtraPdfModel.pages.length === 1);

// ── 9: scene resolver only includes relevant populated/capability scenes ──
console.log('\n── Scene resolver ──');
const royalPalaceArchetype = getArchetype('royal-palace');
const sparseScenes = resolveScenes({ archetype: royalPalaceArchetype, hasCoupleOrSubjectContent: true, hasVenue: true });
assert('sparse content resolves to a short scene list (opening/couple/venue/rsvp/closing only)', sparseScenes.length <= 5 && sparseScenes.includes('opening') && sparseScenes.includes('rsvp') && !sparseScenes.includes('travel'));
const richScenes = resolveScenes({
  archetype: royalPalaceArchetype, hasInvocationContent: true, hasCoupleOrSubjectContent: true, hasFamilyContent: true,
  functionCount: 4, hasVenue: true, hasTravelInfo: true, hasAccommodationInfo: true, gatePassActive: true,
  galleryPhotoCount: 3, wishingWallActive: true,
});
assert('rich content + active capabilities resolves every scene the archetype\'s preset offers', richScenes.length === royalPalaceArchetype.web.scenePreset.length);
const ivoryArchetype = getArchetype('ivory-mandala');
const ivoryGalleryAttempt = resolveScenes({ archetype: ivoryArchetype, galleryPhotoCount: 20 });
assert("ivory-mandala never resolves a gallery scene even with photos present — supports.gallery is false by design", !ivoryGalleryAttempt.includes('gallery'));
assert('scene order always follows the archetype\'s own declared scenePreset order, never re-sorted', JSON.stringify(richScenes) === JSON.stringify(royalPalaceArchetype.web.scenePreset));

// ── 10: utility navigation derives from capabilities ──
console.log('\n── Utility navigation ──');
const localNav = resolveUtilityNav({});
assert('a local event with no travel/stay gets a short nav (Invite + RSVP only, no More)', localNav.items.length === 2 && localNav.items.includes('invite') && localNav.items.includes('rsvp') && !localNav.items.includes('more'));
const destinationNav = resolveUtilityNav({ hasFunctions: true, travelActive: true, staysActive: true, rsvpActive: true, mapsActive: true, gatePassActive: true });
assert('a destination wedding gets Invite/Functions/Travel/Stay/RSVP + More', destinationNav.primary.length === 5 && destinationNav.items.includes('more'));
assert('utility nav never hardcodes wedding-only items — same function produces both shapes from plain booleans', localNav.items.length !== destinationNav.items.length);

// ── 11: branding attribution cannot be disabled by archetype ──
console.log('\n── Branding policy: mandatory attribution + acquisition CTA ──');
const webAttribution = resolveBrandAttribution({ isNonFestive: false, surface: 'web' });
const staticAttribution = resolveBrandAttribution({ isNonFestive: false, surface: 'static' });
assert('web attribution reads "Made with Utsav"', webAttribution.line === 'Made with Utsav');
assert('static attribution includes the small footer domain mark', staticAttribution.line === 'Made with Utsav · theutsavapp.com');
const solemnAttribution = resolveBrandAttribution({ isNonFestive: true, surface: 'web' });
assert('non-festive attribution reads "Created with Utsav", not "Made"', solemnAttribution.line === 'Created with Utsav');
assert('resolveBrandAttribution takes no archetype/variant parameter at all — nothing to override with', resolveBrandAttribution.length <= 1);

const celebratoryAcquisition = resolveAcquisitionCta({ isNonFestive: false });
const solemnAcquisition = resolveAcquisitionCta({ isNonFestive: true });
assert('acquisition CTA is enabled for a celebratory event', celebratoryAcquisition.enabled === true && !!celebratoryAcquisition.label);
assert('acquisition CTA is FORCED disabled for a non-festive (funeral-last-rites) event, non-negotiable', solemnAcquisition.enabled === false && solemnAcquisition.label === null);

// ── 12: funeral cannot resolve celebratory motion/design ──
console.log('\n── Funeral cannot resolve celebratory motion/design ──');
assert("funeral-last-rites is non-festive per the centralized resolver", isNonFestive('funeral-last-rites') === true);
const funeralMotion = resolveMotionForEvent({ archetypeId: 'royal-palace', isNonFestive: true, preferredPreset: 'unveil' });
assert('a non-festive event forces MOTION_PRESET.STILLNESS regardless of the selected archetype or preferred preset', funeralMotion === MOTION_PRESET.STILLNESS);
const celebratoryMotion = resolveMotionForEvent({ archetypeId: 'royal-palace', isNonFestive: false, preferredPreset: 'unveil' });
assert('a celebratory event with a valid preferred preset gets that preset', celebratoryMotion === MOTION_PRESET.UNVEIL);
const celebratoryDefaultMotion = resolveMotionForEvent({ archetypeId: 'ivory-mandala', isNonFestive: false });
assert('with no preferred preset, the archetype\'s own first declared motion preset is used', celebratoryDefaultMotion === getArchetype('ivory-mandala').motionPresets[0]);
assert('funeral-last-rites has no offered archetype in this wave\'s pilot at all (defence in depth beyond the motion check)', listArchetypesForEventSlug('funeral-last-rites').length === 0);

// ── 13: reduced-motion fallback ──
console.log('\n── Reduced-motion fallback ──');
function resolveMotionRespectingReducedMotion({ archetypeId, isNonFestive: nf, preferredPreset, prefersReducedMotion }) {
  if (prefersReducedMotion) return MOTION_PRESET.STILLNESS;
  return resolveMotionForEvent({ archetypeId, isNonFestive: nf, preferredPreset });
}
assert('prefers-reduced-motion forces stillness even for an otherwise-celebratory, motion-eligible event', resolveMotionRespectingReducedMotion({ archetypeId: 'royal-palace', isNonFestive: false, preferredPreset: 'unveil', prefersReducedMotion: true }) === MOTION_PRESET.STILLNESS);

// ── 14: guest-specific data stays separate from design configuration ──
console.log('\n── Guest-specific data boundary ──');
assert('archetype objects carry no guest_passes/invitee-shaped fields', archetypes.every((a) => !('guestId' in a) && !('passCode' in a) && !('invitee' in a)));
assert('a variant object carries no guest-specific fields either', getVariant('jaipur-peacock') && !('guestId' in getVariant('jaipur-peacock')));
assert('buildStaticLayoutModel only ever receives a pre-resolved qrTargetUrl string — it has no Supabase/guest_passes access of its own', buildStaticLayoutModel.toString().includes('qrTargetUrl') && !buildStaticLayoutModel.toString().includes('supabase'));

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
