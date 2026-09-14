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

// "an event planning app should understand that maximum will be allocated
// to food and catering... event planner should modify its content or
// activities offered as per the budget" — this estimates the MENU AS A
// WHOLE SPREAD (total dish count + live counters + cuisine mix), the same
// way real Indian caterers actually quote a per-plate rate, rather than
// pricing individual dishes. Pricing ~180 individual catalog dishes
// (lib/menuLibrary.js) would mean inventing precision no source actually
// gives — nobody prices "how much of the plate is the dal vs the dessert."
// Tier bands and live-counter uplifts below are sourced from public Indian
// wedding/event catering pricing pages (Sept 2026): budget spreads (8-12
// dishes, no live counters) run ₹600-1,200/plate, mid-tier (15-18 dishes,
// 1-2 counters) ₹1,200-2,000, premium (20-25 dishes, 3-4 counters)
// ₹2,000-3,500, luxury (30+, 5+ counters) ₹3,500-6,000; each live counter
// adds roughly ₹150-350/plate (chaat/dosa counters run lower, sushi/
// pan-Asian higher — this uses a blended average since Utsav's catalog
// doesn't yet distinguish counter "fanciness"); vegetarian-only spreads run
// ₹200-500/plate cheaper than mixed veg+non-veg. The Thai/Asian and Mexican
// cuisine bump is NOT directly sourced the same way — it's a reasonable
// inference (continental/fusion catering is a known-pricier segment in
// India) rather than a cited figure, and is flagged as such in `basis`.
const MENU_TIER_BANDS = [
  { maxDishes: 12, label: 'Budget-style spread', low: 600, high: 1200 },
  { maxDishes: 19, label: 'Mid-range spread', low: 1200, high: 2000 },
  { maxDishes: 27, label: 'Premium spread', low: 2000, high: 3500 },
  { maxDishes: Infinity, label: 'Luxury spread', low: 3500, high: 6000 },
];
const LIVE_COUNTER_UPLIFT = { low: 150, high: 350 };
const VEG_ONLY_DISCOUNT = { low: 200, high: 500 };
const FUSION_CUISINE_BUMP = { low: 150, high: 300 };
const FUSION_CUISINES = ['thai-asian', 'mexican'];

// context: { dishCount, liveCounterCount = 0, cuisines = [], guestCount,
// isVegOnly = false }. Returns per-plate AND total ranges, or
// { available: false } for an empty menu (nothing to estimate yet).
export function estimateMenuSpread(context = {}) {
  const { dishCount = 0, liveCounterCount = 0, cuisines = [], guestCount, isVegOnly = false } = context;
  if (dishCount <= 0 || !guestCount) return { available: false };

  const tier = MENU_TIER_BANDS.find(b => dishCount <= b.maxDishes);
  let low = tier.low;
  let high = tier.high;
  const notes = [`${tier.label.toLowerCase()} (${dishCount} dishes)`];

  if (liveCounterCount > 0) {
    low += liveCounterCount * LIVE_COUNTER_UPLIFT.low;
    high += liveCounterCount * LIVE_COUNTER_UPLIFT.high;
    notes.push(`${liveCounterCount} live counter${liveCounterCount > 1 ? 's' : ''}`);
  }

  const hasFusion = cuisines.some(c => FUSION_CUISINES.includes(c));
  if (hasFusion) {
    low += FUSION_CUISINE_BUMP.low;
    high += FUSION_CUISINE_BUMP.high;
    notes.push('Thai/Asian or Mexican dishes (estimated bump, not directly sourced)');
  }

  if (isVegOnly) {
    low = Math.max(0, low - VEG_ONLY_DISCOUNT.high);
    high = Math.max(low, high - VEG_ONLY_DISCOUNT.low);
    notes.push('veg-only discount');
  }

  return {
    available: true,
    perPlateLow: Math.round(low),
    perPlateHigh: Math.round(high),
    totalLow: Math.round(low * guestCount),
    totalHigh: Math.round(high * guestCount),
    tierLabel: tier.label,
    basis: `Estimated from ${notes.join(', ')} — typical Indian catering pricing, not a quote.`,
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
