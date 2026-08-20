// Reciprocity flagging is UPWARD-ONLY, always. This module never computes,
// sorts, or surfaces anything about guests who gave less than typical or
// nothing at all — there is no "gave less" flag, no ranking by amount, and
// no code path that could be adapted into one without rewriting this file.
// Every threshold here is relative to the median gift for the specific
// event being evaluated, never a hardcoded rupee amount — see
// computeEventMedian. Flags are suggestions only; nothing in this module
// writes anywhere or changes a guest's assigned tier.

// Filters to monetary (cash/upi) gifts with a real amount and returns the
// median. Fewer than 3 monetary gifts on the event means a median isn't a
// meaningful signal yet, so this returns 0 — callers must treat 0 as "no
// flagging," not "everyone gave zero."
export function computeEventMedian(gifts) {
  const amounts = (gifts || [])
    .filter(g => (g.gift_type === 'cash' || g.gift_type === 'upi') && g.amount != null)
    .map(g => Number(g.amount))
    .sort((a, b) => a - b);

  if (amounts.length < 3) return 0;

  const mid = Math.floor(amounts.length / 2);
  return amounts.length % 2 === 0
    ? (amounts[mid - 1] + amounts[mid]) / 2
    : amounts[mid];
}

// `gifts` here is the same monetary-gift shape computeEventMedian reads,
// with one addition the caller must attach before calling this: a
// `guestName` field per gift (this module has no guest table to join
// against itself — it only ever receives what it's given).
//
// Tier hierarchy is derived from `estimated_value` ascending — the tier
// with the highest value is "the top tier." A guest already sitting on the
// top tier never gets a flag, at any ratio.
export function computeReciprocityFlags(gifts, returnGifts, tiers, median) {
  if (!median || median <= 0) return [];
  if (!tiers || tiers.length < 1) return [];

  const sortedTiers = [...tiers].sort((a, b) => (a.estimated_value || 0) - (b.estimated_value || 0));
  const topTierId = sortedTiers[sortedTiers.length - 1]?.id;

  const returnGiftByGuest = new Map((returnGifts || []).map(rg => [rg.guest_id, rg]));

  const monetaryGifts = (gifts || []).filter(
    g => g.guest_id && (g.gift_type === 'cash' || g.gift_type === 'upi') && g.amount != null
  );

  const flags = [];

  for (const gift of monetaryGifts) {
    const rg = returnGiftByGuest.get(gift.guest_id);
    if (rg?.suggestion_dismissed) continue;

    const currentTierId = rg?.tier_id || null;
    if (currentTierId === topTierId) continue; // already at the top, nowhere higher to suggest

    const ratio = Number(gift.amount) / median;

    let level = null;
    if (ratio >= 5) level = 'high';
    else if (ratio >= 2.5) level = 'moderate';
    if (!level) continue; // hard floor — nothing below 2.5x ever produces a flag

    const currentIndex = currentTierId ? sortedTiers.findIndex(t => t.id === currentTierId) : -1;

    let suggestedTierId;
    if (level === 'high') {
      suggestedTierId = topTierId;
    } else {
      const nextTier = sortedTiers[currentIndex + 1];
      if (!nextTier) continue; // no tier above current — nothing to suggest
      suggestedTierId = nextTier.id;
    }

    const suggestedIndex = sortedTiers.findIndex(t => t.id === suggestedTierId);
    if (suggestedIndex <= currentIndex) continue; // guard: only ever suggest strictly upward

    flags.push({
      guestId: gift.guest_id,
      guestName: gift.guestName || '',
      amount: Number(gift.amount),
      ratio,
      level,
      currentTierId,
      suggestedTierId,
      reason: `Gave about ${Math.round(ratio)}x the typical gift at this event`,
    });
  }

  return flags;
}

// 'to_be_posted' folds into the `posted` bucket (committed to a postal
// send, whether already dispatched or about to be) rather than getting a
// 5th counter — deliberate simplification, not an oversight. A guest with
// no return_gifts row at all (not yet touched) counts as pending.
export function summarizeReturnGifts(guests, returnGifts, tiers) {
  const returnGiftByGuest = new Map((returnGifts || []).map(rg => [rg.guest_id, rg]));
  const tierById = new Map((tiers || []).map(t => [t.id, t]));

  let pending = 0, given = 0, posted = 0, notApplicable = 0, totalEstimatedCost = 0;

  for (const guest of guests || []) {
    const rg = returnGiftByGuest.get(guest.id);
    const status = rg?.status || 'pending';

    if (status === 'given') given++;
    else if (status === 'posted' || status === 'to_be_posted') posted++;
    else if (status === 'not_applicable') notApplicable++;
    else pending++;

    if (status !== 'not_applicable') {
      const tier = tierById.get(rg?.tier_id);
      if (tier?.estimated_value) totalEstimatedCost += tier.estimated_value;
    }
  }

  return { pending, given, posted, notApplicable, totalEstimatedCost };
}
