// planLogic.js — shared event-planning logic used by PlanScreen and EventPlanner
import { getParentCategory, resolveParentCategory } from './vendorTaxonomy';
import { EVENT_CATEGORIES, ALL_SUBEVENTS, CATEGORY_BY_ID, labelFor } from './eventTaxonomy';

export { EVENT_CATEGORIES, ALL_SUBEVENTS, CATEGORY_BY_ID, labelFor };

// eventTaxonomy.js's `icon` field is a hint string (not an emoji, so it can
// stay presentation-agnostic for non-RN consumers like the website) — this
// is the one place that translates it for chip rendering here.
const CATEGORY_ICON_EMOJI = {
  rings: '💍', diya: '🪔', cake: '🎂', briefcase: '💼', people: '👥',
  music: '🎵', grad: '🎓', trophy: '🏆', stall: '🎪', flag: '🏛️',
};

// `formData.eventType` stores the CATEGORY id (never a sub-event id) —
// same "subcategory column, derived parent" shape as providers/vendorTaxonomy.
// The specific sub-event (e.g. "Haldi", "AGM / Townhall") lives in
// `formData.subEvent` and is optional/informational — it doesn't drive
// service/venue defaults, which are coarser than 110 individual sub-events
// would justify (see getServiceOptionsFor/getVenueTypesFor below, which do
// special-case the one sub-event — Last Rites — that genuinely needs it).
export const EVENT_TYPES = EVENT_CATEGORIES.map(c => ({
  id: c.id, label: c.label, icon: CATEGORY_ICON_EMOJI[c.icon] || '🎉',
}));

// City picker is grouped so "Delhi NCR" can expand into its satellite
// cities — providers/events still store one concrete city name (e.g.
// "Gurugram"), never the group label itself, so search/matching elsewhere
// (`.eq('city', ...)`) keeps working unchanged. Single-city groups (Mumbai,
// Bangalore, etc.) just select their one member directly, no expansion needed.
export const CITY_GROUPS = [
  { id: 'delhi-ncr', label: 'Delhi NCR', cities: ['Delhi', 'Gurugram', 'Noida', 'Ghaziabad', 'Faridabad'] },
  { id: 'mumbai', label: 'Mumbai', cities: ['Mumbai'] },
  { id: 'bangalore', label: 'Bangalore', cities: ['Bangalore'] },
  { id: 'chennai', label: 'Chennai', cities: ['Chennai'] },
  { id: 'hyderabad', label: 'Hyderabad', cities: ['Hyderabad'] },
];

export const CITIES = CITY_GROUPS.flatMap(g => g.cities);

// ── Service catalog + which ones are relevant per event type ──────────────
// A single source of truth for icon/label so both the "what do you need"
// toggles and the budget breakdown speak the same vocabulary. Funerals
// deliberately get a short, respectful list — no decoration/music/makeup
// defaults, unlike every celebratory type.
export const SERVICE_OPTIONS = {
  catering:    { key: 'needsCatering',    icon: '🍽️', label: 'Catering' },
  decoration:  { key: 'needsDecoration',  icon: '🎊', label: 'Decoration' },
  photography: { key: 'needsPhotography', icon: '📸', label: 'Photography' },
  music:       { key: 'needsMusic',       icon: '🎵', label: 'DJ & Music' },
  mehendi:     { key: 'needsMehendi',     icon: '🌿', label: 'Mehendi' },
  makeup:      { key: 'needsMakeup',      icon: '💄', label: 'Makeup' },
  pandit:      { key: 'needsPandit',      icon: '🙏', label: 'Pandit / Priest' },
  mandap:      { key: 'needsMandap',      icon: '⛩️', label: 'Mandap / Stage' },
  seating:     { key: 'needsSeating',     icon: '🪑', label: 'Seating / Tent' },
  invitations: { key: 'needsInvitations', icon: '💌', label: 'Invitations' },
};

// Category-level defaults — the 10 eventTaxonomy categories, not the old 9
// flat types. "Religious & Ceremonial" spans everything from a festive
// Diwali pandal to Last Rites, which is exactly why a sub-event-level
// override exists below rather than trying to average the two into one
// list that fits neither well.
export const SERVICE_OPTIONS_BY_CATEGORY = {
  wedding:       ['catering', 'decoration', 'photography', 'music', 'mehendi', 'makeup', 'pandit', 'mandap', 'invitations'],
  religious:     ['catering', 'pandit', 'decoration', 'invitations'],
  personal:      ['catering', 'decoration', 'photography', 'music', 'invitations'],
  corporate:     ['catering', 'decoration', 'photography', 'music', 'invitations'],
  social:        ['catering', 'decoration', 'photography', 'invitations'],
  entertainment: ['photography', 'music', 'decoration'],
  educational:   ['catering', 'decoration', 'photography', 'music', 'invitations'],
  sports:        ['catering', 'seating', 'invitations'],
  exhibition:    ['decoration', 'seating', 'invitations'],
  government:    ['seating', 'invitations', 'photography'],
};

const SERVICE_OPTIONS_OVERRIDE_BY_SUBEVENT = {
  last_rites: ['catering', 'pandit', 'seating'],
};

export function getServiceOptionsFor(subEventId, categoryId) {
  return SERVICE_OPTIONS_OVERRIDE_BY_SUBEVENT[subEventId]
    || SERVICE_OPTIONS_BY_CATEGORY[categoryId]
    || SERVICE_OPTIONS_BY_CATEGORY.personal;
}

// ── Venue-type suggestions per category — a curated subset of the real
// Venues category subcategories (vendorTaxonomy.js), not a full cross-import
// (this file has no dependency on the taxonomy elsewhere, and the list here
// only needs to be "reasonable defaults to nudge the picker", not exhaustive).
export const VENUE_TYPES_BY_CATEGORY = {
  wedding:       ['Banquet Halls', 'Farmhouses', 'Lawns & Gardens', 'Hotels & Resorts', 'Heritage Properties'],
  religious:     ['Religious Venues', 'Community Halls', 'Banquet Halls'],
  personal:      ['Banquet Halls', 'Rooftop Venues', 'Clubs', 'Community Halls'],
  corporate:     ['Conference Rooms', 'Convention Centres', 'Hotels & Resorts'],
  social:        ['Banquet Halls', 'Community Halls', 'Clubs'],
  entertainment: ['Convention Centres', 'Clubs', 'Rooftop Venues'],
  educational:   ['Convention Centres', 'Community Halls', 'Conference Rooms'],
  sports:        ['Community Halls', 'Convention Centres'],
  exhibition:    ['Convention Centres', 'Community Halls'],
  government:    ['Convention Centres', 'Community Halls'],
};

const VENUE_TYPES_OVERRIDE_BY_SUBEVENT = {
  last_rites: ['Religious Venues', 'Community Halls'],
};

export function getVenueTypesFor(subEventId, categoryId) {
  return VENUE_TYPES_OVERRIDE_BY_SUBEVENT[subEventId]
    || VENUE_TYPES_BY_CATEGORY[categoryId]
    || VENUE_TYPES_BY_CATEGORY.personal;
}

// Hindi/Hinglish city names — speech recognition in hi-IN often returns
// Devanagari script, and even in Latin script people use old/alt names
// (Bombay, Bengaluru, Madras). Parsing-only; CITIES stays the canonical
// English list everywhere else (chips, filters, display).
const CITY_ALIASES = {
  'दिल्ली': 'Delhi',
  'मुंबई': 'Mumbai', 'बॉम्बे': 'Mumbai', 'bombay': 'Mumbai',
  'बैंगलोर': 'Bangalore', 'बेंगलुरु': 'Bangalore', 'bengaluru': 'Bangalore',
  'चेन्नई': 'Chennai', 'मद्रास': 'Chennai', 'madras': 'Chennai',
  'हैदराबाद': 'Hyderabad',
  'gurgaon': 'Gurugram', 'गुड़गांव': 'Gurugram', 'गुरुग्राम': 'Gurugram',
  'नोएडा': 'Noida', 'ग़ाज़ियाबाद': 'Ghaziabad', 'गाजियाबाद': 'Ghaziabad',
  'फरीदाबाद': 'Faridabad',
};

const GUEST_RANGES = ['Under 50', '50-100', '100-200', '200-500', 'Above 500'];
const BUDGET_RANGES = ['Under ₹50K', '₹50K-1L', '₹1L-3L', '₹3L-10L', 'Above ₹10L'];

const guestMap = {
  'Under 50': 30, '50-100': 75, '100-200': 150,
  '200-500': 350, 'Above 500': 600,
};
const budgetMap = {
  'Under ₹50K': 50000, '₹50K-1L': 100000, '₹1L-3L': 300000,
  '₹3L-10L': 1000000, 'Above ₹10L': 2000000,
};

// Flat per-service cost estimates (wedding events run ~40% higher — bigger
// scale, premium vendors). Catering is per-guest, not flat, so it's handled
// separately in estimateBudget() rather than living in this table.
const SERVICE_BASE_COST = {
  needsDecoration: 40000, needsPhotography: 30000, needsMusic: 15000,
  needsMehendi: 10000, needsMakeup: 15000, needsPandit: 8000,
  needsMandap: 35000, needsSeating: 20000, needsInvitations: 5000,
};

// ── Suggests a starting budget from guest count, selected services, and
// venue-vs-home — a data-driven nudge rather than a cold guess, so the
// budget picker reacts as the host fills in the rest of the form. They can
// still pick a different bucket afterward; this only sets the default.
export function estimateBudget(formData) {
  const guests = formData.exactGuests || guestMap[formData.guestRange] || 100;
  const isWedding = formData.eventType === 'wedding';
  const scale = isWedding ? 1.4 : 1;
  let total = 0;

  if (formData.needsCatering) total += (formData.isNonVeg ? 800 : 600) * guests * scale;
  for (const [key, cost] of Object.entries(SERVICE_BASE_COST)) {
    if (formData[key]) total += cost * scale;
  }
  if (formData.location === 'venue') total += guests * (isWedding ? 800 : 400);

  return Math.max(Math.round(total), 15000);
}

export function suggestBudgetRange(formData) {
  const est = estimateBudget(formData);
  if (est < 50000) return 'Under ₹50K';
  if (est <= 100000) return '₹50K-1L';
  if (est <= 300000) return '₹1L-3L';
  if (est <= 1000000) return '₹3L-10L';
  return 'Above ₹10L';
}

// Match on parent Category, not the exact subcategory string — providers
// are seeded/claimed under specific subcategories (e.g. "Wedding
// Photography", "Event Photography"), so an exact-string match against a
// fixed list would miss almost everything after the taxonomy restructure.
// Shared by provider matching and real-price lookup below, so "the vendors
// we'd recommend" and "the price we quote" are always drawn from the same set.
const RELEVANT_PARENTS = {
  needsCatering: ['Food & Beverages'],
  needsDecoration: ['Decoration & Styling'],
  needsPhotography: ['Photography & Videography'],
  needsMusic: ['Entertainment'],
  needsMehendi: ['Wedding Services'],
  needsMakeup: ['Beauty & Wellness', 'Wedding Services'],
  needsPandit: ['Wedding Services', 'Religious & Cultural Services'],
  needsMandap: ['Decoration & Styling'],
  needsSeating: ['Event Rentals'],
  needsInvitations: ['Invitations & Printing'],
};

// Real listed prices for services matching a category + this event type —
// averages price_from/price_to across whatever's actually listed. Even one
// real, city-matched listing is a better number than a static guess, so
// this doesn't hold out for a minimum sample size; the marketplace is thin
// today (most categories/cities have zero priced listings yet), and this
// naturally gets more accurate as more vendors add real prices — no code
// change needed later, it just starts finding matches. Services without an
// event_types tag are treated as applying to any event type (most listings
// don't bother tagging a general service like a decorator).
function realPriceFor(parents, services, eventType) {
  // formData.eventType is the lowercase taxonomy id ('wedding'), but
  // services.event_types is free-entered/seeded text ('Wedding') — matched
  // case-insensitively rather than assuming either side's casing.
  const eventTypeLower = (eventType || '').toLowerCase();
  const matches = (services || []).filter(s => {
    if (!parents.includes(getParentCategory(s.category))) return false;
    if (s.event_types?.length && !s.event_types.some(et => String(et).toLowerCase() === eventTypeLower)) return false;
    return true;
  });
  if (matches.length === 0) return null;
  const avg = matches.reduce((sum, s) => sum + ((s.price_from || 0) + (s.price_to || s.price_from || 0)) / 2, 0) / matches.length;
  return { amount: Math.round(avg), sampleSize: matches.length };
}

// The static fallback (used only where there's no real listing to price
// off) has no per-date vendor rates to draw from, so it approximates the
// real-world premium instead: India's wedding season (roughly Oct-Feb) runs
// meaningfully higher for wedding vendors specifically, and weekend dates
// cost more across every category. Real listed prices are left alone —
// they're already today's real rates, layering a synthetic multiplier on
// top of an actual quote would make it less accurate, not more.
function seasonMultiplier(eventType, eventDate) {
  if (eventType !== 'wedding' || !eventDate) return 1;
  const month = new Date(eventDate).getMonth(); // 0=Jan
  return (month <= 1 || month >= 9) ? 1.15 : 1; // Jan, Feb, Oct, Nov, Dec
}
function weekendMultiplier(eventDate) {
  if (!eventDate) return 1;
  const day = new Date(eventDate).getDay();
  return (day === 0 || day === 6) ? 1.08 : 1;
}

// ── Generates a full plan (budget breakdown, provider matches, tips) ──
// formData.exactGuests, when set, overrides the guestRange bucket estimate —
// used when someone corrects the guest count to a precise number after the
// plan already exists, so catering cost and the venue note stay accurate.
// `services` (real priced listings for this city, from fetchMarketData) is
// optional — plans built before this existed, or a city with no priced
// listings yet, just fall back to the estimate for every category.
export function generateEventPlan(formData, providers, services = [], avoidProviderIds = []) {
  const guests = formData.exactGuests || guestMap[formData.guestRange] || 100;
  const totalBudget = budgetMap[formData.budgetRange] || 300000;
  const isWedding = formData.eventType === 'wedding';
  const breakdown = [];
  let remaining = totalBudget;
  const dateMultiplier = seasonMultiplier(formData.eventType, formData.eventDate) * weekendMultiplier(formData.eventDate);

  // real: use the actual listed price outright — it's a real quote, not an
  // estimate, even if that means running over the host's rough budget guess
  // (summary.totalBudget below is recomputed as the true sum, so the plan
  // stays internally consistent either way). estimate: apply the date
  // premium the real path doesn't need. `parents` is a RELEVANT_PARENTS
  // array, or null for Venue (which has no needsX toggle to key one off).
  function addLine(category, icon, note, parents, estimateFn) {
    const real = parents ? realPriceFor(parents, services, formData.eventType) : null;
    const budget = real ? real.amount : Math.round(estimateFn() * dateMultiplier);
    breakdown.push({
      category, icon, budget,
      note: real ? `${note} · from ${real.sampleSize} real listing${real.sampleSize > 1 ? 's' : ''}` : note,
      priceSource: real ? 'real' : 'estimated',
    });
    remaining -= budget;
  }

  if (formData.location === 'venue') {
    addLine('Venue', '🏛️', `Capacity for ${guests} guests`, ['Venues'],
      () => totalBudget * (isWedding ? 0.30 : 0.25));
  }
  if (formData.needsCatering) {
    addLine('Catering', '🍽️', `${formData.isNonVeg ? 'Non-veg' : 'Veg'} ${formData.cuisines?.join(', ') || ''}`, RELEVANT_PARENTS.needsCatering,
      () => Math.min((formData.isNonVeg ? 800 : 600) * guests, Math.round(remaining * 0.35)));
  }
  if (formData.needsDecoration) {
    addLine('Decoration', '🎊', 'Theme decoration', RELEVANT_PARENTS.needsDecoration,
      () => totalBudget * (isWedding ? 0.20 : 0.15));
  }
  if (formData.needsPhotography) {
    addLine('Photography', '📸', isWedding ? 'Full day coverage' : '4 hour coverage', RELEVANT_PARENTS.needsPhotography,
      () => Math.min(isWedding ? 80000 : 20000, Math.round(totalBudget * (isWedding ? 0.12 : 0.08))));
  }
  if (formData.needsMusic) {
    addLine('DJ & Music', '🎵', formData.timeOfDay === 'night' ? 'Night DJ + sound' : 'Background music', RELEVANT_PARENTS.needsMusic,
      () => Math.min(formData.timeOfDay === 'night' ? 30000 : 15000, Math.round(totalBudget * 0.08)));
  }
  if (formData.needsMehendi) {
    addLine('Mehendi', '🌿', 'Bridal + family mehendi', RELEVANT_PARENTS.needsMehendi,
      () => Math.min(15000, Math.round(totalBudget * 0.04)));
  }
  if (formData.needsMakeup) {
    addLine('Makeup', '💄', isWedding ? 'Bridal makeup + hair' : 'Makeup & styling', RELEVANT_PARENTS.needsMakeup,
      () => Math.min(25000, Math.round(totalBudget * 0.06)));
  }
  if (formData.needsPandit) {
    addLine('Pandit / Priest', '🙏', 'Rituals & ceremony', RELEVANT_PARENTS.needsPandit,
      () => Math.min(10000, Math.round(totalBudget * 0.05)));
  }
  if (formData.needsMandap) {
    addLine('Mandap / Stage', '⛩️', 'Setup & styling', RELEVANT_PARENTS.needsMandap,
      () => Math.min(45000, Math.round(totalBudget * 0.12)));
  }
  if (formData.needsSeating) {
    addLine('Seating / Tent', '🪑', `Seating for ${guests}`, RELEVANT_PARENTS.needsSeating,
      () => Math.min(25000, Math.round(totalBudget * 0.10)));
  }
  if (formData.needsInvitations) {
    addLine('Invitations', '💌', 'Cards & digital invites', RELEVANT_PARENTS.needsInvitations,
      () => Math.min(8000, Math.round(totalBudget * 0.03)));
  }
  breakdown.push({ category: 'Miscellaneous', icon: '📦', budget: Math.max(remaining, 0), note: 'Transport, contingency & extras' });

  // The real total this plan actually adds up to — not the host's rough
  // initial budget-bucket guess, since real listed prices (and the date
  // premium on estimates) can legitimately land above or below it. Keeping
  // summary.totalBudget as the bucket value while breakdown rows summed to
  // something else would show two different, inconsistent totals on screen.
  const realTotalBudget = breakdown.reduce((sum, item) => sum + item.budget, 0);

  const wantedParents = new Set(
    Object.entries(RELEVANT_PARENTS).filter(([key]) => formData[key]).flatMap(([, parents]) => parents)
  );
  const matchedProviders = (providers || []).filter(p => {
    // resolveParentCategory: p.category may be the new parent-level value or
    // an old subcategory-level one (no bulk historical migration was done).
    return wantedParents.has(resolveParentCategory(p.category)) && p.city === formData.city && !avoidProviderIds.includes(p.id);
  });

  const isLastRites = formData.subEvent === 'last_rites';
  const tips = [];
  if (isLastRites) {
    tips.push('Most halls waive rental fees for last-rites gatherings — ask directly.');
    tips.push('Confirm dietary restrictions (satvik/no onion-garlic) with your caterer.');
    tips.push('Keep a simple sign-in book for condolence visitors.');
  } else {
    if (formData.timeOfDay === 'night') tips.push('Book DJ and lighting at least 2 months in advance');
    if (guests > 200) tips.push('For large events, book venue 3-6 months in advance');
    if (isWedding) tips.push('Wedding photographers get booked fast — confirm 6 months before');
    if (formData.hasAlcohol) tips.push('Get a temporary liquor licence from your local municipality');
    if (formData.location === 'home') tips.push('Check with your housing society for event permissions');
  }
  tips.push('Always get a written contract with advance payment receipt from all vendors');

  return {
    summary: {
      eventType: formData.subEvent ? labelFor(formData.subEvent) : (CATEGORY_BY_ID[formData.eventType]?.label || formData.eventType),
      date: formData.eventDate, timeOfDay: formData.timeOfDay, location: formData.location,
      guests, city: formData.city, totalBudget: realTotalBudget,
    },
    breakdown, matchedProviders, tips,
  };
}

// ── Dynamic planning tips ──────────────────────────────────────────────
// Unlike generateEventPlan()'s `tips` (computed once, frozen into
// saved_plans.plan_data), this is meant to be called fresh every time the
// plan screen renders — so tips actually shift as the event date approaches,
// not just at the moment the plan was first created.
const CATEGORY_TIPS = {
  wedding: [
    'Wedding photographers and popular venues get booked 6+ months out — lock those in first.',
    'Keep a shared spreadsheet with family for the guest list and seating to avoid last-minute edits.',
  ],
  religious: [
    'Confirm the exact muhurat/timing with your pandit or officiant early — auspicious slots fill up fast.',
    'Check if the venue allows havan/fire rituals indoors — some banquet halls restrict open flames.',
  ],
  personal: [
    "For kids' events, plan an indoor backup activity in case the weather doesn't cooperate.",
    'Order the cake at least a week ahead, especially for custom designs.',
  ],
  corporate: [
    'Send calendar invites to attendees at least 2 weeks out for better turnout.',
    'Confirm AV/projector setup with the venue a day before — technical issues are the #1 corporate event complaint.',
  ],
  social: [
    'A headcount RSVP a few days out helps avoid over- or under-catering.',
    'Have the music playlist ready in advance so there is no last-minute scrambling.',
  ],
  entertainment: [
    "Confirm the performer's technical/sound requirements (rider) at least a week before.",
    "Check the venue's noise/curfew rules if the event runs into the evening.",
  ],
  educational: [
    'Reconfirm speaker/facilitator availability a week before — academic calendars shift often.',
    'Print extra name badges/handouts — attendance often runs 10-15% over RSVPs.',
  ],
  sports: [
    'Have a rain/heat contingency plan ready if this is outdoors.',
    'Confirm first-aid coverage on-site, especially for larger sporting events.',
  ],
  exhibition: [
    'Confirm booth power and wifi requirements with the venue ahead of setup day.',
    'Plan setup access a day before — exhibitions often need more lead time than the venue default allows.',
  ],
  government: [
    'Confirm protocol and security clearances well ahead — government events often need extra lead time.',
    'Keep a printed schedule/run-of-show for the coordination staff.',
  ],
};

const SERVICE_TIPS = {
  needsCatering: 'Do a menu tasting before finalizing your caterer, and confirm the final headcount 3-4 days before the event.',
  needsPhotography: 'Share a shot-list of must-have moments with your photographer beforehand.',
  needsDecoration: 'Send reference photos to your decorator early — verbal descriptions often get misread.',
  needsMusic: 'Share your do-not-play list with the DJ, not just your favorites.',
  needsMehendi: 'Book your mehendi artist a day before the main event so the color has time to set.',
  needsMakeup: 'Schedule a trial makeup session at least 2 weeks before the event.',
  needsPandit: 'Ask your pandit for the full samagri (ritual items) list a week in advance.',
  needsMandap: 'Confirm mandap/stage setup time with the venue — it often needs 4-6 hours before doors open.',
  needsSeating: 'Order 10-15% extra seating as a buffer for walk-in guests.',
  needsInvitations: 'Send invites at least 4-6 weeks before the event for a good RSVP turnaround.',
};

const DELHI_NCR_CITIES = ['Delhi', 'Gurugram', 'Noida', 'Ghaziabad', 'Faridabad'];

function timeMilestoneTip(daysUntilEvent) {
  if (daysUntilEvent == null) return null;
  if (daysUntilEvent < 0) return 'Hope it went great! Time to settle final vendor payments and share photos with your guests.';
  if (daysUntilEvent === 0) return "It's event day — keep every vendor's phone number handy and assign one point-of-contact for on-site issues.";
  if (daysUntilEvent <= 7) return 'Under a week to go — confirm arrival times with every vendor and share the day-of schedule with your family/team.';
  if (daysUntilEvent <= 30) return "2-4 weeks out — send formal invites if you haven't yet, and lock in your final guest headcount with your caterer.";
  if (daysUntilEvent <= 90) return '1-3 months out — this is when tastings, fittings, and vendor payment schedules usually get finalized.';
  if (daysUntilEvent <= 180) return '3-6 months out — good time to finalize your guest list and send save-the-dates.';
  return "You're planning well ahead — lock in your venue and the fastest-booking vendors (photographer, popular caterers) first.";
}

// India-specific seasonal heuristic — no weather API needed/available, so
// this uses climatological patterns (month + region) rather than a live
// forecast, which wouldn't be meaningful for an event months away anyway.
function seasonalTip(eventDate, city) {
  if (!eventDate) return null;
  const month = new Date(eventDate).getMonth(); // 0 = Jan
  const isDelhiNCR = DELHI_NCR_CITIES.includes(city);
  if (month === 11 || month === 0 || month === 1) {
    return isDelhiNCR
      ? 'Winter fog can delay flights/trains into Delhi NCR — give out-of-town guests extra travel buffer.'
      : "It's winter — arrange heaters or warm seating for any part of the event that's outdoors.";
  }
  if (month >= 2 && month <= 5) {
    return 'Peak summer heat — arrange shaded seating, cold water, and electrolytes for guests, especially outdoors.';
  }
  if (month >= 6 && month <= 8) {
    return "Monsoon season — have a covered/indoor backup ready in case of rain, and check the venue's waterlogging history.";
  }
  return 'Pleasant post-monsoon weather this time of year — a good season for an outdoor setup if you\'re considering one.';
}

function dayOfWeekTip(eventDate) {
  if (!eventDate) return null;
  const day = new Date(eventDate).getDay(); // 0 = Sunday
  return (day === 0 || day === 6)
    ? 'Weekend event — factor in heavier traffic near the venue; share a Google Maps link with guests ahead of time.'
    : 'Weekday event — some guests may need to leave work early; a start time after 6-7 PM usually gets better attendance.';
}

export function generateDynamicTips(formData, today = new Date()) {
  const tips = [];
  const isLastRites = formData.subEvent === 'last_rites';

  if (isLastRites) {
    tips.push('Most halls waive rental fees for last-rites gatherings — ask directly.');
    tips.push('Confirm dietary restrictions (satvik/no onion-garlic) with your caterer.');
    tips.push('Keep a simple sign-in book for condolence visitors.');
  } else {
    (CATEGORY_TIPS[formData.eventType] || []).forEach(t => tips.push(t));

    Object.entries(SERVICE_TIPS).forEach(([key, tip]) => {
      if (formData[key]) tips.push(tip);
    });

    if (formData.hasAlcohol) tips.push('Get a temporary liquor licence from your local municipality.');
    if (formData.location === 'home') tips.push('Check with your housing society for event permissions.');
    const guestCount = formData.exactGuests || guestMap[formData.guestRange] || 0;
    if (guestCount > 200) tips.push('For large events, book your venue 3-6 months in advance.');
  }

  const daysUntilEvent = formData.eventDate
    ? Math.round((new Date(formData.eventDate).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000)
    : null;
  const timeTip = timeMilestoneTip(daysUntilEvent);
  if (timeTip) tips.push(timeTip);

  const seasonTip = seasonalTip(formData.eventDate, formData.city);
  if (seasonTip) tips.push(seasonTip);

  const weekdayTip = dayOfWeekTip(formData.eventDate);
  if (weekdayTip) tips.push(weekdayTip);

  tips.push('Always get a written contract with advance payment receipt from all vendors.');

  return tips;
}

// ── Parses free-form text into a best-guess formData object ──
// Returns { formData, guessed: { fieldName: true } } so the UI can show
// which values were detected vs. defaulted.
export function parseEventText(text, memory = null) {
  const lower = text.toLowerCase();
  const guessed = {};

  // Event type — includes Hindi/Hinglish terms (romanized and Devanagari),
  // since voice input can come back in either script depending on how the
  // speech recognizer heard a code-switched sentence. Hand-curated for the
  // handful of sub-events people actually type/say most often; anything
  // else falls through to a broad scan of every eventTaxonomy sub-event
  // label (covers the other ~100 — Haldi, Mundan, AGM, Convocation, etc. —
  // without hand-listing keywords for each one).
  const typeMatchers = [
    { categoryId: 'wedding', subEventId: 'hindu_wedding', keywords: ['wedding', 'shaadi', 'shadi', 'marriage', 'vivah', 'शादी', 'विवाह'] },
    { categoryId: 'personal', subEventId: 'birthday_kids', keywords: ['birthday', 'bday', 'janamdin', 'जन्मदिन'] },
    { categoryId: 'corporate', subEventId: null, keywords: ['corporate', 'office', 'company', 'conference'] },
    { categoryId: 'wedding', subEventId: 'engagement', keywords: ['engagement', 'ring ceremony', 'roka', 'sagai', 'सगाई', 'रोका'] },
    { categoryId: 'religious', subEventId: 'festival_puja', keywords: ['diwali', 'deepavali', 'दिवाली'] },
    { categoryId: 'personal', subEventId: 'baby_shower', keywords: ['baby shower', 'godh bharai', 'godbharai', 'गोदभराई'] },
    { categoryId: 'personal', subEventId: 'anniversary', keywords: ['anniversary', 'saalgirah', 'salgirah', 'सालगिरह'] },
    { categoryId: 'religious', subEventId: 'last_rites', keywords: ['funeral', 'last rites', 'antim sanskar', 'antim sanskaar', 'श्राद्ध', 'अंतिम संस्कार'] },
  ];
  const typeMatch = typeMatchers.find(m => m.keywords.some(k => lower.includes(k)));
  let eventType, subEvent;
  if (typeMatch) {
    eventType = typeMatch.categoryId;
    subEvent = typeMatch.subEventId;
  } else {
    const subMatch = ALL_SUBEVENTS.find(s => lower.includes(s.label.toLowerCase().split(' / ')[0].split(' (')[0]));
    if (subMatch) {
      eventType = subMatch.categoryId;
      subEvent = subMatch.id;
    } else {
      eventType = memory?.lastEventType || 'personal';
      subEvent = memory?.lastSubEvent || null;
    }
  }
  if (!typeMatch && !subEvent) guessed.eventType = memory?.lastEventType ? 'memory' : true;

  // City — match against known cities, then Hindi/alt-name aliases
  const cityMatch = CITIES.find(c => lower.includes(c.toLowerCase()));
  const aliasMatch = !cityMatch && Object.keys(CITY_ALIASES).find(alias => lower.includes(alias));
  const city = cityMatch || (aliasMatch && CITY_ALIASES[aliasMatch]) || memory?.lastCity || CITIES[0];
  if (!cityMatch && !aliasMatch) guessed.city = memory?.lastCity ? 'memory' : true;

  // Guest count — look for a number followed by guest/people/pax (English)
  // or log/mehmaan (Hindi/Hinglish), or just a standalone number
  let guestRange = memory?.lastGuestRange || '100-200';
  const guestNumMatch = lower.match(/(\d{1,4})\s*(?:guests?|people|pax|members|log|mehmaan|लोग|मेहमान)/);
  if (guestNumMatch) {
    const n = parseInt(guestNumMatch[1]);
    if (n < 50) guestRange = 'Under 50';
    else if (n <= 100) guestRange = '50-100';
    else if (n <= 200) guestRange = '100-200';
    else if (n <= 500) guestRange = '200-500';
    else guestRange = 'Above 500';
  } else {
    guessed.guestRange = memory?.lastGuestRange ? 'memory' : true;
  }

  // Budget — look for ₹ amounts, "lakh", or "k"
  let budgetRange = memory?.lastBudgetRange || '1L-3L';
  const lakhMatch = lower.match(/(\d+(?:\.\d+)?)\s*lakh/);
  const rupeeKMatch = lower.match(/₹?\s*(\d+)\s*k\b/);
  const rupeeFullMatch = lower.match(/₹\s*(\d[\d,]*)/);
  if (lakhMatch) {
    const lakhs = parseFloat(lakhMatch[1]);
    if (lakhs < 0.5) budgetRange = 'Under ₹50K';
    else if (lakhs <= 1) budgetRange = '₹50K-1L';
    else if (lakhs <= 3) budgetRange = '₹1L-3L';
    else if (lakhs <= 10) budgetRange = '₹3L-10L';
    else budgetRange = 'Above ₹10L';
  } else if (rupeeKMatch) {
    const k = parseInt(rupeeKMatch[1]);
    budgetRange = k < 50 ? 'Under ₹50K' : k <= 100 ? '₹50K-1L' : '₹1L-3L';
  } else if (rupeeFullMatch) {
    const amount = parseInt(rupeeFullMatch[1].replace(/,/g, ''));
    if (amount < 50000) budgetRange = 'Under ₹50K';
    else if (amount <= 100000) budgetRange = '₹50K-1L';
    else if (amount <= 300000) budgetRange = '₹1L-3L';
    else if (amount <= 1000000) budgetRange = '₹3L-10L';
    else budgetRange = 'Above ₹10L';
  } else {
    guessed.budgetRange = memory?.lastBudgetRange ? 'memory' : true;
  }

  // Time of day
  let timeOfDay = 'night';
  if (/\b(day|morning|afternoon|brunch)\b/.test(lower) || /सुबह|दोपहर/.test(lower)) timeOfDay = 'day';
  else if (!/\b(night|evening)\b/.test(lower) && !/रात|शाम/.test(lower)) guessed.timeOfDay = true;

  // Venue vs home
  let location = 'venue';
  if (/\bhome\b/.test(lower) || /घर/.test(lower)) location = 'home';
  else if (!/\bvenue|hall|hotel|banquet\b/.test(lower) && !/वेन्यू|हॉल|होटल/.test(lower)) guessed.location = true;

  // Simple service hints from keywords (English + Hindi/Hinglish) — but only
  // ever default a service on if it's actually relevant for this event
  // (getServiceOptionsFor, sub-event-aware), so e.g. Last Rites never
  // silently defaults to wanting decoration/DJ just because most other
  // events under "Religious & Ceremonial" do.
  const isLastRitesParsed = subEvent === 'last_rites';
  const relevantServices = getServiceOptionsFor(subEvent, eventType);
  const relevant = s => relevantServices.includes(s);

  const needsCatering = relevant('catering') && (/food|catering|caterer|meal|dinner|lunch|खाना|केटरिंग/.test(lower) || true);
  const needsDecoration = relevant('decoration') && (/decor|decoration|flowers|balloon|सजावट|फूल|गुब्बारा/.test(lower) || true);
  const needsPhotography = relevant('photography') && (/photo|video|camera|shoot|फोटो|वीडियो/.test(lower) || eventType === 'wedding');
  const needsMusic = relevant('music') && (/dj|music|band|sound|संगीत|गाना|बैंड/.test(lower) || timeOfDay === 'night');
  const needsMehendi = relevant('mehendi') && /mehendi|henna|मेहंदी/.test(lower);
  const needsMakeup = relevant('makeup') && /makeup|makeover|मेकअप/.test(lower);
  const needsPandit = relevant('pandit') && (/pandit|priest|पंडित|पुरोहित/.test(lower) || isLastRitesParsed);
  const needsMandap = relevant('mandap') && /mandap|मंडप/.test(lower);
  const needsSeating = relevant('seating') && (/seating|tent|shamiana|टेंट|शामियाना/.test(lower) || isLastRitesParsed);
  const needsInvitations = relevant('invitations') && /invit|card|निमंत्रण/.test(lower);

  const formData = {
    eventType,
    subEvent,
    eventDate: new Date(),
    timeOfDay,
    location,
    city,
    guestRange,
    budgetRange,
    needsCatering,
    isNonVeg: /non-?veg|chicken|mutton|fish|मांसाहारी|चिकन|मटन/.test(lower),
    cuisines: [],
    needsDecoration,
    needsPhotography,
    needsMusic,
    needsMehendi,
    needsMakeup,
    needsPandit,
    needsMandap,
    needsSeating,
    needsInvitations,
  };

  return { formData, guessed };
}

export { GUEST_RANGES, BUDGET_RANGES };