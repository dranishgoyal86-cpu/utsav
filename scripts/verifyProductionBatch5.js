// Plain Node sanity check for Visual Production Batch 5 (Anand Karaj,
// Christian Wedding, Parsi Wedding, Jain Wedding, Interfaith Wedding,
// Other — the remaining wedding traditions + generic catch-all) — run
// with: node scripts/verifyProductionBatch5.js
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

const { getArchetype, listArchetypes, validateArchetypeRegistry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS, STATIC_SLOT } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { getSelectableArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { buildStaticLayoutModel, buildPdfPageModels } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent, buildContentPatch, listSchemaFields } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
const { matchEventTypeText } = loadEsmAsCjs(LIB('eventTypeNames.js'));

const NEW_SLUGS = ['anand-karaj', 'christian-wedding', 'parsi-wedding', 'jain-wedding', 'interfaith-wedding', 'other'];

// ── 0: registry/schema foundation ───────────────────────────────────────────
console.log('\n── Schema registry ──');
assert('validateArchetypeRegistry() reports zero problems', validateArchetypeRegistry().length === 0);
assert('registry still has exactly 17 implemented archetypes (no archetype promoted this wave)', listArchetypes().length === 17);
for (const slug of NEW_SLUGS) {
  const schema = getInviteSchema(slug);
  assert(`${slug} schema resolves via getInviteSchema()`, !!schema && schema.slug === slug);
  assert(`${slug} is not solemn (isNonFestive() === false)`, isNonFestive(slug) === false);
}
assert("'other' is excluded from free-text event-type matching", matchEventTypeText('let me check with the other guests') === null);

// ── 1-6: selectors per event type ───────────────────────────────────────────
console.log('\n── Selectable archetypes per tradition ──');
function selectableIds(slug, values = { partner1Name: 'A', partner2Name: 'B' }) {
  return getSelectableArchetypes({ eventTypeSlug: slug, schema: getInviteSchema(slug), values, isNonFestive: false }).map((r) => r.archetypeId);
}
const anandKarajSelectable = selectableIds('anand-karaj');
assert('anand-karaj offers ivory-mandala, folk-celebration, royal-palace, botanical-romance, photo-editorial, modern-indian', ['ivory-mandala', 'folk-celebration', 'royal-palace', 'botanical-romance', 'photo-editorial', 'modern-indian'].every((id) => anandKarajSelectable.includes(id)));
const christianSelectable = selectableIds('christian-wedding');
assert('christian-wedding offers botanical-romance, ivory-mandala, photo-editorial, modern-indian, night-bloom', ['botanical-romance', 'ivory-mandala', 'photo-editorial', 'modern-indian', 'night-bloom'].every((id) => christianSelectable.includes(id)));
const parsiSelectable = selectableIds('parsi-wedding');
assert('parsi-wedding offers folk-celebration, photo-editorial, botanical-romance, modern-indian, ivory-mandala', ['folk-celebration', 'photo-editorial', 'botanical-romance', 'modern-indian', 'ivory-mandala'].every((id) => parsiSelectable.includes(id)));
const jainSelectable = selectableIds('jain-wedding');
assert('jain-wedding offers temple-heritage, ivory-mandala, botanical-romance, royal-palace, modern-indian', ['temple-heritage', 'ivory-mandala', 'botanical-romance', 'royal-palace', 'modern-indian'].every((id) => jainSelectable.includes(id)));
const interfaithSelectable = selectableIds('interfaith-wedding');
assert('interfaith-wedding offers botanical-romance, modern-indian, photo-editorial, ivory-mandala, illustrated-story', ['botanical-romance', 'modern-indian', 'photo-editorial', 'ivory-mandala', 'illustrated-story'].every((id) => interfaithSelectable.includes(id)));
const otherSelectable = selectableIds('other', { headlineText: 'Test Event' });
assert('other offers modern-indian, botanical-romance, photo-editorial, ivory-mandala, playful-pop, cultural-poster', ['modern-indian', 'botanical-romance', 'photo-editorial', 'ivory-mandala', 'playful-pop', 'cultural-poster'].every((id) => otherSelectable.includes(id)));

console.log('\n── Planned/implemented selector safety ──');
const allSelected = [...anandKarajSelectable, ...christianSelectable, ...parsiSelectable, ...jainSelectable, ...interfaithSelectable, ...otherSelectable];
assert('none of the 6 selectors ever return a planned entry', allSelected.every((id) => getCatalogueEntry(id).status === ARCHETYPE_STATUS.IMPLEMENTED));
assert("stillness (the only remaining planned archetype) never appears in any of the 6 selectors", !allSelected.includes('stillness'));

// ── 7-13: religious-content guard (no auto-insert, host content preserved) ──
console.log('\n── Religious-content guard: no auto-insertion ──');
const anandKarajSchema = getInviteSchema('anand-karaj');
const nikahSchema = getInviteSchema('nikah');
const christianSchema = getInviteSchema('christian-wedding');
const parsiSchema = getInviteSchema('parsi-wedding');
const jainSchema = getInviteSchema('jain-wedding');

const anandKarajNoReligion = normalizeInviteContent(anandKarajSchema, buildContentPatch(anandKarajSchema, { partner1Name: 'Simran', partner2Name: 'Gurpreet', hostedBy: 'The Families', gurdwaraAddress: 'Gurdwara Sahib' }, {}));
assert('anand-karaj: gurbaniLine is blank when ikOnkarEnabled is not set (no auto-insertion)', !anandKarajNoReligion.gurbaniLine);
const anandKarajWithReligion = normalizeInviteContent(anandKarajSchema, buildContentPatch(anandKarajSchema, { partner1Name: 'Simran', partner2Name: 'Gurpreet', ikOnkarEnabled: true, gurbaniLine: 'Host-selected Gurbani line' }, {}));
assert('anand-karaj: host-supplied gurbaniLine is preserved when ikOnkarEnabled is true', anandKarajWithReligion.gurbaniLine === 'Host-selected Gurbani line');

const nikahNoReligion = normalizeInviteContent(nikahSchema, buildContentPatch(nikahSchema, { partner1Name: 'A', partner2Name: 'B' }, {}));
assert('nikah: bismillahText/quranicVerseText blank with no *Enabled flags set (no auto-insertion)', !nikahNoReligion.bismillahText && !nikahNoReligion.quranicVerseText);
const nikahWithReligion = normalizeInviteContent(nikahSchema, buildContentPatch(nikahSchema, { partner1Name: 'A', partner2Name: 'B', bismillahEnabled: true, bismillahText: 'Host Bismillah text', quranicVerseEnabled: true, quranicVerseText: 'Host verse' }, {}));
assert('nikah: host-supplied bismillah/Qur’anic content preserved when enabled', nikahWithReligion.bismillahText === 'Host Bismillah text' && nikahWithReligion.quranicVerseText === 'Host verse');

const christianNoScripture = normalizeInviteContent(christianSchema, buildContentPatch(christianSchema, { partner1Name: 'A', partner2Name: 'B', churchAddress: 'St. Mary’s' }, {}));
assert('christian-wedding: scriptureText is blank when scriptureEnabled is not set (no auto-insertion)', !christianNoScripture.scriptureText);
const christianWithScripture = normalizeInviteContent(christianSchema, buildContentPatch(christianSchema, { partner1Name: 'A', partner2Name: 'B', churchAddress: 'St. Mary’s', scriptureEnabled: true, scriptureText: 'Host-chosen scripture', officiantName: 'Fr. Thomas' }, {}));
assert('christian-wedding: host-supplied scripture + officiant preserved', christianWithScripture.scriptureText === 'Host-chosen scripture' && christianWithScripture.officiantName === 'Fr. Thomas');

const parsiNoReligion = normalizeInviteContent(parsiSchema, buildContentPatch(parsiSchema, { partner1Name: 'A', partner2Name: 'B', parentsNote: 'The families' }, {}));
assert('parsi-wedding: familyBlessingText is blank when religiousSymbolEnabled is not set (no auto-insertion)', !parsiNoReligion.familyBlessingText);

const jainNoMantra = normalizeInviteContent(jainSchema, buildContentPatch(jainSchema, { partner1Name: 'A', partner2Name: 'B', parentsNote: 'The families', muhurat: '10:30 AM' }, {}));
assert('jain-wedding: navkarMantraText is blank when navkarMantraEnabled is not set (no auto-insertion)', !jainNoMantra.navkarMantraText);
const jainWithMantra = normalizeInviteContent(jainSchema, buildContentPatch(jainSchema, { partner1Name: 'A', partner2Name: 'B', parentsNote: 'The families', muhurat: '10:30 AM', navkarMantraEnabled: true, navkarMantraText: 'Host-supplied mantra text' }, {}));
assert('jain-wedding: host-supplied Navkar Mantra text preserved when enabled', jainWithMantra.navkarMantraText === 'Host-supplied mantra text');

// ── 14-16: interfaith ordering, immutability, balance ───────────────────────
console.log('\n── Interfaith ceremonies + balance ──');
const interfaithSchema = getInviteSchema('interfaith-wedding');
const rawCeremonies = [
  { id: 'c1', title: 'Church Ceremony', venue: 'St. Xavier’s Cathedral', description: 'A Christian ceremony.', date: '2026-12-12', startTime: '10:00 AM', endTime: '11:30 AM', sortOrder: 0 },
  { id: 'c2', title: 'Hindu Ceremony', venue: 'Riverside Mandap', description: 'A Hindu ceremony.', date: '2026-12-12', startTime: '4:00 PM', endTime: '6:00 PM', sortOrder: 1 },
];
const interfaithValues = normalizeInviteContent(interfaithSchema, buildContentPatch(interfaithSchema, {
  partner1Name: 'Fatima Rahman', partner2Name: 'Daniel Coelho', family1Note: 'The Rahman Family', family2Note: 'The Coelho Family', interfaithCeremonies: rawCeremonies,
}, {}));
assert('interfaith-wedding: interfaithCeremonies round-trips through the adapter with order intact', Array.isArray(interfaithValues.interfaithCeremonies) && interfaithValues.interfaithCeremonies.length === 2 && interfaithValues.interfaithCeremonies[0].title === 'Church Ceremony' && interfaithValues.interfaithCeremonies[1].title === 'Hindu Ceremony');
assert('interfaith-wedding: neither family field is dropped by normalization (balanced by default)', interfaithValues.family1Note === 'The Rahman Family' && interfaithValues.family2Note === 'The Coelho Family');

const beforeJson = JSON.stringify(interfaithValues);
buildStaticLayoutModel({ archetypeId: 'botanical-romance', variantId: 'rose-garden', event: { name: 'Test' }, values: interfaithValues, eventTypeSlug: 'interfaith-wedding', isNonFestive: false });
buildStaticLayoutModel({ archetypeId: 'modern-indian', variantId: 'modern-home', event: { name: 'Test' }, values: interfaithValues, eventTypeSlug: 'interfaith-wedding', isNonFestive: false });
assert('interfaith-wedding: switching archetype/variant never mutates the underlying values object', JSON.stringify(interfaithValues) === beforeJson);

const interfaithScenes = resolveScenes({ archetype: getArchetype('botanical-romance'), hasCoupleOrSubjectContent: true, hasFamilyContent: true, functionCount: 2, hasVenue: true, hasRsvpContent: true });
assert('interfaith-wedding: family scene resolves (both families represented, none hidden)', interfaithScenes.includes('family'));
assert('interfaith-wedding: functions/ceremonies scene resolves for a 2-ceremony fixture', interfaithScenes.includes('functions'));

// ── 17: other never infers event type ───────────────────────────────────────
console.log('\n── Other stays generic ──');
const otherSchema = getInviteSchema('other');
const otherFields = listSchemaFields(otherSchema).map((f) => f.key);
assert('other schema has no religious/tradition-specific fields (stays intentionally generic)', !otherFields.some((k) => /gurbani|scripture|mantra|bismillah|quranic|navkar/i.test(k)));

// ── 18-19: static + PDF models across all 6 ─────────────────────────────────
console.log('\n── Static + PDF models across all 6 categories ──');
const staticFixtures = [
  ['anand-karaj', 'ivory-mandala', 'gold-lotus', { partner1Name: 'Simran Kaur', partner2Name: 'Gurpreet Singh', hostedBy: 'The Families', gurdwaraAddress: 'Gurdwara Sahib, Sector 45' }],
  ['christian-wedding', 'botanical-romance', 'rose-garden', { partner1Name: 'Maria Fernandes', partner2Name: 'John D’Souza', hostedBy: 'The Families', churchAddress: 'St. Andrew’s Church' }],
  ['parsi-wedding', 'photo-editorial', 'editorial-ivory', { partner1Name: 'Freny Mistry', partner2Name: 'Cyrus Bilimoria', parentsNote: 'The families' }],
  ['jain-wedding', 'temple-heritage', 'sacred-threshold', { partner1Name: 'Priya Jain', partner2Name: 'Rohan Sanghvi', parentsNote: 'The families', muhurat: '10:30 AM' }],
  ['interfaith-wedding', 'modern-indian', 'modern-home', { partner1Name: 'Fatima Rahman', partner2Name: 'Daniel Coelho', family1Note: 'The Rahmans', family2Note: 'The Coelhos' }],
  ['other', 'botanical-romance', 'rose-garden', { headlineText: 'A Celebration of Life', hostedBy: 'The Family' }],
];
for (const [slug, archetypeId, variantId, values] of staticFixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug, event_date: '2026-12-12', venue: 'Test Venue' }, values, eventTypeSlug: slug, isNonFestive: false });
  assert(`${slug} (${archetypeId}/${variantId}) static layout builds without throwing and carries mandatory attribution`, !!model.slots[STATIC_SLOT.ATTRIBUTION]);
  const pdf = buildPdfPageModels({ staticLayoutModel: model, functions: [{ id: 'f1', name: 'Ceremony', date: '2026-12-12', time: '4:00 PM' }] });
  assert(`${slug} PDF model builds at least an invitation page`, pdf.pages.length >= 1 && pdf.pages[0].kind === 'invitation');
}

// ── 20: scene resolution across all 6 ───────────────────────────────────────
console.log('\n── Scene resolution across all 6 categories ──');
for (const [slug, archetypeId] of staticFixtures.map(([s, a]) => [s, a])) {
  const archetype = getArchetype(archetypeId);
  const scenes = resolveScenes({ archetype, hasCoupleOrSubjectContent: true, hasFamilyContent: true, functionCount: 1, hasVenue: true, hasRsvpContent: true });
  assert(`${slug}'s recommended archetype (${archetypeId}) resolves 'opening' and 'closing'`, scenes.includes('opening') && scenes.includes('closing'));
}

// ── 22: branding mandatory ──────────────────────────────────────────────────
console.log('\n── Branding remains mandatory ──');
for (const [slug, archetypeId, variantId, values] of staticFixtures) {
  const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: slug }, values, eventTypeSlug: slug, isNonFestive: false });
  assert(`${slug} static attribution matches the policy-level line exactly (never archetype-overridden)`, model.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: false, surface: 'static' }).staticLine);
}

// ── 23: conditional suppression remains intact (regression) ────────────────
console.log('\n── Conditional suppression regression (naming-ceremony/product-launch, pre-Batch-5) ──');
const namingSchema = getInviteSchema('naming-ceremony');
const secretBaby = normalizeInviteContent(namingSchema, buildContentPatch(namingSchema, { nameIsSecret: true, babyName: 'Should Never Appear' }, {}));
assert('naming-ceremony: babyName still suppressed when nameIsSecret is true (Batch 2 safeguard unchanged)', !secretBaby.babyName);

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);
