// In-house fuzzy string matching -- no dependency, per this project's
// established aversion to unnecessary libraries (custom date picker,
// hand-rolled coach marks). Built for the bulk-import taxonomy matcher
// (screens/provider/BulkImportServices.js), where the target set is ~300
// short, distinct, human-written category names -- not large-corpus search,
// which is the case where a real fuzzy library actually earns its keep.
//
// Two signals blended together, because they catch different failure
// modes on their own:
//   - token overlap: shared WORDS matter more than shared characters for
//     short phrases ("Wedding Photography" vs "Photography for Weddings"
//     share every token in a different order -- a pure edit-distance score
//     would punish that hard for no good reason).
//   - edit distance: catches typos/near-misses that share few or no whole
//     tokens ("Caterrs" vs "Caterers" -- one transposition, zero shared
//     tokens after normalization drops the 's').

// Unicode combining diacritical marks (U+0300-U+036F) -- written as escape
// codes, not literal characters, to avoid an editor/terminal mangling
// multi-byte bytes in this source file.
const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD').replace(COMBINING_MARKS, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(str) {
  const n = normalize(str);
  return n ? n.split(' ') : [];
}

// Classic Levenshtein, O(n*m) with two rolling rows (not a full matrix --
// these strings are short, but no reason to over-allocate).
export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// How alike two individual (already-normalized) words are, 0-1. A single
// edit (one added/removed/changed letter -- the shape of a plain English
// plural like "florist"/"florists" or "dj"/"djs", or a one-letter typo)
// counts as effectively the same word regardless of how large a fraction
// of a short word that one letter is -- verified live in
// scripts/verifyBulkImportMatch.js that without this, short words
// (2-3 letters) were getting crushed by the plain edit-distance ratio.
function wordSimilarity(a, b) {
  if (a === b) return 1;
  const dist = levenshtein(a, b);
  if (dist <= 1) return 0.9;
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
}

// A word only counts as "shared" if it's genuinely close to a word on the
// other side -- catches the single most common real-world mismatch this
// matcher sees: plain English plurals ("florist"/"Florists",
// "venue"/"Venues", "caterer"/"Caterers"). An earlier version required
// exact per-token string equality, which scored those pairs at 0 --
// crushing an otherwise near-perfect match down below the review floor
// (verified live in scripts/verifyBulkImportMatch.js before this fix).
const WORD_MATCH_MIN = 0.75;

// Blend of Jaccard overlap (penalizes extra words on either side) and
// containment (rewards one phrase being a subset of the other's words,
// e.g. "Photography" fully inside "Wedding Photography") -- real category
// text is very often one a prefix/qualifier of the other, and containment
// alone is what keeps that from scoring low just because the lengths differ.
// Word-level matching is itself fuzzy (see wordSimilarity above), not
// exact-string membership.
export function tokenOverlapScore(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const usedB = new Set();
  let sharedWeight = 0;
  for (const t of ta) {
    let best = 0, bestIdx = -1;
    tb.forEach((o, i) => {
      if (usedB.has(i)) return;
      const sim = wordSimilarity(t, o);
      if (sim > best) { best = sim; bestIdx = i; }
    });
    if (best >= WORD_MATCH_MIN) { sharedWeight += best; usedB.add(bestIdx); }
  }

  const union = ta.length + tb.length - sharedWeight;
  const jaccard = sharedWeight / Math.max(union, 1);
  const containment = sharedWeight / Math.min(ta.length, tb.length);
  return (jaccard * 0.5) + (containment * 0.5);
}

export function editSimilarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - (levenshtein(na, nb) / maxLen);
}

// 0-1 blended score. Weighted toward token overlap -- word-level meaning
// matters more than raw character closeness for category-style phrases --
// with edit distance as the tiebreaker/typo-catcher.
export function similarityScore(a, b) {
  return (tokenOverlapScore(a, b) * 0.6) + (editSimilarity(a, b) * 0.4);
}

// Thresholds, chosen against the messy-name test set in
// scripts/verifyBulkImportMatch.js (real examples: typos, reordered words,
// bare parent-category names, genuinely unrelated text) rather than picked
// blind:
//   >= CONFIDENT_THRESHOLD  -- proceeds automatically, no review needed
//   >= REVIEW_FLOOR         -- shown to the provider as a candidate to confirm
//   <  REVIEW_FLOOR         -- not even offered as a candidate (too weak to
//                             be useful -- provider picks manually instead)
export const CONFIDENT_THRESHOLD = 0.72;
export const REVIEW_FLOOR = 0.32;
export const CANDIDATE_COUNT = 3;

// Two tiers for Step 7's duplicate-title check -- two category *names*
// being topically related is a much lower bar than two service *titles*
// plausibly being the same listing re-imported, so both thresholds sit
// well above the category-matching ones above.
//   >= DUPLICATE_THRESHOLD          -- likely the same listing; defaults
//                                      to excluded, provider must opt back in
//   >= POSSIBLE_DUPLICATE_THRESHOLD -- similar enough to flag for a look
//                                      ("Wedding Stage Decoration" vs
//                                      "Wedding Stage Decor" scores here,
//                                      0.667 -- a real case found live
//                                      against this taxonomy's own naming
//                                      variance) but defaults to included,
//                                      since it's plausibly just two
//                                      different real packages
export const DUPLICATE_THRESHOLD = 0.80;
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.55;

// Matches free-text (a spreadsheet's category/type column) against the
// REAL taxonomy, read at call time via a fresh require -- not a
// module-level snapshot -- so a category approved mid-session via
// registerCustomCategories() (see vendorTaxonomy.js, merged in from the
// custom_categories table at app startup) is matchable immediately, same
// as every other taxonomy consumer in the app.
export function matchCategory(rawText, taxonomy) {
  const query = (rawText || '').trim();
  if (!query) return { query, confident: false, candidates: [] };

  const { SERVICE_CATEGORIES, CATEGORY_NAMES, getParentCategory } = taxonomy;

  // SERVICE_CATEGORIES can contain the same subcategory NAME under more
  // than one parent (see vendorTaxonomy.js's own comment on "Return
  // Gifts"/"Magicians") -- getParentCategory always resolves to the first-
  // registered parent regardless of which duplicate we're looking at, so
  // dedupe by name first or the same candidate would appear twice.
  const uniqueSubs = [...new Set(SERVICE_CATEGORIES)];

  const scored = uniqueSubs.map(sub => ({
    subcategory: sub,
    parent: getParentCategory(sub),
    score: similarityScore(query, sub),
  }));

  // A row that just says "Catering" or "Venue" with no subcategory
  // granularity should still surface real candidates -- boost every
  // subcategory under a parent whose own name matches well, rather than
  // leaving the match to whichever subcategory string happens to be
  // textually closest to the bare parent name.
  for (const parent of CATEGORY_NAMES) {
    const parentScore = similarityScore(query, parent);
    if (parentScore > 0.5) {
      for (const s of scored) {
        if (s.parent === parent) s.score = Math.max(s.score, parentScore * 0.85);
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, CANDIDATE_COUNT).filter(c => c.score >= REVIEW_FLOOR);
  const top = candidates[0];

  return {
    query,
    confident: !!top && top.score >= CONFIDENT_THRESHOLD,
    candidates,
  };
}
