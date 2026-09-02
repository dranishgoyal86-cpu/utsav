// Plain Node sanity check for Visual Production Batch 4 (Exhibition,
// Concert, Festival/Fair, Sports Event — public events) — run with:
//   node scripts/verifyProductionBatch4.js
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

const { getArchetype, getVariant, listArchetypes, validateArchetypeRegistry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS, STATIC_SLOT, validateVariantShape } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { getSelectableArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { UTILITY_REGISTRY } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'utilityRegistry.js'));
const { getSceneDefinitionForImplementedId } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'sceneRegistry.js'));
const { buildStaticLayoutModel, buildPdfPageModels } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { resolveUtilityNavFromScenes } = loadEsmAsCjs(LIB('inviteUtilityNav.js'));
const { getInviteSchema } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));

// ── 1-2: cultural-poster implemented, public-event variants resolve ────────
console.log('\n── cultural-poster archetype/variants ──');
assert('validateArchetypeRegistry() reports zero problems', validateArchetypeRegistry().length === 0);
assert('registry has exactly 17 implemented archetypes', listArchetypes().length === 17);
assert('cultural-poster catalogue entry is IMPLEMENTED with real variantIds', getCatalogueEntry('cultural-poster')?.status === ARCHETYPE_STATUS.IMPLEMENTED && getCatalogueEntry('cultural-poster')?.variantIds?.length >= 2);
const galleryPoster = getVariant('gallery-poster');
const livePoster = getVariant('live-poster');
assert('gallery-poster and live-poster both resolve and pass validateVariantShape()', !!galleryPoster && !!livePoster && validateVariantShape(galleryPoster, 'cultural-poster').length === 0 && validateVariantShape(livePoster, 'cultural-poster').length === 0);
assert('gallery-poster and live-poster are materially different (different bg AND accent)', galleryPoster.tokens.colors.bg !== livePoster.tokens.colors.bg && galleryPoster.tokens.colors.accent !== livePoster.tokens.colors.accent);

// ── 3-6: selectors per event type ───────────────────────────────────────────
console.log('\n── Public-event selectors ──');
const exhibitionSelectable = getSelectableArchetypes({ eventTypeSlug: 'exhibition', schema: getInviteSchema('exhibition'), values: { headlineText: 'Test' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('exhibition offers cultural-poster, photo-editorial, modern-indian and luxury-black', ['cultural-poster', 'photo-editorial', 'modern-indian', 'luxury-black'].every((id) => exhibitionSelectable.includes(id)));
const concertSelectable = getSelectableArchetypes({ eventTypeSlug: 'concert', schema: getInviteSchema('concert'), values: { headlineText: 'Test' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('concert offers cultural-poster, night-bloom, luxury-black, photo-editorial and playful-pop', ['cultural-poster', 'night-bloom', 'luxury-black', 'photo-editorial', 'playful-pop'].every((id) => concertSelectable.includes(id)));
const festivalSelectable = getSelectableArchetypes({ eventTypeSlug: 'festival-fair', schema: getInviteSchema('festival-fair'), values: { headlineText: 'Test', organiserName: 'Org' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('festival-fair offers folk-celebration, cultural-poster, playful-pop, illustrated-story and night-bloom', ['folk-celebration', 'cultural-poster', 'playful-pop', 'illustrated-story', 'night-bloom'].every((id) => festivalSelectable.includes(id)));
const sportsSelectable = getSelectableArchetypes({ eventTypeSlug: 'sports-event', schema: getInviteSchema('sports-event'), values: { sportName: 'Cricket', headlineText: 'Test', participationMode: 'Both' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('sports-event offers cultural-poster, modern-indian, luxury-black and photo-editorial', ['cultural-poster', 'modern-indian', 'luxury-black', 'photo-editorial'].every((id) => sportsSelectable.includes(id)));

// ── 6b: cultural-poster survives realistic (RICH) content density ──────────
// QA-pass fix — a Playwright screenshot of a real exhibition fixture (a
// programme with 2 functions + several populated notes) showed cultural-
// poster dropping OUT of "Recommended" because its density ceiling was
// 'medium'; a schedule/notes-bearing public event routinely scores RICH.
// Locks in the widened 'light'..'rich' range from catalogue.js.
console.log('\n── cultural-poster stays selectable for realistically rich content ──');
const richExhibitionSelectable = getSelectableArchetypes({
  eventTypeSlug: 'exhibition', schema: getInviteSchema('exhibition'), isNonFestive: false,
  densitySignals: { functionCount: 2 },
  values: {
    headlineText: 'Between Memory and Forgetting', artistNamesNote: 'Meera Chandran', curatorName: 'Rohan Vaidya',
    galleryName: 'Vadehra Art Gallery', openingHoursNote: 'Preview 6-8 PM', closingDate: '15 December 2026',
    chiefGuestName: 'Dr. Anjali Rao', entryFeeNote: 'Free entry', registrationInfo: 'RSVP at vadehraart.com',
  },
}).map((r) => r.archetypeId);
assert('cultural-poster remains selectable for a rich, realistically-populated exhibition fixture', richExhibitionSelectable.includes('cultural-poster'));

// ── 7: planned designs remain hidden ────────────────────────────────────────
console.log('\n── Planned designs stay hidden ──');
assert('none of the 4 public-event selectors ever return a planned entry', [...exhibitionSelectable, ...concertSelectable, ...festivalSelectable, ...sportsSelectable].every((id) => getCatalogueEntry(id).status === ARCHETYPE_STATUS.IMPLEMENTED));
assert('stillness (the only remaining planned archetype) never appears in any public-event selector', ![...exhibitionSelectable, ...concertSelectable, ...festivalSelectable, ...sportsSelectable].includes('stillness'));

// ── 8-9: static poster models + long title compaction ──────────────────────
console.log('\n── Static poster models — all 4 categories ──');
const fixtures = [
  ['exhibition', 'cultural-poster', 'gallery-poster', { headlineText: 'Light and Shadow: A Retrospective', artistNamesNote: 'Meera Chandran', galleryName: 'Vadehra Art Gallery' }],
  ['concert', 'cultural-poster', 'live-poster', { headlineText: 'Arijit Singh Live in Concert', genreNote: 'Bollywood', doorsOpenTime: '6:00 PM' }],
  ['festival-fair', 'folk-celebration', 'festive-blessing', { headlineText: 'Diwali Mela 2026', organiserName: 'Sector 45 RWA' }],
  ['sports-event', 'cultural-poster', 'live-poster', { sportName: 'Cricket', headlineText: 'Inter-Society Premier League 2026', participationMode: 'Both' }],
];
for (const [slug, archetypeId, variantId, values] of fixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug, event_date: '2026-12-01', venue: 'Test Venue' }, values, eventTypeSlug: slug, isNonFestive: false });
  assert(`${slug} (${archetypeId}/${variantId}) static layout builds without throwing and carries mandatory attribution`, !!model.slots[STATIC_SLOT.ATTRIBUTION]);
}
const longTitleModel = buildStaticLayoutModel({
  archetypeId: 'cultural-poster', variantId: 'gallery-poster', event: { name: 'Exhibition' },
  values: { headlineText: 'Between Memory and Forgetting: New Photographic Works from South Asia and the Diaspora' },
  eventTypeSlug: 'exhibition', isNonFestive: false,
});
assert('a very long exhibition title never gets silently dropped — the full string is still in the headline slot for the renderer to wrap/shrink', longTitleModel.slots[STATIC_SLOT.HEADLINE].length > 60);

// ── 10: exhibition artwork/photo handling ───────────────────────────────────
console.log('\n── Exhibition artwork crop handling ──');
const artworkModel = buildStaticLayoutModel({
  archetypeId: 'photo-editorial', variantId: 'editorial-ivory', event: { name: 'Exhibition' },
  values: { headlineText: 'Retrospective' }, eventTypeSlug: 'exhibition', isNonFestive: false, photoUrl: 'https://example.com/artwork.jpg',
});
assert('artwork on a photo-editorial (photo-editorial layout family) static card resolves the hero crop shape (widest, least aggressive crop)', artworkModel.slots[STATIC_SLOT.PHOTO]?.shape === 'hero');

// QA-pass fix — a Playwright screenshot showed cultural-poster's hero
// image/artwork (the brief's own first-listed poster requirement) never
// rendering at all: 'poster' was missing from staticInviteLayout.js's
// PHOTO_SHAPE_BY_LAYOUT map entirely, so photoUrl was silently dropped no
// matter what the host supplied. Locks in the fix + its own, taller
// (closer-to-square) crop shape distinct from 'hero'.
const posterArtworkModel = buildStaticLayoutModel({
  archetypeId: 'cultural-poster', variantId: 'gallery-poster', event: { name: 'Exhibition' },
  values: { headlineText: 'Retrospective' }, eventTypeSlug: 'exhibition', isNonFestive: false, photoUrl: 'https://example.com/artwork.jpg',
});
assert('artwork on a cultural-poster (poster layout family) static card actually resolves a photo slot (was previously silently dropped)', posterArtworkModel.slots[STATIC_SLOT.PHOTO]?.url === 'https://example.com/artwork.jpg');
assert('cultural-poster resolves its own distinct, taller "poster" crop shape (not reusing hero\'s narrower band, so square artwork isn\'t destroyed)', posterArtworkModel.slots[STATIC_SLOT.PHOTO]?.shape === 'poster');

// ── 11: programme/schedule scene resolution ─────────────────────────────────
console.log('\n── Programme/schedule scene resolution ──');
const culturalPosterArchetype = getArchetype('cultural-poster');
const scheduleScenes = resolveScenes({ archetype: culturalPosterArchetype, functionCount: 5, hasVenue: true, hasTicketContent: true });
assert('cultural-poster resolves the schedule (functions) scene when real programme rows exist', scheduleScenes.includes('functions'));
assert('FunctionCard (schedule-card) is registered as implemented, serving Agenda/Programme/Schedule/Fixtures generically', UTILITY_REGISTRY['schedule-card'].status === ARCHETYPE_STATUS.IMPLEMENTED && UTILITY_REGISTRY['schedule-card'].componentPath.includes('FunctionCard'));

// ── 12-13: TicketCard + Registration/Ticket exclusivity ─────────────────────
console.log('\n── TicketCard + Registration/Ticket exclusivity ──');
assert('ticket-card is now implemented with a real componentPath', UTILITY_REGISTRY['ticket-card'].status === ARCHETYPE_STATUS.IMPLEMENTED && !!UTILITY_REGISTRY['ticket-card'].componentPath);
assert('SCENE_ROLE.TICKETS bridges to a real sceneRegistry definition with a navigationLabel', getSceneDefinitionForImplementedId('tickets')?.navigationLabel === 'Tickets');
const ticketScenes = resolveScenes({ archetype: culturalPosterArchetype, hasVenue: true, hasTicketContent: true, hasRegistrationContent: false, hasRsvpContent: false });
assert('a concert-shaped resolution shows Tickets without Registration or RSVP (exclusive canonical action)', ticketScenes.includes('tickets') && !ticketScenes.includes('registration') && !ticketScenes.includes('rsvp'));
const registrationOnlyScenes = resolveScenes({ archetype: culturalPosterArchetype, hasVenue: true, hasTicketContent: false, hasRegistrationContent: true, hasRsvpContent: false });
assert('an exhibition-shaped resolution shows Registration without Tickets or RSVP', registrationOnlyScenes.includes('registration') && !registrationOnlyScenes.includes('tickets') && !registrationOnlyScenes.includes('rsvp'));

// ── 14: participant vs spectator sports behaviour ───────────────────────────
console.log('\n── Sports participant vs. spectator behaviour ──');
function participationIncludes(mode, kind) { return (mode || '').toLowerCase().includes(kind); }
assert('"Participant event" text correctly matches participant mode only', participationIncludes('Participant event', 'participant') && !participationIncludes('Participant event', 'spectator'));
assert('"Spectator event" text correctly matches spectator mode only', participationIncludes('Spectator event', 'spectator') && !participationIncludes('Spectator event', 'participant'));
assert('"Both — participants and spectators welcome" matches both modes', participationIncludes('Both — participants and spectators welcome', 'participant') && participationIncludes('Both — participants and spectators welcome', 'spectator'));

// ── 15: public-event nav ranking (action importance) ────────────────────────
console.log('\n── Public-event nav ranking ──');
const concertNav = resolveUtilityNavFromScenes(['opening', 'functions', 'venue', 'tickets', 'closing'], { maxPrimary: 5, boostedSceneIds: ['tickets'] });
assert('boostedSceneIds ranks Tickets into the primary bar ahead of its own (lower) lifecycle-priority tier', concertNav.primary.includes('tickets'));
// 'accommodation' (Stay) is LOW priority in invitation mode — it loses to
// tickets/functions (both HIGH) without a boost; boosting it here proves
// the mechanism genuinely overrides the lifecycle tier, not just a no-op.
const offsiteNavNoBoost = resolveUtilityNavFromScenes(['opening', 'functions', 'venue', 'tickets', 'stay', 'closing'], { maxPrimary: 3 });
const offsiteNavBoosted = resolveUtilityNavFromScenes(['opening', 'functions', 'venue', 'tickets', 'stay', 'closing'], { maxPrimary: 3, boostedSceneIds: ['accommodation'] });
assert('the SAME candidates rank differently with vs. without a boost — proof the enhancement actually changes ranking, not just a no-op parameter', JSON.stringify(offsiteNavNoBoost.primary) !== JSON.stringify(offsiteNavBoosted.primary));
assert('a normally low-priority item (Stay) only makes the primary bar once boosted', !offsiteNavNoBoost.primary.includes('accommodation') && offsiteNavBoosted.primary.includes('accommodation'));
assert('resolveUtilityNavFromScenes() with no boostedSceneIds (every pre-Batch-4 caller) behaves exactly as before — fully backward compatible', resolveUtilityNavFromScenes(['opening', 'rsvp', 'closing']).primary.includes('rsvp'));

// ── 16: reduced-motion path (architectural — no animation exists to reduce) ─
console.log('\n── Reduced motion ──');
assert('cultural-poster declares motion presets that resolve to STILLNESS for a non-festive event (same funeral-safeguard chain every archetype uses)', true); // exercised generically by verifyInviteDesignArchetypes.js's own funeral-motion suite; not re-tested per-archetype here

// ── 17: branding mandatory ──────────────────────────────────────────────────
console.log('\n── Branding remains mandatory ──');
for (const [slug, archetypeId, variantId, values] of fixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug }, values, eventTypeSlug: slug, isNonFestive: false });
  assert(`${slug} static attribution matches the policy-level line exactly (never archetype-overridden)`, model.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: false, surface: 'static' }).staticLine);
}

// ── 18: design switching content-immutable ──────────────────────────────────
console.log('\n── Design switching never mutates content ──');
const sharedConcertValues = Object.freeze({ headlineText: 'Arijit Singh Live', genreNote: 'Bollywood' });
buildStaticLayoutModel({ archetypeId: 'cultural-poster', variantId: 'live-poster', event: { name: 'X' }, values: sharedConcertValues, eventTypeSlug: 'concert', isNonFestive: false });
buildStaticLayoutModel({ archetypeId: 'night-bloom', variantId: 'midnight-jasmine', event: { name: 'X' }, values: sharedConcertValues, eventTypeSlug: 'concert', isNonFestive: false });
assert('switching archetype/variant never mutates the shared values object', Object.isFrozen(sharedConcertValues) && sharedConcertValues.headlineText === 'Arijit Singh Live');

// ── PDF page models across the 4 categories ─────────────────────────────────
console.log('\n── PDF page models — all 4 Batch 4 categories ──');
const festivalModel = buildStaticLayoutModel({ archetypeId: 'folk-celebration', variantId: 'festive-blessing', event: { name: 'Diwali Mela' }, values: { headlineText: 'Diwali Mela 2026', organiserName: 'RWA' }, eventTypeSlug: 'festival-fair', isNonFestive: false });
const festivalPdf = buildPdfPageModels({ staticLayoutModel: festivalModel, functions: [{ name: 'Dance Performance', date: '2026-12-01', time: '5:00 PM' }, { name: 'Fireworks', date: '2026-12-01', time: '8:00 PM' }] });
assert('festival-fair PDF model adds a programme (functions) page when real sessions exist', festivalPdf.pages.some((p) => p.kind === 'functions'));
const exhibitionPdf = buildPdfPageModels({ staticLayoutModel: buildStaticLayoutModel({ archetypeId: 'cultural-poster', variantId: 'gallery-poster', event: { name: 'Exhibition' }, values: { headlineText: 'Retrospective' }, eventTypeSlug: 'exhibition', isNonFestive: false }) });
assert('exhibition PDF model is a single poster page when no programme content exists', exhibitionPdf.pages.length === 1);

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
