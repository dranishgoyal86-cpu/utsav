// Launch Verification & Hardening Pass — the pure array-manipulation logic
// behind RepeatableSectionEditor.js's Move Up/Down/Add/Remove buttons,
// extracted here (no react-native import) so it's directly unit-testable
// via the same babel+node loader every scripts/verify*.js in this repo
// uses, without needing to require react-native outside Metro (which
// throws — RN's package entry assumes the Metro/native runtime).
// RepeatableSectionEditor.js imports these instead of defining them
// locally; behavior is unchanged, this is a pure extraction.
export function newSectionItem(sortOrder) {
  return {
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '', description: '', date: '', startTime: '', endTime: '', venue: '', personLabel: '',
    sortOrder,
  };
}

export function withResyncedSortOrder(items) {
  return items.map((item, i) => ({ ...item, sortOrder: i }));
}

// Swaps items[index] with items[index + direction] (direction: -1 up, +1
// down); a no-op (returns the same array reference) if the target is out
// of bounds, matching the button's own disabled-at-the-edges behavior.
export function reorderSection(items, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return withResyncedSortOrder(next);
}

export function removeSection(items, index) {
  return withResyncedSortOrder(items.filter((_, i) => i !== index));
}

export function addSection(items) {
  return [...items, newSectionItem(items.length)];
}
