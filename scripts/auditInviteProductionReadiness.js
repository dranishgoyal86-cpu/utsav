// Utsav Invite Coverage + Launch-Readiness Audit — machine-readable pass.
// Run with: node scripts/auditInviteProductionReadiness.js
//
// This is NOT a pass/fail unit-test suite in the scripts/verify*.js sense
// (though it borrows their exact loader/assert pattern) — it is a
// READINESS MATRIX builder. For every one of the 26 canonical event slugs
// it programmatically evaluates what the lib layer can actually prove
// (schema exists, selector returns a real implemented archetype, static/
// PDF/web models resolve, branding resolves) and prints one row per slug.
// Anything requiring human/browser judgement (real visual quality, native
// device behaviour, live Supabase data) is explicitly marked NOT
// machine-verifiable here — see the audit's own completion report for
// that evidence instead. Never hardcodes a "Ready" verdict; every row is
// computed from the same registries production code reads.
//
// Also runs a second pass: an ORPHANED-FIELD scan — for every field key
// declared across all 26 schemas, a static-analysis check for whether
// that key is ever referenced (values.<key>) anywhere in the real
// content-mapping layer (screens/customer/InviteArchetypePilot.js) or the
// legacy production designer (screens/customer/ToranInvites.js +
// lib/inviteContentAdapter.js's mapping functions). A field can be
// legitimately unreferenced (operational-table-backed, e.g. it feeds
// event_functions instead of the invite; or intentionally metadata-only)
// — this scan only surfaces candidates for the audit's own report to
// classify, it does not judge on its own.

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

const ROOT = path.resolve(__dirname, '..');
const LIB = (...p) => path.resolve(ROOT, 'lib', ...p);

const { listArchetypes, validateArchetypeRegistry, getArchetype } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'index.js'));
const { ARCHETYPE_STATUS, STATIC_SLOT } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'types.js'));
const { getCatalogueEntry, EVENT_STRONG_ARCHETYPES, listCatalogueEntries } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));
const { getSelectableArchetypes } = loadEsmAsCjs(LIB('inviteDesignCompatibilityMatrix.js'));
const { buildStaticLayoutModel, buildPdfPageModels } = loadEsmAsCjs(LIB('staticInviteLayout.js'));
const { resolveScenes } = loadEsmAsCjs(LIB('inviteSceneResolver.js'));
const { getInviteSchema, isNonFestive } = loadEsmAsCjs(LIB('inviteSchemas', 'index.js'));
const { normalizeInviteContent, buildContentPatch, listSchemaFields } = loadEsmAsCjs(LIB('inviteContentAdapter.js'));
const { resolveBrandAttribution } = loadEsmAsCjs(LIB('inviteBrandingPolicy.js'));
const { validateSceneRegistry, getSceneDefinitionForImplementedId } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'sceneRegistry.js'));
const { validateUtilityRegistry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'utilityRegistry.js'));
const { INVITE_CAPABILITY_MAP } = loadEsmAsCjs(LIB('eventCapabilities.js'));

// The exact 26 canonical slugs from the brief — deliberately hand-
// transcribed here (not derived from SCHEMAS_BY_SLUG) so this audit would
// FAIL LOUDLY if the registry ever drifted from the canonical list
// instead of silently auditing whatever happens to be registered.
const CANONICAL_26 = [
  'hindu-wedding', 'nikah', 'anand-karaj', 'christian-wedding', 'parsi-wedding', 'jain-wedding', 'interfaith-wedding',
  'engagement', 'kids-birthday', 'adult-birthday', 'anniversary', 'mundan', 'baby-shower', 'naming-ceremony',
  'housewarming', 'religious-event', 'corporate-conference', 'product-launch', 'exhibition', 'concert',
  'festival-fair', 'sports-event', 'other', 'funeral-last-rites', 'wellness-retreat', 'team-offsite',
];

// A tiny, generically-shaped fixture per slug — enough for
// buildStaticLayoutModel/resolveScenes to run without throwing. NOT a
// visual-quality fixture (see the Playwright smoke sweep in the
// completion report for that) — this exists purely so the audit can
// prove "the pipeline resolves for this slug" mechanically, the same
// minimal-fixture spirit as scripts/verifyProductionBatch*.js.
function fixtureFor(slug) {
  if (slug === 'funeral-last-rites') return { subjectNameLine1: 'Ramesh Goyal', subjectYears: '1947 – 2026', detailLine1: 'Prayer meeting', familyContactInfo: 'Contact: 98765xxxxx' };
  if (slug === 'other') return { headlineText: 'A Gathering' };
  return { partner1Name: 'Test One', partner2Name: 'Test Two', hostedBy: 'The Family', headlineText: 'Test Event' };
}

console.log('\n================ 26/26 CANONICAL SLUG COVERAGE ================');
assert('CANONICAL_26 has exactly 26 entries (no drift in this audit\'s own list)', CANONICAL_26.length === 26);
assert('CANONICAL_26 has no duplicate slugs', new Set(CANONICAL_26).size === 26);

const readinessRows = [];

for (const slug of CANONICAL_26) {
  const row = { slug, schemaExists: false, schemaSlugMatches: false, hasImplementedSelectable: false, strongMatchCount: 0, leaksPlanned: false, staticResolves: false, pdfResolves: false, sceneResolves: false, brandingResolves: false, error: null };
  try {
    const schema = getInviteSchema(slug);
    row.schemaExists = !!schema;
    row.schemaSlugMatches = schema?.slug === slug;
    const nonFestive = isNonFestive(slug);
    row.nonFestive = nonFestive;

    const values = normalizeInviteContent(schema, buildContentPatch(schema, fixtureFor(slug), {}));
    const selectable = getSelectableArchetypes({ eventTypeSlug: slug, schema, values, isNonFestive: nonFestive });
    row.hasImplementedSelectable = selectable.length > 0;
    row.leaksPlanned = selectable.some((r) => getCatalogueEntry(r.archetypeId)?.status !== ARCHETYPE_STATUS.IMPLEMENTED);
    row.strongMatchCount = (EVENT_STRONG_ARCHETYPES[slug] || []).length;

    if (selectable.length > 0) {
      const archetypeId = selectable[0].archetypeId;
      const archetype = getArchetype(archetypeId);
      const variantId = archetype.variantIds[0];
      const model = buildStaticLayoutModel({ archetypeId, variantId, event: { name: 'Test', event_date: '2026-12-12', venue: 'Test Venue' }, values, eventTypeSlug: slug, isNonFestive: nonFestive });
      row.staticResolves = !!model?.slots?.[STATIC_SLOT.ATTRIBUTION];
      const pdf = buildPdfPageModels({ staticLayoutModel: model, functions: [] });
      row.pdfResolves = Array.isArray(pdf?.pages) && pdf.pages.length >= 1;
      const scenes = resolveScenes({ archetype, hasCoupleOrSubjectContent: true, hasVenue: true, hasRsvpContent: !nonFestive });
      row.sceneResolves = Array.isArray(scenes) && scenes.includes('opening') && scenes.includes('closing');
      row.brandingResolves = model.slots[STATIC_SLOT.ATTRIBUTION] === resolveBrandAttribution({ isNonFestive: nonFestive, surface: 'static' }).staticLine;
      row.archetypeUsed = archetypeId;
    }
  } catch (err) {
    row.error = err.message;
  }
  readinessRows.push(row);
}

console.log('\nslug                    | schema | selector | strong | noLeaks | static | pdf | scene | brand | archetype used');
console.log('-'.repeat(120));
for (const r of readinessRows) {
  const cell = (b) => (b ? ' OK ' : 'MISS');
  console.log(
    `${r.slug.padEnd(24)}| ${cell(r.schemaExists && r.schemaSlugMatches).padEnd(6)} | ${cell(r.hasImplementedSelectable).padEnd(8)} | ${String(r.strongMatchCount).padEnd(6)} | ${cell(!r.leaksPlanned).padEnd(7)} | ${cell(r.staticResolves).padEnd(6)} | ${cell(r.pdfResolves).padEnd(3)} | ${cell(r.sceneResolves).padEnd(5)} | ${cell(r.brandingResolves).padEnd(5)} | ${r.archetypeUsed || (r.error ? `ERROR: ${r.error}` : '—')}`
  );
}

console.log('\n================ ASSERTIONS ================');
for (const r of readinessRows) {
  assert(`${r.slug}: schema resolves and its own .slug matches`, r.schemaExists && r.schemaSlugMatches);
}

// funeral-last-rites is the one deliberate, documented exception — the
// archetype-registry selector is EXPECTED to return zero implemented
// archetypes (stillness stays 'planned' by design; see the completion
// report's Funeral audit for why this is not itself a launch blocker —
// production funeral invites are served by an entirely separate legacy
// path, StillnessCard.js, not audited by this registry-level script at
// all). Every OTHER canonical slug must have at least one real,
// implemented, strongly-matched selectable archetype.
for (const r of readinessRows) {
  if (r.slug === 'funeral-last-rites') {
    assert('funeral-last-rites: archetype-registry selector returns ZERO implemented archetypes (expected — stillness is deliberately still planned; served by the separate legacy StillnessCard path instead, see report)', r.hasImplementedSelectable === false);
    continue;
  }
  assert(`${r.slug}: has at least one implemented, selectable archetype`, r.hasImplementedSelectable === true);
  assert(`${r.slug}: has at least one catalogue-declared STRONG match`, r.strongMatchCount > 0);
  assert(`${r.slug}: selector never leaks a planned archetype`, r.leaksPlanned === false);
  assert(`${r.slug}: static layout model resolves with mandatory branding`, r.staticResolves === true);
  assert(`${r.slug}: PDF model resolves at least one page`, r.pdfResolves === true);
  assert(`${r.slug}: scene resolution includes opening + closing`, r.sceneResolves === true);
  assert(`${r.slug}: static branding line matches the policy exactly (never archetype-overridden)`, r.brandingResolves === true);
}

console.log('\n================ REGISTRY-LEVEL INTEGRITY ================');
assert('validateArchetypeRegistry() reports zero problems', validateArchetypeRegistry().length === 0);
assert('validateSceneRegistry() reports zero problems (valid capability refs, complete lifecyclePriority)', validateSceneRegistry(Object.keys(INVITE_CAPABILITY_MAP)).length === 0);
assert('validateUtilityRegistry() reports zero problems', validateUtilityRegistry().length === 0);
assert('registry has exactly 17 implemented archetypes, 1 planned (stillness)', listArchetypes().length === 17 && listCatalogueEntries().filter((e) => e.status === ARCHETYPE_STATUS.PLANNED).length === 1);
const everyStrongMatchIsARealArchetype = Object.values(EVENT_STRONG_ARCHETYPES).flat().every((id) => !!getCatalogueEntry(id));
assert('every archetypeId named in EVENT_STRONG_ARCHETYPES resolves to a real catalogue entry (no orphan archetype references)', everyStrongMatchIsARealArchetype);

// ── Orphaned-field scan ─────────────────────────────────────────────────
console.log('\n================ ORPHANED-FIELD SCAN (static analysis) ================');
console.log('Cross-references every field key declared across all 26 schemas against\nreferences in the two real content-consuming layers. A field marked\nUNREFERENCED is a CANDIDATE for the report to classify by hand — this\nscript does not itself decide "orphaned vs intentionally unused".\n');

const pilotSource = fs.readFileSync(path.join(ROOT, 'screens', 'customer', 'InviteArchetypePilot.js'), 'utf8');
const toranSource = fs.readFileSync(path.join(ROOT, 'screens', 'customer', 'ToranInvites.js'), 'utf8');
const guestListSource = fs.readFileSync(path.join(ROOT, 'screens', 'customer', 'GuestList.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(ROOT, 'lib', 'inviteContentAdapter.js'), 'utf8');
const staticLayoutSource = fs.readFileSync(path.join(ROOT, 'lib', 'staticInviteLayout.js'), 'utf8');
const combinedConsumerSource = pilotSource + '\n' + toranSource + '\n' + guestListSource + '\n' + adapterSource + '\n' + staticLayoutSource;

// Fields that are legitimately never read as `values.<key>` — they back
// canonical operational tables/UI the invite layer intentionally doesn't
// re-render (already documented, e.g. event_functions), or are structural
// (legacyColumn identity fields already covered by their own key).
const KNOWN_OPERATIONAL_OR_STRUCTURAL = new Set([
  'customSections', // universal SECTIONS extension point — round-tripped, not force-rendered anywhere by design
]);

const allSchemaFieldKeys = new Set();
const fieldKeysBySlug = {};
for (const slug of CANONICAL_26) {
  const schema = getInviteSchema(slug);
  const keys = listSchemaFields(schema).map((f) => f.key);
  fieldKeysBySlug[slug] = keys;
  keys.forEach((k) => allSchemaFieldKeys.add(k));
}

const orphaned = [];
const referenced = [];
for (const key of Array.from(allSchemaFieldKeys).sort()) {
  const pattern = new RegExp(`\\bvalues\\??\\.${key}\\b|\\bv\\.${key}\\b`);
  const isReferenced = pattern.test(combinedConsumerSource);
  if (isReferenced || KNOWN_OPERATIONAL_OR_STRUCTURAL.has(key)) referenced.push(key);
  else orphaned.push(key);
}

console.log(`Total distinct field keys across all 26 schemas: ${allSchemaFieldKeys.size}`);
console.log(`Referenced somewhere in the content-mapping layers: ${referenced.length}`);
console.log(`UNREFERENCED (candidates for manual classification): ${orphaned.length}`);
if (orphaned.length) {
  console.log('\n  ' + orphaned.join('\n  '));
}
assert('orphaned-field count is captured for the report (informational, not pass/fail on its own)', true);

console.log(`\n${passCount} passed, ${failCount} failed`);
if (failCount > 0) process.exit(1);
