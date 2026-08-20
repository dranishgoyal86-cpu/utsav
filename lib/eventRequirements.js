// This module must stay free of React and Supabase imports so it remains
// fully unit-testable via a plain Node script (see scripts/verifyRequirements.js).
// No hardcoded event-type conditionals belong here either — every event
// type, sub-event, and requirement comes entirely from data the caller
// passes in (ultimately sourced from the event_requirements table); this
// file only resolves and shapes that data, it never branches on a
// specific event type's slug or name.

// context: { subEventId, guestCount, childAge } — all optional.
export function resolveRequirements(requirements, context = {}) {
  const { subEventId = null, guestCount = null, childAge = null } = context;

  const relevant = (requirements || []).filter(r => {
    const isEventLevel = r.sub_event_id === null || r.sub_event_id === undefined;
    if (!isEventLevel && r.sub_event_id !== subEventId) return false;

    if (guestCount != null) {
      if (r.min_guest_count != null && guestCount < r.min_guest_count) return false;
      if (r.max_guest_count != null && guestCount > r.max_guest_count) return false;
    }
    if (childAge != null) {
      if (r.min_age != null && childAge < r.min_age) return false;
      if (r.max_age != null && childAge > r.max_age) return false;
    }
    return true;
  });

  // Dedupe by category. When both an event-level row and a matching
  // sub-event row survive the filter above for the same category, the
  // sub-event row wins outright (not just its contextual_label) — its
  // priority is the more specific, contextually correct one (e.g. "DJ &
  // Music" is merely recommended for a wedding overall but essential
  // specifically at the sangeet).
  const byCategory = new Map();
  for (const r of relevant) {
    const existing = byCategory.get(r.category);
    if (!existing) {
      byCategory.set(r.category, r);
      continue;
    }
    const existingIsSubEvent = existing.sub_event_id != null;
    const currentIsSubEvent = r.sub_event_id != null;
    if (currentIsSubEvent && !existingIsSubEvent) {
      byCategory.set(r.category, r);
    }
  }

  const bySortOrder = (a, b) => (a.sort_order || 0) - (b.sort_order || 0);
  const bucket = { essential: [], recommended: [], optional: [] };
  for (const r of byCategory.values()) {
    if (bucket[r.priority]) bucket[r.priority].push(r);
  }
  bucket.essential.sort(bySortOrder);
  bucket.recommended.sort(bySortOrder);
  bucket.optional.sort(bySortOrder);
  return bucket;
}

// The real booking lifecycle in this app (confirmed against
// CreateBookingScreen.js/BookingsScreen.js) is payment_pending -> confirmed
// -> completed -> reviewed, with cancelled/payment_failed as the two "not
// handled" terminal states — there is no literal 'pending' status string in
// production data, so "handled" is anything that isn't cancelled or failed,
// not a narrow pending/confirmed string match.
const INACTIVE_BOOKING_STATUSES = new Set(['cancelled', 'payment_failed']);

export function computeChecklistProgress(resolved, bookings, arrangedCategories = []) {
  const arrangedSet = new Set(arrangedCategories || []);
  const bookedCategories = new Set(
    (bookings || [])
      .filter(b => !INACTIVE_BOOKING_STATUSES.has(b.status))
      .map(b => b.category)
  );

  const isHandled = category => bookedCategories.has(category) || arrangedSet.has(category);

  const essentialTotal = resolved.essential.length;
  const essentialHandled = resolved.essential.filter(r => isHandled(r.category)).length;
  const recommendedTotal = resolved.recommended.length;
  const recommendedHandled = resolved.recommended.filter(r => isHandled(r.category)).length;

  // Recommended/optional never block completion — percent is essentials
  // only. No essentials at all counts as fully complete (nothing required).
  const percentComplete = essentialTotal > 0
    ? Math.round((essentialHandled / essentialTotal) * 100)
    : 100;

  return { essentialTotal, essentialHandled, recommendedTotal, recommendedHandled, percentComplete };
}

// Essentials get the bulk of the budget, recommended a smaller share;
// optional only ever gets what's left over after those (often nothing).
// Returns null when totalBudget is falsy — never invents a budget.
export function suggestBudgetSplit(resolved, totalBudget) {
  if (!totalBudget) return null;

  const ESSENTIAL_SHARE = 0.7;
  const RECOMMENDED_SHARE = 0.25;

  const essentialPool = resolved.essential.length > 0 ? totalBudget * ESSENTIAL_SHARE : 0;
  const recommendedPool = resolved.recommended.length > 0 ? totalBudget * RECOMMENDED_SHARE : 0;
  const remainder = Math.max(0, totalBudget - essentialPool - recommendedPool);
  const optionalPool = resolved.optional.length > 0 ? remainder : 0;

  function splitEvenly(items, pool) {
    const out = {};
    if (items.length === 0) return out;
    const each = Math.round(pool / items.length);
    items.forEach(r => { out[r.category] = each; });
    return out;
  }

  return {
    essential: splitEvenly(resolved.essential, essentialPool),
    recommended: splitEvenly(resolved.recommended, recommendedPool),
    optional: splitEvenly(resolved.optional, optionalPool),
    totalBudget,
  };
}

// Flat list of requirement rows (not bare category strings — the row
// carries priority/label, which Phase 2's notify-me UI needs) whose
// category doesn't appear in availableCategories.
export function findUnsuppliedCategories(resolved, availableCategories) {
  const available = new Set(availableCategories || []);
  return [...resolved.essential, ...resolved.recommended, ...resolved.optional]
    .filter(r => !available.has(r.category));
}
