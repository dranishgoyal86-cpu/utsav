// Launch Verification & Hardening Pass — legacy long-name overflow fix for
// ToranCoverCard.js, extracted here (no react-native import) so it's
// directly unit-testable via the same babel+node loader every
// scripts/verify*.js in this repo uses (requiring react-native itself
// outside Metro throws — its package entry assumes the native/web
// runtime). ToranCoverCard.js imports these instead of defining them
// locally; behavior is unchanged, this is a pure extraction.
//
// Found via the Production Integration Wave's real Playwright QA: a
// realistic full first+last name pair (e.g. "Aishwarya Venkataraman" /
// "Siddharth Ranganathan") wraps to 2 lines each at ToranCoverCard's fixed
// name size, and with zero spacing compaction anywhere in that file (unlike
// StaticInviteCard.js, which has always had computeCompaction()), the
// extra line height pushes the mandatory bottom motif/date/venue past the
// card's fixed 320x400 `overflow:hidden` bounds. Same deterministic,
// non-adjustsFontSizeToFit-reliant approach as StaticInviteCard.js (that
// prop doesn't reliably auto-shrink on react-native-web): a hard per-word
// font ceiling (guards one long/hyphenated token that can't wrap at all)
// combined with a length-based penalty, then a spacing compaction when a
// name is estimated to still need 2 lines even at the shrunk size. A
// normal short name (the common case) hits none of these thresholds and
// renders at the exact same size/spacing as before this fix.
export const CARD_CONTENT_WIDTH = 288; // 320 card width - 16px padding each side
export const WORD_FIT_FACTOR = 0.65; // same empirical width-per-char estimate as StaticInviteCard.js

export function longestWordChars(text) {
  if (!text) return 0;
  return Math.max(0, ...String(text).split(/\s+/).map((w) => w.length));
}

export function maxFontSizeForWord(chars) {
  if (chars <= 0) return 99;
  return Math.floor(CARD_CONTENT_WIDTH / (WORD_FIT_FACTOR * chars));
}

export function estimatedLines(text, fontSize) {
  if (!text) return 0;
  const charsPerLine = CARD_CONTENT_WIDTH / (fontSize * WORD_FIT_FACTOR);
  return Math.ceil(text.length / charsPerLine);
}

// `names` is the couple's two names, or a single name/eventName fallback —
// whichever is present. Both names share one font size (they're meant to
// read as a consistent pair), computed from whichever name is more
// constraining.
export function fitNames(names, baseSize) {
  const present = (names || []).filter(Boolean);
  if (!present.length) return { fontSize: baseSize, compaction: 0 };
  const longestWord = Math.max(0, ...present.map(longestWordChars));
  const longestTotal = Math.max(0, ...present.map((n) => n.length));
  const wordFitFontSize = maxFontSizeForWord(longestWord);
  const lengthPenalty = longestTotal > 14 ? Math.min(baseSize - 18, Math.floor((longestTotal - 14) * 0.5)) : 0;
  const fontSize = Math.max(14, Math.min(baseSize, wordFitFontSize, baseSize - lengthPenalty));
  const compaction = present.filter((n) => estimatedLines(n, fontSize) >= 2).length; // 0, 1, or 2
  return { fontSize, compaction };
}
