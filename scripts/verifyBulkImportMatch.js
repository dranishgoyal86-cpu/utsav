// Plain Node sanity check for the bulk-import fuzzy category matcher --
// run with:
//   node scripts/verifyBulkImportMatch.js
// Feeds realistic MESSY spreadsheet-column text (typos, abbreviations,
// reordered words, bare parent names, genuinely unrelated junk) through
// the real matchCategory() against the real live taxonomy, and checks the
// confident/review/no-match split behaves sensibly. Prints PASS/FAIL per
// assertion plus the full score table so threshold tuning is inspectable,
// not just pass/fail.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { matchCategory, CONFIDENT_THRESHOLD, REVIEW_FLOOR, similarityScore, DUPLICATE_THRESHOLD, POSSIBLE_DUPLICATE_THRESHOLD } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'fuzzyMatch.js'));
const taxonomy = loadEsmAsCjs(path.resolve(__dirname, '..', 'vendorTaxonomy.js'));
const { deriveReviewGroups } = loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'bulkImportReview.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond, extra) {
  if (cond) { passCount++; console.log(`  PASS  ${label}`); }
  else { failCount++; console.log(`  FAIL  ${label}${extra ? `  (${extra})` : ''}`); }
}

function show(query) {
  const result = matchCategory(query, taxonomy);
  const top = result.candidates[0];
  const status = result.confident ? 'CONFIDENT' : (top ? 'REVIEW' : 'NO MATCH');
  console.log(`\n"${query}" -> ${status}`);
  for (const c of result.candidates) {
    console.log(`    ${c.score.toFixed(3)}  ${c.subcategory}  (${c.parent})`);
  }
  return result;
}

console.log('== Clean, exact-ish names -- should all be CONFIDENT ==');
for (const [query, expectedSub] of [
  ['Caterers', 'Caterers'],
  ['Wedding Photography', 'Wedding Photography'],
  ['DJs', 'DJs'],
  ['Banquet Halls', 'Banquet Halls'],
  ['Mehendi Artists', 'Mehendi Artists'],
]) {
  const result = show(query);
  assert(`"${query}" confident, top = "${expectedSub}"`,
    result.confident && result.candidates[0]?.subcategory === expectedSub,
    `got ${result.candidates[0]?.subcategory} @ ${result.candidates[0]?.score.toFixed(3)}`);
}

console.log('\n== Realistic messy names -- typos, abbreviations, extra words ==');
for (const [query, expectedSub] of [
  ['Caterrs', 'Caterers'],
  ['Wedding Photographer', 'Wedding Photography'],
  ['photography (wedding)', 'Wedding Photography'],
  ['mehndi artist', 'Mehendi Artists'],
  ['Bridal Makeup Artits', 'Bridal Makeup Artists'],
  ['DJ / Music', 'DJs'],
  ['sound system rental', 'Sound Systems'],
  ['tent house', 'Tent & Shamiana'],
  ['Live Bnd', 'Live Bands'],
  ['florist', 'Fresh Flowers'],
  ['wedding planner', 'Wedding Planner'], // singular is itself a real, distinct subcategory (Event Planning & Management) -- exact match correctly outranks the plural
]) {
  const result = show(query);
  const top = result.candidates[0];
  assert(`"${query}" top candidate is "${expectedSub}" (confident-or-review)`,
    top?.subcategory === expectedSub,
    `got ${top?.subcategory || 'nothing'} @ ${top?.score.toFixed(3) || 'n/a'}`);
}

// "makeup artist - bridal" is a genuine near-tie between "Makeup Artists"
// and "Bridal Makeup Artists" -- both real, both plausible, both land in
// the top-3 the provider reviews, so the bar here is "the right answer is
// offered", not "the right answer is ranked #1".
{
  const result = show('makeup artist - bridal');
  assert('"makeup artist - bridal" offers "Bridal Makeup Artists" among its top-3 candidates',
    result.candidates.some(c => c.subcategory === 'Bridal Makeup Artists'));
}

// "catering services" is a known, accepted gap: pure edit-distance/token
// overlap doesn't do real linguistic stemming, so "catering" doesn't score
// as close enough to "caterers" (different suffix, same root) to win the
// top slot outright. It still lands in REVIEW rather than a false
// CONFIDENT or a silent NO MATCH, so the provider sees candidates to
// choose from -- that's the honest bar for an in-house matcher, not a
// perfect guess on every phrasing.
{
  const result = show('catering services');
  assert('"catering services" lands in REVIEW (not confident, not empty) -- known stemming gap, not silently dropped',
    !result.confident && result.candidates.length > 0);
}

console.log('\n== Bare parent-category names -- should surface subcategories under that parent ==');
for (const [query, expectedParent] of [
  ['Photography', 'Photography & Videography'],
  ['Venue', 'Venues'],
  ['Decor', 'Decoration & Styling'],
]) {
  const result = show(query);
  assert(`"${query}" top candidate's parent is "${expectedParent}"`,
    result.candidates[0]?.parent === expectedParent,
    `got parent ${result.candidates[0]?.parent}`);
}

console.log('\n== Genuinely unrelated text -- should NOT be confident, ideally no strong candidates ==');
for (const query of ['xyzzy plugh', 'Q4 revenue summary', '###', 'asdkfjasldkfj']) {
  const result = show(query);
  assert(`"${query}" is not confident`, !result.confident);
}

console.log('\n== Duplicate-title check (Step 7 reuse of similarityScore, two tiers) ==');
function dupTier(score) {
  if (score >= DUPLICATE_THRESHOLD) return 'LIKELY DUPLICATE (excluded by default)';
  if (score >= POSSIBLE_DUPLICATE_THRESHOLD) return 'possibly similar (included, flagged for a look)';
  return 'distinct';
}
for (const [a, b, expectTier] of [
  ['Wedding Stage Decoration', 'Wedding Stage Decoration', 'LIKELY DUPLICATE (excluded by default)'],
  ['Wedding Stage Decoration', 'Wedding Stage Decor', 'possibly similar (included, flagged for a look)'],
  ['Wedding Stage Decoration', 'Birthday Balloon Arch', 'distinct'],
  // Same root title, different tier name -- legitimately two different
  // real packages, but sharing "Catering Package" verbatim is exactly the
  // kind of thing worth a soft, non-blocking heads-up (included by
  // default either way).
  ['Premium Catering Package', 'Budget Catering Package', 'possibly similar (included, flagged for a look)'],
]) {
  const score = similarityScore(a, b);
  const tier = dupTier(score);
  console.log(`  "${a}" vs "${b}" = ${score.toFixed(3)} -> ${tier}`);
  assert(`"${a}" vs "${b}" tier="${expectTier}"`, tier === expectTier, `score ${score.toFixed(3)}`);
}

console.log('\n== Category-lock filtering (Step 6) -- an established provider, locked to Food & Beverages ==');
{
  const rows = [
    { idx: 0, title: 'A', chosenCategory: 'Caterers', duplicate: null, includeDuplicateAnyway: false, skipRow: false },
    { idx: 1, title: 'B', chosenCategory: 'Bartending Services', duplicate: null, includeDuplicateAnyway: false, skipRow: false },
    { idx: 2, title: 'C', chosenCategory: 'Wedding Photography', duplicate: null, includeDuplicateAnyway: false, skipRow: false }, // wrong parent
    { idx: 3, title: 'D', chosenCategory: 'DJs', duplicate: null, includeDuplicateAnyway: false, skipRow: false }, // wrong parent
  ];
  const groups = deriveReviewGroups(rows, 'Food & Beverages', taxonomy.getParentCategory);
  assert('locked provider: effectiveLock stays the existing lock', groups.effectiveLock === 'Food & Beverages');
  assert('locked provider: 2 in-category rows ready', groups.readyRows.length === 2);
  assert('locked provider: 2 out-of-category rows excluded, not silently dropped', groups.mismatchedRows.length === 2);
  assert('locked provider: excluded rows are the actual mismatched ones (C, D)',
    groups.mismatchedRows.map(r => r.title).sort().join(',') === 'C,D');
  assert('locked provider: mismatched rows never appear in readyRows too', !groups.readyRows.some(r => groups.mismatchedRows.includes(r)));
}

console.log('\n== Category-lock filtering (Step 6) -- first-ever import, no lock yet, establishes majority parent ==');
{
  const rows = [
    { idx: 0, title: 'A', chosenCategory: 'Caterers', duplicate: null, includeDuplicateAnyway: false, skipRow: false },
    { idx: 1, title: 'B', chosenCategory: 'Bartending Services', duplicate: null, includeDuplicateAnyway: false, skipRow: false },
    { idx: 2, title: 'C', chosenCategory: 'Dessert Counters', duplicate: null, includeDuplicateAnyway: false, skipRow: false },
    { idx: 3, title: 'D', chosenCategory: 'Wedding Photography', duplicate: null, includeDuplicateAnyway: false, skipRow: false }, // minority parent
  ];
  const groups = deriveReviewGroups(rows, null, taxonomy.getParentCategory);
  assert('first import: majority parent (Food & Beverages, 3/4 rows) becomes the new lock', groups.effectiveLock === 'Food & Beverages');
  assert('first import: 3 majority-parent rows ready', groups.readyRows.length === 3);
  assert('first import: minority-parent row excluded, tracked not dropped', groups.mismatchedRows.length === 1 && groups.mismatchedRows[0].title === 'D');
}

console.log('\n== Duplicate opt-back-in (Step 7) -- includeDuplicateAnyway moves a row from excluded to ready ==');
{
  const base = { idx: 0, title: 'A', chosenCategory: 'Caterers', skipRow: false };
  const excluded = deriveReviewGroups([{ ...base, duplicate: { tier: 'likely' }, includeDuplicateAnyway: false }], 'Food & Beverages', taxonomy.getParentCategory);
  assert('likely-duplicate row is excluded by default', excluded.readyRows.length === 0 && excluded.likelyDupRows.length === 1);
  const included = deriveReviewGroups([{ ...base, duplicate: { tier: 'likely' }, includeDuplicateAnyway: true }], 'Food & Beverages', taxonomy.getParentCategory);
  assert('opting back in moves it to ready', included.readyRows.length === 1 && included.likelyDupRows.length === 0);
}

console.log('\n== Live taxonomy read (not frozen) -- picks up a category registered mid-session ==');
{
  const before = matchCategory('Drone Light Shows', taxonomy);
  assert('before registration: "Drone Light Shows" is not confident (category does not exist yet)', !before.confident);

  taxonomy.registerCustomCategories([{ name: 'Aerial Entertainment', icon: '🚁', subcategories: ['Drone Light Shows', 'Fireworks Displays'] }]);

  const after = matchCategory('Drone Light Shows', taxonomy);
  assert('after registerCustomCategories: matchCategory (same taxonomy import, no re-require) now matches it confidently',
    after.confident && after.candidates[0]?.subcategory === 'Drone Light Shows' && after.candidates[0]?.parent === 'Aerial Entertainment');
}

console.log(`\n${passCount} passed, ${failCount} failed (thresholds: confident >= ${CONFIDENT_THRESHOLD}, review floor >= ${REVIEW_FLOOR})`);
process.exit(failCount > 0 ? 1 : 0);
