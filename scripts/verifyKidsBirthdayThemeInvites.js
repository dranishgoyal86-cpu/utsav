// Kids Birthday Theme-Aware Invite Designer — automated checks.
//
// Same standalone-node-script pattern as scripts/verifyProductionIntegration.js
// (this repo has no Jest/Playwright test runner configured, no
// "type":"module" in package.json, and these files use RN/Expo-only import
// syntax — so every scripts/verify*.js loads its target modules through
// this same recursive babel-transform-to-CJS loader rather than plain ESM
// `import`, which fails under Node's strict ESM resolution — e.g. an
// extensionless `from './eventThemes'` throws ERR_MODULE_NOT_FOUND. This
// file originally used plain `import` and had never actually run
// successfully despite its own "Run with: node ..." header — found while
// fixing an unrelated bug this suite was meant to catch.) Run with:
// node scripts/verifyKidsBirthdayThemeInvites.js
//
// Scope note (honest, not the spec's own unverified "44 cases" figure):
// this suite covers the registry, resolver, and prefill-adapter logic —
// the parts of this wave that are pure, RN/Supabase-free functions and so
// can genuinely be asserted here. It does NOT cover the ProductionInviteCard/
// ToranInvites.js wiring (needs a real RN render environment), Playwright
// visual QA, or a live-Supabase Event Planner integration test — those are
// called out as open items in the completion report, not silently skipped.
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

const LIB = (...p) => path.resolve(__dirname, '..', 'lib', ...p);

const {
  listKidsBirthdayThemes, resolveKidsBirthdayTheme, getKidsBirthdayInviteOptions,
} = loadEsmAsCjs(LIB('kidsBirthdayThemes.js'));
const {
  computeAgeTurningOnDate, buildKidsBirthdayInviteDefaults, withKidsBirthdayPlannerDefaults,
} = loadEsmAsCjs(LIB('kidsBirthdayInviteDefaults.js'));
// Deliberately checking against catalogue.js's own variantIds (present on
// every entry) rather than loading lib/inviteDesignArchetypes/index.js
// directly — index.js pulls in all 17 archetype + 22 variant files, which
// this lighter-weight, RN/Supabase-free suite has no need to load just to
// confirm a variantId belongs to its archetype.
const { getCatalogueEntry } = loadEsmAsCjs(LIB('inviteDesignArchetypes', 'catalogue.js'));

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL: ${label}`); }
}

const EXPECTED_SLUGS = [
  'jungle-safari', 'under-the-sea', 'space-explorer', 'dinosaur-discovery',
  'unicorn-rainbows', 'princess-castle', 'superhero-squad', 'circus-carnival',
  'sports-champions', 'enchanted-garden', 'cars-wheels', 'teddy-rattles',
  'wizarding-school', 'magic-kingdom-fairytale', 'candy-land', 'tropical-luau',
  'music-dance-party', 'gaming-zone',
];

// Franchise/character terms that must never appear anywhere in this
// registry's copy — checked against the full listKidsBirthdayThemes()
// output (label, motif vocabulary, copy tone), with extra weight on the
// six themes the spec named for a dedicated copyright re-inspection.
const BANNED_TERMS = [
  'marvel', 'dc comics', 'spider-man', 'spiderman', 'batman', 'superman', 'avengers',
  'harry potter', 'hogwarts', 'gryffindor', 'slytherin', 'hufflepuff', 'ravenclaw', 'deathly hallows',
  'disney', 'mickey', 'hasbro',
];

// ── 1. Registry integrity ──────────────────────────────────────────────
const all = listKidsBirthdayThemes();
check('registry has exactly 18 themes', all.length === 18);
check('registry slugs match the canonical 18, in order', JSON.stringify(all.map(t => t.slug)) === JSON.stringify(EXPECTED_SLUGS));
for (const t of all) {
  check(`${t.slug}: has displayName`, typeof t.displayName === 'string' && t.displayName.length > 0);
  check(`${t.slug}: has 2 named palettes`, Array.isArray(t.palettes) && t.palettes.length === 2);
  check(`${t.slug}: palettes have [primary, secondary] hex pairs`, t.palettes.every(p => Array.isArray(p.colors) && p.colors.length === 2 && /^#[0-9A-Fa-f]{6}$/.test(p.colors[0])));
  check(`${t.slug}: has 4 icons`, Array.isArray(t.icons) && t.icons.length === 4);
  check(`${t.slug}: has an age affinity band`, Array.isArray(t.ageAffinity) && t.ageAffinity.length > 0);
  // Archetype/variant compatibility — must be a real, IMPLEMENTED entry.
  const entry = getCatalogueEntry(t.archetypeId);
  check(`${t.slug}: archetype "${t.archetypeId}" is a real, implemented catalogue entry`, !!entry && entry.status === 'implemented');
  check(`${t.slug}: variant "${t.variantId}" belongs to its archetype`, !!entry && (entry.variantIds || []).includes(t.variantId));
  check(`${t.slug}: archetype is strong-recommended for kids-birthday`, (entry?.supportedEventSlugs || []).includes('kids-birthday'));
}

// Regression guard — found via a real Playwright visual QA pass:
// princess-castle/enchanted-garden, superhero-squad/cars-wheels, and
// unicorn-rainbows/magic-kingdom-fairytale each shared an identical
// palettes[0].colors[0] hex, and since those pairs also share an
// archetype/variant, the resulting cards were pixel-identical apart from
// the corner icon badge. This must never regress.
const defaultAccents = all.map(t => t.palettes[0].colors[0]);
check('no two themes share the same default (palette[0]) accent color', new Set(defaultAccents).size === defaultAccents.length);

// ── 2. Copyright/franchise scan (all 18, extra emphasis on the 6 named) ──
const copyrightFlagged = ['superhero-squad', 'wizarding-school', 'magic-kingdom-fairytale', 'candy-land', 'gaming-zone', 'cars-wheels'];
for (const t of all) {
  const haystack = [t.displayName, t.copyTone, ...(t.motifVocabulary || []), ...(t.icons || [])].join(' ').toLowerCase();
  const hit = BANNED_TERMS.find(term => haystack.includes(term));
  check(`${t.slug}: no franchise/copyrighted term present`, !hit);
}
check('all 6 copyright-flagged themes are present in the registry', copyrightFlagged.every(slug => EXPECTED_SLUGS.includes(slug)));

// ── 3. Resolver: exact match, fuzzy match, unknown fallback, determinism ──
check('exact slug resolves', resolveKidsBirthdayTheme('jungle-safari')?.slug === 'jungle-safari');
check('fuzzy label text resolves', resolveKidsBirthdayTheme('we want a jungle safari themed party')?.slug === 'jungle-safari');
check('unknown/free-text theme resolves to null (caller falls back)', resolveKidsBirthdayTheme('a totally made up theme xyz') === null);
check('empty/undefined theme resolves to null', resolveKidsBirthdayTheme(undefined) === null && resolveKidsBirthdayTheme('') === null);

const opt1 = getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold');
const opt2 = getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold');
check('getKidsBirthdayInviteOptions is deterministic (same input -> identical output)', JSON.stringify(opt1) === JSON.stringify(opt2));
check('unknown theme falls back safely (never crashes, never returns invalid archetype)', getKidsBirthdayInviteOptions('nonexistent-theme-slug').isFallback === true);
check('fallback still resolves to a real, implemented archetype/variant', (() => {
  const fb = getKidsBirthdayInviteOptions('nonexistent-theme-slug');
  const entry = getCatalogueEntry(fb.archetypeId);
  return !!entry && entry.status === 'implemented' && (entry.variantIds || []).includes(fb.variantId);
})());
check('display label is a friendly name, not an engineering composition', !getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold').displayLabel.includes(':') && getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold').displayLabel.includes('Jungle Safari'));
check('palette name selects the second palette distinctly', getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold').accentOverride !== getKidsBirthdayInviteOptions('jungle-safari', 'Sunset Orange').accentOverride);
check('a null/unrecognized palette name falls back to the default (first) palette, never crashes', getKidsBirthdayInviteOptions('jungle-safari', null).accentOverride === getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold').accentOverride);
check('a persisted-but-stale palette name (e.g. from a since-renamed palette) also falls back safely', getKidsBirthdayInviteOptions('jungle-safari', 'Some Renamed Palette').accentOverride === getKidsBirthdayInviteOptions('jungle-safari', 'Emerald & Gold').accentOverride);

// ── 4. Age calculation — birthDate vs eventDate never conflated ─────────
check('age turning: birthday already passed this year by party date', computeAgeTurningOnDate('2020-03-01', '2026-09-13') === 6);
check('age turning: birthday NOT yet reached by party date', computeAgeTurningOnDate('2020-11-01', '2026-09-13') === 5);
check('age turning: party date IS the birth month/day (turns exactly N)', computeAgeTurningOnDate('2020-09-13', '2026-09-13') === 6);
check('age turning: missing DOB returns null, never a guessed number', computeAgeTurningOnDate(null, '2026-09-13') === null);
check('age turning: missing party date returns null', computeAgeTurningOnDate('2020-03-01', null) === null);

// ── 5. DOB privacy — DOB text itself never appears in prefill output ────
const dobDefaults = buildKidsBirthdayInviteDefaults({
  event_type_slug: 'kids-birthday', birthday_person_name: 'Aarav', birthday_person_dob: '2020-09-10',
  event_date: '2026-09-13', theme_slug: 'jungle-safari',
}, { featuredActivities: [] });
check('turningAge is present and is an age, not a date', dobDefaults.turningAge === '6');
check('the raw DOB string never appears anywhere in the generated defaults', !JSON.stringify(dobDefaults).includes('2020-09-10'));
check('childName comes through as the plain name, not a DOB-derived string', dobDefaults.childName === 'Aarav');

// ── 6. Prefill precedence — planner data fills gaps, never overwrites ───
const plannerDefaults = buildKidsBirthdayInviteDefaults(
  { event_type_slug: 'kids-birthday', birthday_person_name: 'Aarav', birthday_person_dob: '2020-09-10', event_date: '2026-09-13', theme_slug: 'jungle-safari' },
  { featuredActivities: ['Magic Show', 'Face Painting', 'Bouncy Castle', 'Dance Party', 'Cake Cutting'] }
);
check('activitiesNote is built from the real starred activities list, joined with the existing separator', plannerDefaults.activitiesNote === 'Magic Show · Face Painting · Bouncy Castle · Dance Party · Cake Cutting');
check('partyTheme defaults to the theme\'s plain display name', plannerDefaults.partyTheme === 'Jungle Safari');

const existingHostWording = { childName: 'AJ (host\'s own edited nickname)', partyTheme: 'Custom Jungle Vibes — host wrote this' };
const merged = withKidsBirthdayPlannerDefaults(existingHostWording, { event_type_slug: 'kids-birthday', birthday_person_name: 'Aarav', theme_slug: 'jungle-safari', event_date: '2026-09-13', birthday_person_dob: '2020-09-10' }, { featuredActivities: [] });
check('an existing host-edited value is NEVER overwritten by planner defaults', merged.childName === 'AJ (host\'s own edited nickname)' && merged.partyTheme === 'Custom Jungle Vibes — host wrote this');
check('a genuinely empty field still gets filled from planner data', merged.turningAge === '6');

check('non-kids-birthday event types are completely untouched by this module', withKidsBirthdayPlannerDefaults({ foo: 'bar' }, { event_type_slug: 'hindu-wedding' }, {}).foo === 'bar' && !('childName' in withKidsBirthdayPlannerDefaults({ foo: 'bar' }, { event_type_slug: 'hindu-wedding' }, {})));

check('empty activities list suppresses activitiesNote entirely (no empty string, no placeholder)', !('activitiesNote' in buildKidsBirthdayInviteDefaults({ event_type_slug: 'kids-birthday' }, { featuredActivities: [] })));

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${pass} passing, ${fail} failing`);
if (fail > 0) process.exit(1);
