// "can we make a schema and policy for this rather than AI guessing... so
// that everytime any user types anything extra also used if its useful in
// planning" (Anish, Sept 16). Replaces the earlier AI-based
// parse-event-prompt edge function entirely — PlanHero.js no longer calls
// any AI service to read the host's free-text event description. Every
// rule below is a plain, inspectable pattern: no network call, no API key,
// no cost, and no guessing — a phrasing that doesn't match a rule is left
// alone (the field is simply skipped, exactly like before this feature
// existed), never filled with an invented best guess.
//
// This is a deliberately separate, small, single-purpose file (not folded
// into planLogic.js/eventTypeNames.js) so the whole policy lives in one
// place to review and extend by hand — add a city to MAJOR_CITIES, a new
// REGEX pattern, or a theme synonym, without touching PlanHero.js at all.
//
// Kept in sync BY HAND with:
//  - components/SlotField.js — the real slot list/columns this can fill
//  - lib/eventThemes.js — kids-birthday's theme catalog (the only event
//    type with one; theme extraction only ever picks a name FROM that
//    catalog, never invents a theme name of its own)
//  - lib/inviteSchemas/fields.js — hostedBy's legacyColumn (hosted_by on
//    event_invite_content) — PlanHero.js pre-fills that same column when
//    this returns a hostedBy value, per Anish's Sept 16 confirmation.
import { getThemeOptions } from './eventThemes';

// Deliberately much broader than planLogic.js's CITY_GROUPS — that list is
// just the small set of cities Utsav actively markets providers in.
// SlotField.js's CityField already lets a host type ANY city as free text
// ("Don't see your city? Type it in"), so extraction shouldn't be limited
// to the marketing shortlist — a destination wedding in Udaipur or Goa is
// exactly the kind of event this app is built for. Add a city here any
// time a real host's city gets missed by this list.
const MAJOR_CITIES = [
  'New Delhi', 'Delhi', 'Gurugram', 'Gurgaon', 'Noida', 'Ghaziabad', 'Faridabad',
  'Navi Mumbai', 'Mumbai', 'Thane', 'Pune', 'Bengaluru', 'Bangalore', 'Chennai',
  'Hyderabad', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Udaipur', 'Jodhpur',
  'Jaisalmer', 'Lucknow', 'Kanpur', 'Chandigarh', 'Mohali', 'Panchkula', 'Indore',
  'Bhopal', 'Nagpur', 'Panaji', 'Goa', 'Cochin', 'Kochi', 'Thiruvananthapuram',
  'Coimbatore', 'Mysuru', 'Mysore', 'Amritsar', 'Ludhiana', 'Agra', 'Varanasi',
  'Rishikesh', 'Dehradun', 'Shimla', 'Manali', 'Patna', 'Ranchi', 'Bhubaneswar',
  'Guwahati', 'Vadodara', 'Rajkot', 'Nashik', 'Visakhapatnam', 'Vijayawada',
  'Mount Abu', 'Alibaug', 'Ooty', 'Kasauli',
];
// A typed city that's really a synonym/older name for one of the above —
// normalized to the form the rest of the app already uses elsewhere
// (venue search, saved_plans cards).
const CITY_ALIASES = { 'New Delhi': 'Delhi', 'Gurgaon': 'Gurugram', 'Bengaluru': 'Bangalore', 'Cochin': 'Kochi', 'Mysuru': 'Mysore' };

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_ALTERNATION = Object.keys(MONTHS).join('|');

function extractGuestCount(text) {
  const m = text.match(/(\d{1,5})\s*\+?\s*(guests?|people|pax|persons?|attendees?)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function extractCity(text) {
  for (const city of MAJOR_CITIES) {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      return CITY_ALIASES[city] || city;
    }
  }
  return null;
}

// Only two shapes: "15th December[, 2027]" or "December 15th[, 2027]" — the
// two orders an Indian host actually types a date in. A year given
// explicitly is used as-is; if none is given, this resolves to the NEXT
// upcoming occurrence of that day/month on or after `todayDate` (an event
// app should never silently plan something in the past). A vague relative
// date ("next month", "sometime in winter") matches neither shape and is
// correctly left unset, rather than guessed at.
function extractEventDate(text, todayDate) {
  let m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALTERNATION})\\b,?\\s*(\\d{4})?`, 'i'));
  let day, monthIdx, year;
  if (m) {
    day = parseInt(m[1], 10);
    monthIdx = MONTHS[m[2].toLowerCase()];
    year = m[3] ? parseInt(m[3], 10) : null;
  } else {
    m = text.match(new RegExp(`\\b(${MONTH_ALTERNATION})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(\\d{4})?`, 'i'));
    if (!m) return null;
    monthIdx = MONTHS[m[1].toLowerCase()];
    day = parseInt(m[2], 10);
    year = m[3] ? parseInt(m[3], 10) : null;
  }
  if (!(day >= 1 && day <= 31) || monthIdx == null) return null;

  const today = new Date(todayDate + 'T00:00:00');
  if (year == null) {
    year = today.getFullYear();
    if (new Date(year, monthIdx, day) < today) year += 1;
  }
  const result = new Date(year, monthIdx, day);
  // Guards an invalid combination (e.g. "31st February") — JS Date rolls
  // those into the next month instead of erroring, so check it round-trips.
  if (result.getMonth() !== monthIdx || result.getDate() !== day) return null;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Indian numbering (lakh/crore) is the whole reason this needs its own
// rule rather than a generic "find a number" — "50 lakhs" and "50" are
// off by 100,000x. A bare "budget 500000" (no lakh/crore word) still
// works via the third pattern.
function extractBudget(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*(lakhs?|lacs?)\b/i);
  if (m) return Math.round(parseFloat(m[1]) * 100000);
  m = text.match(/(\d+(?:\.\d+)?)\s*(crores?|\bcr\b)/i);
  if (m) return Math.round(parseFloat(m[1]) * 10000000);
  m = text.match(/budget(?:\s+(?:of|is|:))?\s*(?:₹|rs\.?|inr)?\s*([\d,]{4,})/i);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

// Matches components/SlotField.js's VENUE_TYPE_OPTIONS ('home' | 'venue' |
// 'undecided') — 'undecided' is never extracted (that's a host's own
// explicit choice, not something free text implies by omission).
const HOME_PATTERN = /\b(at home|at our home|at my home|in our backyard|at our place|at my place|in my backyard)\b/i;
const VENUE_PATTERN = /\b(banquet|resort(?!\s+to)|hotel|farmhouse|destination wedding|lawns?|palace|clubhouse|\bvenue\b|\bhall\b)\b/i;
function extractVenueType(text) {
  if (HOME_PATTERN.test(text)) return 'home';
  if (VENUE_PATTERN.test(text)) return 'venue';
  return null;
}

// Booleans only ever come back `true` here, never `false` — omission of a
// restriction in the text is not the same as a host explicitly ruling it
// out, so "false" is never guessed, only "not mentioned" (which leaves the
// field untouched, same as today).
function extractIsVegOnly(text) {
  return /\b(vegetarian only|veg only|pure veg|purely vegetarian)\b/i.test(text) ? true : null;
}
function extractIsDryEvent(text) {
  return /\b(dry event|no alcohol|alcohol[- ]free)\b/i.test(text) ? true : null;
}

const NAME = "[A-Z][a-zA-Z']+(?:\\s+[A-Z][a-zA-Z']+){0,2}";
function extractBirthdayPersonName(text) {
  let m = text.match(new RegExp(`\\b(${NAME})'s\\s+(?:\\d+(?:st|nd|rd|th)?\\s+)?birthday\\b`));
  if (m) return m[1].trim();
  m = text.match(new RegExp(`\\bbirthday\\s+of\\s+(${NAME})\\b`, 'i'));
  if (m) return m[1].trim();
  return null;
}

// A birthdate (unlike the event date) is meaningless without a year, so
// this only matches when a year is given explicitly -- no "next
// occurrence" resolution the way extractEventDate has, since a birth
// year can't be inferred. Gated on a "born"/"dob"/"birth date" keyword
// right before the date so a bare date elsewhere in the text (almost
// always the event date itself) is never mistaken for the celebrant's
// birthdate. "gets picked up from plan window" (Anish, Sept 22) -- same
// free-text autofill PlanHero.js's prompt box already does for name/
// date/city/etc.
const DOB_KEYWORD = /\b(?:born|birth\s*date|d\.?o\.?b\.?)\b[:\s]*(?:on\s+)?/i;
function extractBirthdayPersonDob(text) {
  const kw = text.match(DOB_KEYWORD);
  if (!kw) return null;
  const rest = text.slice(kw.index + kw[0].length);
  const thisYear = new Date().getFullYear();

  let day, monthIdx, year;
  let m = rest.match(new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_ALTERNATION})\\b,?\\s*(\\d{4})`, 'i'));
  if (m) {
    day = parseInt(m[1], 10); monthIdx = MONTHS[m[2].toLowerCase()]; year = parseInt(m[3], 10);
  } else {
    m = rest.match(new RegExp(`^(${MONTH_ALTERNATION})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(\\d{4})`, 'i'));
    if (m) {
      monthIdx = MONTHS[m[1].toLowerCase()]; day = parseInt(m[2], 10); year = parseInt(m[3], 10);
    } else {
      m = rest.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
      if (!m) return null;
      day = parseInt(m[1], 10); monthIdx = parseInt(m[2], 10) - 1; year = parseInt(m[3], 10);
    }
  }
  if (!(day >= 1 && day <= 31) || monthIdx == null || monthIdx < 0 || monthIdx > 11) return null;
  if (!(year >= 1900 && year <= thisYear)) return null;
  const result = new Date(year, monthIdx, day);
  if (result.getMonth() !== monthIdx || result.getDate() !== day) return null;
  if (result > new Date()) return null;
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "Advait Goyal's birthday hosted by Anish and Neha" — captures everything
// after "hosted by" up to the next sentence-ending punctuation (or end of
// string), so "Anish and Neha", "The Sharma family", "Anish & Neha Goyal"
// all come through as typed rather than needing a fixed name format.
function extractHostedBy(text) {
  const m = text.match(/\bhosted\s+by\s+([A-Za-z][A-Za-z .&'-]{1,60}?)(?=[.,;!?]|$)/i);
  if (m) return m[1].trim();
  return extractHostedByForAnd(text);
}

// Fallback for the common wedding phrasing that never says "hosted by" at
// all — "A wedding for 300 guests ... for Anish Goyal and Neha Sharma" —
// where the couple's names just follow a second "for". Only fires on
// "for <Name(s)> and <Name(s)>" — capitalized name-shaped words joined by
// "and" — so it doesn't false-match "for 300 guests" (starts with a digit)
// or a single city name like "for Udaipur" (no "and" to anchor on). Two or
// three names (Anish Goyal and Neha Sharma [and Rakhi]) are both matched;
// a lookahead stops the match before it can bleed into an unrelated clause
// that happens to start with a common connector word.
function extractHostedByForAnd(text) {
  // Deliberately NOT case-insensitive — capitalization is the only signal
  // separating real names ("Anish Goyal") from an ordinary lowercase
  // phrase ("kids with games and cake") that also happens to follow "for"
  // and contain "and". An "i" flag here would defeat that safety check
  // entirely (it'd let [A-Z] match a lowercase letter too).
  const re = new RegExp(`\\bfor\\s+(${NAME}(?:\\s+and\\s+${NAME}){1,2})(?=[.,;!?]|\\s+(?:on|in|for|at|with|budget)\\b|$)`);
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// Only ever returns a theme that's really in lib/eventThemes.js's catalog
// for this exact event type — matched by its full label, or by any single
// significant word from its slug (so a text mentioning just "unicorn"
// still matches the "Unicorn & Rainbows" entry). Never invents a theme
// name that isn't already one of the app's own options — kids-birthday is
// the only event type with a catalog at all today, so this is a no-op for
// every other event type.
function extractTheme(text, eventTypeSlug) {
  const options = getThemeOptions(eventTypeSlug);
  const lower = text.toLowerCase();
  for (const opt of options) {
    if (lower.includes(opt.label.toLowerCase())) return opt;
    const keywords = opt.slug.split('-').filter(w => w.length > 3);
    if (keywords.some(k => lower.includes(k))) return opt;
  }
  return null;
}

const BIRTHDAY_EVENT_TYPES = ['kids-birthday', 'adult-birthday'];

// The one exported entry point — PlanHero.js calls this with the host's
// typed text, the event type matchEventTypeText() already resolved, and
// today's date (for event_date's "next upcoming occurrence" resolution).
// Returns { patch, hostedBy }: `patch` merges straight into the events
// insert (every key here is a real, already-editable events column, same
// ones components/SlotField.js reads/writes); `hostedBy`, if present, is
// handled separately by PlanHero.js since it lives on event_invite_content
// (the invite designer's table), not on events itself.
export function extractEventDetails(text, eventTypeSlug, todayDate) {
  const patch = {};

  const guestCount = extractGuestCount(text);
  if (guestCount != null) patch.guest_count = guestCount;

  const city = extractCity(text);
  if (city) patch.city = city;

  const eventDate = extractEventDate(text, todayDate);
  if (eventDate) patch.event_date = eventDate;

  const budget = extractBudget(text);
  if (budget != null) patch.budget_total = budget;

  const venueType = extractVenueType(text);
  if (venueType) patch.venue_type = venueType;

  const isVegOnly = extractIsVegOnly(text);
  if (isVegOnly != null) patch.is_veg_only = isVegOnly;

  const isDryEvent = extractIsDryEvent(text);
  if (isDryEvent != null) patch.is_dry_event = isDryEvent;

  if (BIRTHDAY_EVENT_TYPES.includes(eventTypeSlug)) {
    const birthdayPersonName = extractBirthdayPersonName(text);
    if (birthdayPersonName) patch.birthday_person_name = birthdayPersonName;
    const birthdayPersonDob = extractBirthdayPersonDob(text);
    if (birthdayPersonDob) patch.birthday_person_dob = birthdayPersonDob;
  }

  const themeOpt = extractTheme(text, eventTypeSlug);
  if (themeOpt) {
    patch.theme = themeOpt.label;
    patch.theme_slug = themeOpt.slug;
  }

  const hostedBy = extractHostedBy(text);

  return { patch, hostedBy };
}
