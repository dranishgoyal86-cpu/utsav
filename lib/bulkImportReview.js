// Pure grouping logic for the bulk-import review step
// (screens/provider/BulkImportServices.js) -- split out from the component
// so the category-lock filtering (Step 6 of the brief) is independently
// testable (scripts/verifyBulkImportMatch.js) rather than only reachable
// by clicking through the real screen.
//
// Takes the current row list (each row already carrying a `chosenCategory`
// once matched/picked, or null if still unresolved) plus the provider's
// existing locked parent category (or null on a first-ever import), and
// returns every derived grouping the review screen needs. Recomputing this
// fresh off current row state (rather than caching it) is what lets a
// provider's in-review picks -- confirming an uncertain category, opting a
// duplicate back in -- immediately ripple through to what's "ready".

export function deriveReviewGroups(rows, lockedParent, getParentCategoryFn) {
  const activeRows = rows.filter(r => !r.skipRow);
  const withCategory = activeRows.filter(r => r.chosenCategory);
  const needsCategoryPick = activeRows.filter(r => !r.chosenCategory);

  // First-ever import (no locked parent yet): the account's new category
  // is whichever parent most of the resolved rows agree on. An established
  // provider keeps their existing lock untouched.
  let effectiveLock = lockedParent;
  if (!effectiveLock) {
    const counts = {};
    for (const r of withCategory) {
      const p = getParentCategoryFn(r.chosenCategory);
      if (p) counts[p] = (counts[p] || 0) + 1;
    }
    let best = null, bestCount = 0;
    for (const [p, c] of Object.entries(counts)) if (c > bestCount) { best = p; bestCount = c; }
    effectiveLock = best;
  }

  const inLock = r => getParentCategoryFn(r.chosenCategory) === effectiveLock;
  const readyRows = withCategory.filter(r => inLock(r) && !(r.duplicate?.tier === 'likely' && !r.includeDuplicateAnyway));
  const likelyDupRows = withCategory.filter(r => inLock(r) && r.duplicate?.tier === 'likely' && !r.includeDuplicateAnyway);
  const mismatchedRows = withCategory.filter(r => !inLock(r));

  return {
    effectiveLock,
    needsCategoryPick,
    readyRows,
    likelyDupRows,
    mismatchedRows,
    canImport: needsCategoryPick.length === 0 && readyRows.length > 0,
  };
}
