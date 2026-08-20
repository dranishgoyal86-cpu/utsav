// This module must stay free of React and Supabase imports so it remains
// fully unit-testable via a plain Node script (see scripts/verifyPlanEngine.js).
//
// Data-shape notes discovered against the live vendor_categories table (not
// assumptions — verified via direct query before writing this):
// - percent_low/percent_high are stored as percentages (e.g. 8.00 meaning
//   8%), not fractions — dividing by 100 before multiplying budgetTotal is
//   required, or estimates come out ~100x too high.
// - percent_of_budget categories (e.g. event-planning) have null
//   metro/tier2 columns — there is no currency reference band to fall back
//   to for them, so percent_of_budget is handled as its own path rather
//   than flowing through the metro/tier2 band selector.
// - The venues vendor_categories row also has null metro/tier2 (it's
//   price_from_listings-only) — so when fewer than three real venues match,
//   estimateVenue has no numeric reference band to fall back to either;
//   it returns unavailable rather than inventing one.

export function billableGuests(guestCount, venue) {
  return Math.max(guestCount || 0, venue?.min_guest_guarantee ?? 0);
}

export function volumeMultiplier(billable) {
  if (billable > 300) return 0.70;
  if (billable >= 150) return 0.85;
  return 1.0;
}

// Source precedence: a real per-city service median, then a national
// median, then the vendor_categories reference band. serviceMedian shape:
// { city: {low, high, count, basis?} | null, national: {low, high, count, basis?} | null }
function selectBand(category, serviceMedian, context) {
  if (serviceMedian?.city?.low != null && serviceMedian?.city?.high != null) {
    const c = serviceMedian.city;
    return { low: c.low, high: c.high, basis: c.basis || `based on ${c.count} ${context.city || ''} listing${c.count === 1 ? '' : 's'}`.trim() };
  }
  if (serviceMedian?.national?.low != null && serviceMedian?.national?.high != null) {
    const n = serviceMedian.national;
    return { low: n.low, high: n.high, basis: n.basis || `national median across ${n.count} listing${n.count === 1 ? '' : 's'}` };
  }
  const isMetro = context.cityTier !== 'tier2';
  const low = isMetro ? category.metro_low : category.tier2_low;
  const high = isMetro ? category.metro_high : category.tier2_high;
  if (low != null && high != null) {
    return { low, high, basis: 'typical range, no vendors listed yet' };
  }
  return null;
}

function applyPricingModel(band, category, context, venue) {
  const { guestCount, isVegOnly, durationDays, unitCount, hours } = context;
  const { low, high } = band;

  switch (category.pricing_model) {
    case 'flat':
      return { low, high };

    case 'per_guest': {
      const billable = billableGuests(guestCount, venue);
      const mult = volumeMultiplier(billable);
      let lo = low * billable * mult;
      let hi = high * billable * mult;
      if (category.slug === 'catering' && !isVegOnly) {
        lo += 200 * billable;
        hi += 500 * billable;
      }
      return { low: Math.round(lo), high: Math.round(hi) };
    }

    case 'per_unit': {
      const units = unitCount ?? 1;
      return { low: low * units, high: high * units };
    }

    case 'per_hour': {
      const h = hours ?? 6;
      return { low: low * h, high: high * h };
    }

    case 'per_day': {
      const days = durationDays ?? 1;
      return { low: low * days, high: high * days };
    }

    default:
      return { low, high };
  }
}

// context: { city, cityTier, guestCount, budgetTotal, isVegOnly, durationDays,
//   unitCount, hours }. serviceMedian: see selectBand comment above, or null.
// venue: a venues row (or null), used for min_guest_guarantee.
export function estimateItem(item, category, context = {}, serviceMedian = null, venue = null) {
  if (!category) return { available: false };
  if (category.quote_on_request) return { available: false, quoteOnRequest: true };

  if (category.pricing_model === 'percent_of_budget') {
    if (context.budgetTotal == null) return { available: false };
    if (category.percent_low == null || category.percent_high == null) return { available: false };
    const percentLow = Number(category.percent_low);
    const percentHigh = Number(category.percent_high);
    return {
      available: true,
      low: Math.round(context.budgetTotal * (percentLow / 100)),
      high: Math.round(context.budgetTotal * (percentHigh / 100)),
      basis: `${percentLow}% to ${percentHigh}% of total budget`,
      quoteOnRequest: false,
    };
  }

  const band = selectBand(category, serviceMedian, context);
  if (!band) return { available: false };

  const priced = applyPricingModel(band, category, context, venue);
  return { available: true, low: priced.low, high: priced.high, basis: band.basis, quoteOnRequest: false };
}

// context: { city, guestCount, isVegOnly }
export function estimateVenue(venues, context = {}) {
  const { city, guestCount, isVegOnly } = context;

  const matching = (venues || []).filter(v =>
    v.city === city &&
    (v.capacity_min == null || guestCount == null || guestCount >= v.capacity_min) &&
    (v.capacity_max == null || guestCount == null || guestCount <= v.capacity_max)
  );

  // Fewer than three real matches would make a low/high range misleading —
  // and unlike other categories, venues has no metro/tier2 reference band in
  // vendor_categories to fall back to (it's price_from_listings-only), so
  // this genuinely has nothing safe to return.
  if (matching.length < 3) {
    return { available: false, basis: 'not enough listed venues in this city and capacity range yet' };
  }

  function venueTotal(v) {
    const billable = billableGuests(guestCount, v);
    const plateRate = isVegOnly ? v.plate_rate_veg : v.plate_rate_nonveg;
    if (v.pricing_model === 'rental_only') return v.rental_amount || 0;
    if (v.pricing_model === 'per_plate_only') return (plateRate || 0) * billable;
    if (v.pricing_model === 'rental_plus_plate') return (v.rental_amount || 0) + (plateRate || 0) * billable;
    return 0;
  }

  const totals = matching.map(venueTotal);
  return {
    available: true,
    low: Math.min(...totals),
    high: Math.max(...totals),
    basis: `based on ${matching.length} venues in ${city}`,
    matchingCount: matching.length,
  };
}

const CONTINGENCY_RATE = 0.10;

function itemCost(item, estimates) {
  const est = estimates?.[item.item_name];
  if (!est || est.available === false) return 0;
  return Math.round((est.low + est.high) / 2);
}

// estimates: { [item_name]: estimateItem() result }. Fills P1 fully, then
// P2, then P3, then P4 with whatever remains — a waterfall, not an even
// split. P5 is off-ladder and never touched, structurally (the loop below
// never iterates it). No budget set returns a clean "not applicable" shape
// rather than falsely flagging everything as over budget.
export function allocateBudget(resolved, estimates, budgetTotal) {
  if (!budgetTotal) {
    return { lines: [], contingency: 0, allocated: 0, remaining: 0, overBudget: false };
  }

  const contingency = Math.round(budgetTotal * CONTINGENCY_RATE);
  let remaining = budgetTotal - contingency;

  const lines = [];
  for (const priority of ['P1', 'P2', 'P3', 'P4']) {
    for (const item of (resolved[priority] || [])) {
      const cost = itemCost(item, estimates);
      const allocated = Math.min(cost, Math.max(remaining, 0));
      lines.push({
        item_name: item.item_name,
        priority,
        category_slug: item.category_slug,
        cost,
        allocated,
        fullyFunded: allocated >= cost,
      });
      remaining -= allocated;
    }
  }

  const allocated = lines.reduce((sum, l) => sum + l.allocated, 0);
  const overBudget = lines.some(l => !l.fullyFunded);

  return {
    lines,
    contingency,
    contingencyLabel: 'Contingency buffer (10%)',
    contingencySubtitle: 'Standard planning practice for unforeseen costs',
    allocated,
    remaining: Math.max(remaining, 0),
    overBudget,
  };
}
