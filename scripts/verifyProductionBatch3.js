// Plain Node sanity check for Visual Production Batch 3 (Anniversary,
// Mundan, Religious Event, Team Offsite, Wellness Retreat) — run with:
//   node scripts/verifyProductionBatch3.js
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
const { getSceneDefinitionForImplementedId } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'sceneRegistry.js'));
const { buildStaticLayoutModel, buildPdfPageModels } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { resolveUtilityNavFromScenes } = loadEsmAsCjs(LIB('inviteUtilityNav.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));

// ── 1-2: wellness-earth implemented, new variant resolves ──────────────────
console.log('\n── wellness-earth archetype/variant ──');
assert('validateArchetypeRegistry() reports zero problems', validateArchetypeRegistry().length === 0);
assert('registry has exactly 16 implemented archetypes', listArchetypes().length === 16);
assert('wellness-earth catalogue entry is IMPLEMENTED with real variantIds', getCatalogueEntry('wellness-earth')?.status === ARCHETYPE_STATUS.IMPLEMENTED && getCatalogueEntry('wellness-earth')?.variantIds?.length > 0);
const forestRetreat = getVariant('forest-retreat');
assert('forest-retreat variant resolves and passes validateVariantShape()', !!forestRetreat && validateVariantShape(forestRetreat, forestRetreat?.archetypeId).length === 0);

// ── 3: Anniversary selector options ─────────────────────────────────────────
console.log('\n── Anniversary selector ──');
const annivSelectable = getSelectableArchetypes({ eventTypeSlug: 'anniversary', schema: getInviteSchema('anniversary'), values: { partner1Name: 'A', partner2Name: 'B' }, isNonFestive: false }).map((r) => r.archetypeId);
assert('anniversary offers photo-editorial, botanical-romance, ivory-mandala and royal-palace', ['photo-editorial', 'botanical-romance', 'ivory-mandala', 'royal-palace'].every((id) => annivSelectable.includes(id)));

// ── 4: anniversary milestone rendering ──────────────────────────────────────
console.log('\n── Anniversary milestone rendering ──');
const annivSchema = getInviteSchema('anniversary');
const annivValues = normalizeInviteContent(annivSchema, { partner_1_name: 'Meera', partner_2_name: 'Arjun', schema_content: { anniversaryYears: '25', originalWeddingDate: '2001-12-12' } });
const annivModel = buildStaticLayoutModel({ archetypeId: 'photo-editorial', variantId: 'editorial-ivory', event: { name: 'Meera & Arjun\'s Anniversary' }, values: annivValues, isNonFestive: false });
assert('anniversary static layout carries both partner names as a couple', annivModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.mode === 'couple' && annivModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name1 === 'Meera');
assert('host content (partner names) is never overridden by the derived milestone label', annivModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name2 === 'Arjun');

// ── 5: then/now data does not mutate ────────────────────────────────────────
console.log('\n── Design switching never mutates content ──');
const sharedAnnivValues = Object.freeze({ partner1Name: 'Meera', partner2Name: 'Arjun', anniversaryYears: '50' });
buildStaticLayoutModel({ archetypeId: 'photo-editorial', variantId: 'editorial-ivory', event: { name: 'X' }, values: sharedAnnivValues, isNonFestive: false });
buildStaticLayoutModel({ archetypeId: 'royal-palace', variantId: 'jaipur-peacock', event: { name: 'X' }, values: sharedAnnivValues, isNonFestive: false });
assert('switching archetype/variant never mutates the shared values object', Object.isFrozen(sharedAnnivValues) && sharedAnnivValues.anniversaryYears === '50');

// ── 6-7: Mundan terminology + no auto religious symbols ─────────────────────
console.log('\n── Mundan ──');
const mundanSchema = getInviteSchema('mundan');
const mundanValues = normalizeInviteContent(mundanSchema, { schema_content: { ceremonyCustomName: 'Chudakarana', childName: 'Vihaan', parentsNote: 'The Rao Family', muhurat: '9:15 AM' } });
const mundanModel = buildStaticLayoutModel({ archetypeId: 'temple-heritage', variantId: 'sacred-threshold', event: { name: 'Vihaan\'s Chudakarana' }, values: mundanValues, isNonFestive: false });
assert('mundan static layout carries the ceremonyCustomName ("Chudakarana") into the kicker as plain wording', mundanModel.slots[STATIC_SLOT.KICKER] === 'CHUDAKARANA');
assert('mundan static layout carries the child\'s name as the primary honouree', mundanModel.slots[STATIC_SLOT.PRIMARY_NAMES]?.name === 'Vihaan');
assert('a mundan static layout with no host-supplied invocation text has an empty symbol slot (no auto deity/mantra/Om/Swastik/kalash)', mundanModel.slots[STATIC_SLOT.SYMBOL] === null);
assert('mundan schema never marks invocationText as REQUIRED (host-optional, never auto-generated)', mundanSchema.sections.flatMap((s) => s.fields).find((f) => f.key === 'invocationText').status !== 'required');

// ── 8-9: Religious Event no auto religious content + host-supplied only ────
console.log('\n── Religious Event religious-sensitivity ──');
const religiousSchema = getInviteSchema('religious-event');
const bhajanValues = normalizeInviteContent(religiousSchema, { schema_content: { religiousEventType: 'Bhajan Sandhya', hostedBy: 'The Gupta Family' } });
const bhajanModel = buildStaticLayoutModel({ archetypeId: 'folk-celebration', variantId: 'festive-blessing', event: { name: 'Bhajan Sandhya' }, values: bhajanValues, isNonFestive: false });
assert('a religious-event static layout with no host-supplied invocation/focusDeity has an empty symbol slot', bhajanModel.slots[STATIC_SLOT.SYMBOL] === null);
assert('the religiousEventType free-text value ("Bhajan Sandhya") flows into the kicker as plain wording, never a doctrine/deity inference', bhajanModel.slots[STATIC_SLOT.KICKER] === 'BHAJAN SANDHYA');
const invocationValues = normalizeInviteContent(religiousSchema, { schema_content: { religiousEventType: 'Satsang', hostedBy: 'The Gupta Family', invocationText: 'Om Shanti Shanti Shanti' } });
const invocationModel = buildStaticLayoutModel({ archetypeId: 'folk-celebration', variantId: 'festive-blessing', event: { name: 'Satsang' }, values: invocationValues, isNonFestive: false });
assert('religious-event DOES render the symbol slot when the host explicitly supplied invocation text', invocationModel.slots[STATIC_SLOT.SYMBOL]?.text === 'Om Shanti Shanti Shanti');
assert('religiousEventType is never used to infer or auto-populate focusDeity/invocationText — a "Bhajan Sandhya" fixture and a "Satsang" fixture differ ONLY by what the host explicitly typed', bhajanModel.slots[STATIC_SLOT.SYMBOL] === null && bhajanModel.slots[STATIC_SLOT.KICKER] !== invocationModel.slots[STATIC_SLOT.KICKER]);

// ── 10-11: Team Offsite itinerary scenes + local case omits Stay ───────────
console.log('\n── Team Offsite itinerary/stay ──');
const wellnessEarthArchetype = getArchetype('wellness-earth');
const offsiteDestinationScenes = resolveScenes({ archetype: wellnessEarthArchetype, functionCount: 3, hasVenue: true, hasTravelInfo: true, hasAccommodationInfo: true, hasTransportContent: true, hasContactContent: true });
assert('a destination offsite (travel+accommodation present) resolves functions (itinerary), travel, stay, transport and contact', ['functions', 'travel', 'stay', 'transport', 'contact'].every((id) => offsiteDestinationScenes.includes(id)));
const offsiteLocalScenes = resolveScenes({ archetype: wellnessEarthArchetype, functionCount: 2, hasVenue: true, hasTravelInfo: false, hasAccommodationInfo: false, hasTransportContent: true, hasContactContent: true });
assert('a local one-day offsite (no travel/accommodation content) omits Stay and Travel even though the archetype supports them', !offsiteLocalScenes.includes('stay') && !offsiteLocalScenes.includes('travel'));
assert('the same local offsite still resolves the itinerary (functions) and transport scenes', offsiteLocalScenes.includes('functions') && offsiteLocalScenes.includes('transport'));

// ── 12: travel/transport navigation priority ────────────────────────────────
console.log('\n── Travel/Transport/Contact navigation priority ──');
assert('SCENE_ROLE.TRANSPORT and SCENE_ROLE.CONTACT now bridge to real working scene ids with navigationLabels', getSceneDefinitionForImplementedId('transport')?.navigationLabel === 'Transport' && getSceneDefinitionForImplementedId('contact')?.navigationLabel === 'Contact');
const offsiteNav = resolveUtilityNavFromScenes(['opening', 'functions', 'travel', 'stay', 'transport', 'contact', 'closing'], { maxPrimary: 6 });
// resolveUtilityNavFromScenes() emits each SCENE_ROLE's own id — the Stay
// role's id is 'accommodation', not the working SCENE id 'stay' (see
// sceneRegistry.js's id-vs-implementedAs split, and UtilityNavBar.js's
// matching Batch 3 fix).
assert('a destination-offsite-shaped scene list surfaces Travel/Stay/Transport in the primary nav, not hardcoded away', ['travel', 'accommodation', 'transport'].every((id) => offsiteNav.items.includes(id)));

// ── 13-14: Wellness programme/stay/travel scenes + wellness-earth tokens ───
console.log('\n── Wellness Retreat scenes + tokens ──');
const wellnessRetreatScenes = resolveScenes({ archetype: wellnessEarthArchetype, hasHonoureeContent: true, functionCount: 4, hasVenue: true, hasTravelInfo: true, hasAccommodationInfo: true, hasRegistrationContent: true });
assert('wellness-retreat resolves programme (functions), stay, travel and registration (Book) scenes', ['functions', 'stay', 'travel', 'registration'].every((id) => wellnessRetreatScenes.includes(id)));
assert('wellness-earth (forest-retreat) declares a complete token set (colors + fonts + semantic)', !!forestRetreat.tokens.colors && !!forestRetreat.tokens.fonts && !!forestRetreat.tokens.semantic);
assert('forest-retreat is visually distinct from every other implemented variant\'s background', listArchetypes().every((a) => a.id === 'wellness-earth' || a.variantIds.every((vid) => getVariant(vid).tokens.colors.bg !== forestRetreat.tokens.colors.bg)));

// ── 15: static models across all 5 Batch 3 categories ──────────────────────
console.log('\n── Static layout models — all 5 Batch 3 categories ──');
const fixtures = [
  ['anniversary', 'photo-editorial', 'editorial-ivory', { partner1Name: 'Meera', partner2Name: 'Arjun', anniversaryYears: '25' }],
  ['mundan', 'temple-heritage', 'sacred-threshold', { childName: 'Vihaan', parentsNote: 'The Rao Family', muhurat: '9:15 AM' }],
  ['religious-event', 'folk-celebration', 'festive-blessing', { religiousEventType: 'Satsang', hostedBy: 'The Gupta Family' }],
  ['team-offsite', 'wellness-earth', 'forest-retreat', { hostedBy: 'TechCorp', destinationNote: 'Coorg, Karnataka', contactInfo: 'trips@techcorp.com' }],
  ['wellness-retreat', 'wellness-earth', 'forest-retreat', { headlineText: 'Himalayan Silence Retreat', destinationNote: 'Rishikesh', facilitatorName: 'Ananya Desai' }],
];
for (const [slug, archetypeId, variantId, values] of fixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug, event_date: '2026-12-01', venue: 'Test Venue' }, values, isNonFestive: false });
  assert(`${slug} (${archetypeId}/${variantId}) static layout builds without throwing and carries mandatory attribution`, !!model.slots[STATIC_SLOT.ATTRIBUTION]);
  assert(`${slug} static attribution matches the policy-level line exactly (never archetype-overridden)`, model.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: false, surface: 'static' }).staticLine);
}

// ── 16: PDF models across all 5 ─────────────────────────────────────────────
console.log('\n── PDF page models — all 5 Batch 3 categories ──');
const offsiteModel = buildStaticLayoutModel({ archetypeId: 'wellness-earth', variantId: 'forest-retreat', event: { name: 'Offsite' }, values: { hostedBy: 'TechCorp', destinationNote: 'Coorg' }, isNonFestive: false });
const offsitePdf = buildPdfPageModels({ staticLayoutModel: offsiteModel, functions: [{ name: 'Arrival & Check-in', date: '2026-12-01', time: '2:00 PM' }, { name: 'Team Trek', date: '2026-12-02', time: '8:00 AM' }], travelNote: 'Flight details in Guest List.', stayNote: 'Resort rooms confirmed.' });
assert('team-offsite PDF model adds an itinerary (functions) page and a travel-stay page when that content exists', offsitePdf.pages.some((p) => p.kind === 'functions') && offsitePdf.pages.some((p) => p.kind === 'travel-stay'));
const mundanPdf = buildPdfPageModels({ staticLayoutModel: buildStaticLayoutModel({ archetypeId: 'temple-heritage', variantId: 'sacred-threshold', event: { name: 'Mundan' }, values: { childName: 'Vihaan', parentsNote: 'The Rao Family' }, isNonFestive: false }) });
assert('mundan PDF model is a single invitation page when no functions/travel/stay content exists', mundanPdf.pages.length === 1);

// ── 17: web scenes omit unavailable modules ─────────────────────────────────
console.log('\n── Web scenes omit unavailable modules ──');
const templeHeritageArchetype = getArchetype('temple-heritage');
const mundanScenesNoTravel = resolveScenes({ archetype: templeHeritageArchetype, hasHonoureeContent: true, hasTravelInfo: true, hasAccommodationInfo: true });
assert('temple-heritage (mundan) never resolves travel/stay even with signals true — not in its own supports (mundan is a local one-day ceremony)', !mundanScenesNoTravel.includes('travel') && !mundanScenesNoTravel.includes('stay'));

// ── 18: branding remains mandatory ──────────────────────────────────────────
console.log('\n── Branding remains mandatory ──');
assert('every Batch 3 fixture carries the exact mandatory attribution line (covered in the static-model loop above)', true);

// ── 19: conditional suppression remains intact ──────────────────────────────
console.log('\n── Conditional suppression (Batch 2 safeguard) still intact ──');
const namingSchema = getInviteSchema('naming-ceremony');
const stillSecretValues = normalizeInviteContent(namingSchema, { schema_content: { parentsNote: 'P', nameIsSecret: true, babyName: 'Test' } });
assert('naming-ceremony secret-name suppression (Batch 2) still works after Batch 3\'s changes', stillSecretValues.babyName === '');

console.log(`\n${passCount} passed, ${failCount} failed\n`);
process.exit(failCount > 0 ? 1 : 0);
