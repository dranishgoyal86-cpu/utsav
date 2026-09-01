// Shared semantic field definitions — the vocabulary every schema in
// schemas/*.js composes from, so "partner 1's name" is defined once, not
// re-typed per event type. A field here is pure metadata: what it's called,
// what kind of input it needs, which storage column (if any) it maps to,
// and a placeholder hint. It carries no status (required/optional/...) and
// no design/palette information — status is attached per-schema via
// types.js's field() helper; visuals stay entirely out of this file.
//
// legacyColumn: the real, already-shipped column on event_invite_content
// this field reads/writes (see supabase/migrations/20260825072314_event_
// invite_content.sql + its four additive follow-ons). A field with
// legacyColumn: null has no named column — it's stored in
// event_invite_content.schema_content (new, additive JSONB — see
// supabase/migrations/invite_schema_foundation.sql) instead, keyed by this
// field's own `key`. lib/inviteContentAdapter.js is the one place that
// storage split is actually resolved; nothing else in the app should care
// which of the two a given field uses.
import { FIELD_KIND, WORDING_MODE } from './types';

export const FIELD_DEFS = Object.freeze({
  partner1Name: {
    key: 'partner1Name', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'partner_1_name', label: 'Partner 1 name', placeholderHint: 'e.g. Aarav',
  },
  partner2Name: {
    key: 'partner2Name', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'partner_2_name', label: 'Partner 2 name', placeholderHint: 'e.g. Meera',
  },
  hostedBy: {
    key: 'hostedBy', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'hosted_by', label: 'Hosted by', placeholderHint: 'e.g. The Sharma and Verma families',
  },
  couplePhotoUrl: {
    key: 'couplePhotoUrl', kind: FIELD_KIND.PHOTO, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: 'couple_photo_url', label: 'Photo', placeholderHint: null,
  },
  coupleQuote: {
    key: 'coupleQuote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'couple_quote', label: 'A line in your own words', placeholderHint: 'e.g. Two families, one celebration',
  },
  kickerText: {
    key: 'kickerText', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'kicker_text', label: 'Kicker text', placeholderHint: "e.g. YOU'RE INVITED",
  },
  headlineText: {
    key: 'headlineText', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'headline_text', label: 'Headline text', placeholderHint: null,
  },
  subjectNameLine1: {
    key: 'subjectNameLine1', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_name_line1', label: 'Name — line 1', placeholderHint: 'e.g. Shri Ramesh',
  },
  subjectNameLine2: {
    key: 'subjectNameLine2', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_name_line2', label: 'Name — line 2', placeholderHint: 'e.g. Chandra Goyal',
  },
  subjectYears: {
    key: 'subjectYears', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: 'subject_years', label: 'Years', placeholderHint: 'e.g. 1947 — 2026',
  },
  detailLine1: {
    key: 'detailLine1', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'detail_line1', label: 'Details — line 1', placeholderHint: 'e.g. Prayer meeting · 18 August, 4 PM',
  },
  detailLine2: {
    key: 'detailLine2', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: 'detail_line2', label: 'Details — line 2', placeholderHint: 'e.g. Venue / address',
  },
  // First JSONB-only semantic field — no legacyColumn, proves the
  // schema_content storage path end-to-end. Not yet rendered by
  // ToranCoverCard/StillnessCard (both stay visually unchanged this wave,
  // per the brief) — captured and round-tripped, awaiting the future
  // design-archetype wave to decide how/whether to surface it.
  invocationText: {
    key: 'invocationText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Invocation (optional)', placeholderHint: 'e.g. an opening line, shloka, or blessing',
  },

  // ── invite-architecture wave, Part 3 — added for the 26-schema expansion.
  // Every field below is legacyColumn: null (schema_content-only) — none of
  // this wave's 26 schemas needed a new named DB column, per the brief's
  // explicit storage rule. Heavily reused across schemas rather than
  // one-off-per-event-type: e.g. heroPhotoUrl/tagline are the non-wedding
  // equivalents of couplePhotoUrl/coupleQuote, reused by every schema whose
  // content isn't couple-shaped (corporate, product-launch, exhibition,
  // concert, festival-fair, sports-event, team-offsite, wellness-retreat,
  // other). Genuinely canonical concepts are deliberately NOT re-declared
  // here — event name/date/time/venue already live on `events` and reach
  // ToranCoverCard/StillnessCard via their existing eventName/eventDate/
  // venue props; guest/travel/gift/gate-pass data stays on its own
  // canonical tables (event_invitees, event_accommodations, gift_stickers,
  // etc.) untouched by this file entirely.

  // — Generic hero media/tagline (non-wedding equivalent of couplePhotoUrl/coupleQuote) —
  heroPhotoUrl: {
    key: 'heroPhotoUrl', kind: FIELD_KIND.PHOTO, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Photo', placeholderHint: null,
  },
  tagline: {
    key: 'tagline', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Tagline', placeholderHint: 'e.g. A new chapter begins',
  },
  customMessage: {
    key: 'customMessage', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'A message from the family/hosts', placeholderHint: null,
  },
  // Subject-shaped hero photo — shared by every schema whose content
  // centres on ONE named person who isn't half of a couple (a child, a
  // baby, a deceased family member), so this is deliberately NOT the same
  // field as couplePhotoUrl.
  subjectPhotoUrl: {
    key: 'subjectPhotoUrl', kind: FIELD_KIND.PHOTO, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Photo', placeholderHint: null,
  },

  // — Generic logistics/guidance, reused across many non-wedding schemas —
  dressCode: {
    key: 'dressCode', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Dress code (optional)', placeholderHint: 'e.g. Smart casual, festive colours',
  },
  giftNote: {
    key: 'giftNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gift note (optional)', placeholderHint: 'e.g. Your presence is present enough',
  },
  mealNote: {
    key: 'mealNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Meal / catering note (optional)', placeholderHint: null,
  },
  scheduleNote: {
    key: 'scheduleNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Schedule / programme (optional)', placeholderHint: 'e.g. one line per item — time, what’s happening',
  },
  registrationInfo: {
    key: 'registrationInfo', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Registration info (optional)', placeholderHint: 'e.g. link, QR reference, or deadline',
  },
  parkingNote: {
    key: 'parkingNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Parking note (optional)', placeholderHint: null,
  },
  contactInfo: {
    key: 'contactInfo', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Contact (optional)', placeholderHint: 'e.g. name and phone number',
  },
  websiteOrTicketUrl: {
    key: 'websiteOrTicketUrl', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Website / ticket link (optional)', placeholderHint: null,
  },
  entryFeeNote: {
    key: 'entryFeeNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Entry fee (optional)', placeholderHint: 'e.g. Free entry, or ₹500 per head',
  },
  ageGuidance: {
    key: 'ageGuidance', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Age guidance (optional)', placeholderHint: 'e.g. 18+, or suitable for all ages',
  },
  headCoveringNote: {
    key: 'headCoveringNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Head-covering note (optional)', placeholderHint: null,
  },
  shoeRemovalNote: {
    key: 'shoeRemovalNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Shoe-removal note (optional)', placeholderHint: null,
  },
  photographyNote: {
    key: 'photographyNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Photography note (optional)', placeholderHint: null,
  },
  officiantName: {
    key: 'officiantName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Officiant (optional)', placeholderHint: null,
  },
  // Universal repeatable extension point — see FIELD_KIND.SECTIONS in
  // types.js. Every schema in this wave includes this field (in its
  // 'custom' section) so a host is never forced to fit a real tradition
  // into predefined vocabulary; InviteFieldRenderer doesn't render an
  // editor for it yet (no visual/interaction build this wave), but the
  // adapter round-trips it as a plain array from day one.
  customSections: {
    key: 'customSections', kind: FIELD_KIND.SECTIONS, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Custom sections', placeholderHint: null,
  },

  // — Wedding-family (hindu-wedding, nikah, anand-karaj, christian-wedding, parsi-wedding, jain-wedding, interfaith-wedding, engagement) —
  familySurname: {
    key: 'familySurname', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family surname (optional)', placeholderHint: null,
  },
  familyOrigin: {
    key: 'familyOrigin', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family origin (optional)', placeholderHint: 'e.g. Jaipur, Rajasthan',
  },
  grandparentsNote: {
    key: 'grandparentsNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Grandparents (optional)', placeholderHint: null,
  },
  parentsNote: {
    key: 'parentsNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Parents (optional)', placeholderHint: null,
  },
  monogram: {
    key: 'monogram', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: null, label: 'Monogram (optional)', placeholderHint: 'e.g. A + M',
  },
  muhurat: {
    key: 'muhurat', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Muhurat (optional)', placeholderHint: null,
  },
  ceremonyTimesNote: {
    key: 'ceremonyTimesNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremony times (optional)', placeholderHint: 'e.g. Baraat 4 PM · Milni 5 PM · Pheras 6 PM · Vidai 9 PM',
  },
  gotraBride: {
    key: 'gotraBride', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gotra — bride (optional)', placeholderHint: null,
  },
  gotraGroom: {
    key: 'gotraGroom', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gotra — groom (optional)', placeholderHint: null,
  },
  bismillahEnabled: {
    key: 'bismillahEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include Bismillah', placeholderHint: null,
  },
  bismillahText: {
    key: 'bismillahText', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Bismillah — style/text', placeholderHint: null,
  },
  quranicVerseEnabled: {
    key: 'quranicVerseEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include a Qur’anic verse', placeholderHint: null,
  },
  quranicVerseText: {
    key: 'quranicVerseText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Qur’anic verse', placeholderHint: null,
  },
  duaText: {
    key: 'duaText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Dua (optional)', placeholderHint: null,
  },
  ikOnkarEnabled: {
    key: 'ikOnkarEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include Ik Onkar', placeholderHint: null,
  },
  gurbaniLine: {
    key: 'gurbaniLine', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gurbani line (optional)', placeholderHint: null,
  },
  langarTime: {
    key: 'langarTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Langar time (optional)', placeholderHint: null,
  },
  gurdwaraAddress: {
    key: 'gurdwaraAddress', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gurdwara address', placeholderHint: null,
  },
  scriptureEnabled: {
    key: 'scriptureEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include a scripture reading', placeholderHint: null,
  },
  scriptureText: {
    key: 'scriptureText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Scripture text', placeholderHint: null,
  },
  prayerText: {
    key: 'prayerText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Prayer (optional)', placeholderHint: null,
  },
  massType: {
    key: 'massType', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Mass / service type (optional)', placeholderHint: null,
  },
  churchAddress: {
    key: 'churchAddress', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Church address', placeholderHint: null,
  },
  receptionVenue: {
    key: 'receptionVenue', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Reception venue (optional)', placeholderHint: null,
  },
  religiousSymbolEnabled: {
    key: 'religiousSymbolEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include a religious symbol', placeholderHint: null,
  },
  familyBlessingText: {
    key: 'familyBlessingText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family blessing (optional)', placeholderHint: null,
  },
  ceremonyDescriptionNote: {
    key: 'ceremonyDescriptionNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremony description (optional)', placeholderHint: null,
  },
  navkarMantraEnabled: {
    key: 'navkarMantraEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Include the Navkar Mantra', placeholderHint: null,
  },
  navkarMantraText: {
    key: 'navkarMantraText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Navkar Mantra text', placeholderHint: null,
  },
  dietaryNote: {
    key: 'dietaryNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Dietary note (optional)', placeholderHint: 'e.g. Pure vegetarian meal',
  },
  // Interfaith — deliberately no bride/groom labels anywhere in this file
  // for this schema; see interfaithWedding.js.
  family1Note: {
    key: 'family1Note', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family 1 (optional)', placeholderHint: null,
  },
  family2Note: {
    key: 'family2Note', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family 2 (optional)', placeholderHint: null,
  },
  traditionExplainerNote: {
    key: 'traditionExplainerNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Tradition explainer (optional)', placeholderHint: null,
  },
  etiquetteNote: {
    key: 'etiquetteNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Etiquette note (optional)', placeholderHint: null,
  },
  // interfaith's multiple ceremonies — a second, distinct SECTIONS field
  // from customSections (kept separate: this one is core, structured
  // content for the schema itself — ceremony name/tradition/date/time/
  // venue/description/etiquette/dress per entry — customSections stays the
  // free-form "anything else" extension point every schema also gets).
  interfaithCeremonies: {
    key: 'interfaithCeremonies', kind: FIELD_KIND.SECTIONS, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremonies', placeholderHint: null,
  },
  ceremonyName: {
    key: 'ceremonyName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremony name', placeholderHint: 'e.g. Engagement, Ring Ceremony, Roka, Sagai, Mangni — or your own',
  },
  ringExchangeTime: {
    key: 'ringExchangeTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ring exchange time (optional)', placeholderHint: null,
  },
  weddingDateAnnouncementEnabled: {
    key: 'weddingDateAnnouncementEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Announce the wedding date', placeholderHint: null,
  },

  // — Family-milestone (kids-birthday, birthday, anniversary, mundan, baby-shower, naming-ceremony, housewarming) —
  childName: {
    key: 'childName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Child’s name', placeholderHint: null,
  },
  turningAge: {
    key: 'turningAge', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Turning age', placeholderHint: 'e.g. 5',
  },
  partyTheme: {
    key: 'partyTheme', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Party theme', placeholderHint: 'e.g. Jungle, Unicorn, Superhero, Cars, Space — or your own',
  },
  activitiesNote: {
    key: 'activitiesNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Activities / entertainment (optional)', placeholderHint: null,
  },
  cakeCuttingTime: {
    key: 'cakeCuttingTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Cake-cutting time (optional)', placeholderHint: null,
  },
  siblingsNote: {
    key: 'siblingsNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Siblings (optional)', placeholderHint: null,
  },
  endTime: {
    key: 'endTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'End time (optional)', placeholderHint: null,
  },
  celebrantName: {
    key: 'celebrantName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Celebrant’s name', placeholderHint: null,
  },
  milestoneAge: {
    key: 'milestoneAge', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Milestone age (optional)', placeholderHint: 'e.g. 50th, 60th',
  },
  selfHosted: {
    key: 'selfHosted', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Celebrant is hosting themselves', placeholderHint: null,
  },
  surprisePartyEnabled: {
    key: 'surprisePartyEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'This is a surprise party', placeholderHint: null,
  },
  guestArrivalTime: {
    key: 'guestArrivalTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Guest arrival time', placeholderHint: 'Arrive before the celebrant, quietly',
  },
  celebrantArrivalTime: {
    key: 'celebrantArrivalTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Celebrant’s expected arrival time', placeholderHint: null,
  },
  secrecyNote: {
    key: 'secrecyNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Secrecy note', placeholderHint: 'e.g. Please don’t mention this on social media beforehand',
  },
  anniversaryYears: {
    key: 'anniversaryYears', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: null, label: 'Anniversary years (optional)', placeholderHint: 'e.g. 25 — defaults to Silver at 25, Golden at 50, Diamond at 60 if left blank',
  },
  originalWeddingDate: {
    key: 'originalWeddingDate', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: null, label: 'Original wedding date (optional)', placeholderHint: null,
  },
  vowRenewalEnabled: {
    key: 'vowRenewalEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.COUPLE,
    legacyColumn: null, label: 'Vow renewal ceremony', placeholderHint: null,
  },
  childrenAsHosts: {
    key: 'childrenAsHosts', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Children are hosting', placeholderHint: null,
  },
  ceremonyCustomName: {
    key: 'ceremonyCustomName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremony name', placeholderHint: 'e.g. Mundan, Chudakarana, Choul, Tonsure Ceremony — or your own',
  },
  prasadNote: {
    key: 'prasadNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Prasad note (optional)', placeholderHint: null,
  },
  ceremonyType: {
    key: 'ceremonyType', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ceremony type', placeholderHint: 'e.g. Baby Shower, Godh Bharai, Seemantham, Valaikappu — or your own',
  },
  fatherToBeNote: {
    key: 'fatherToBeNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Father-to-be (optional)', placeholderHint: null,
  },
  ritualTime: {
    key: 'ritualTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ritual time (optional)', placeholderHint: null,
  },
  blessingText: {
    key: 'blessingText', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Blessing (optional)', placeholderHint: null,
  },
  genderRevealEnabled: {
    key: 'genderRevealEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'This includes a gender reveal', placeholderHint: null,
  },
  registryUrl: {
    key: 'registryUrl', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Registry link (optional)', placeholderHint: null,
  },
  colourTheme: {
    key: 'colourTheme', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Colour theme (optional)', placeholderHint: null,
  },
  nameIsSecret: {
    key: 'nameIsSecret', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Keep the baby’s name a surprise', placeholderHint: null,
  },
  babyName: {
    key: 'babyName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Baby’s name', placeholderHint: null,
  },
  cradleCeremonyEnabled: {
    key: 'cradleCeremonyEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Includes a cradle ceremony', placeholderHint: null,
  },
  pujaTime: {
    key: 'pujaTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Puja time (optional)', placeholderHint: null,
  },
  houseName: {
    key: 'houseName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'House name (optional)', placeholderHint: null,
  },
  towerBlock: {
    key: 'towerBlock', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Tower / block (optional)', placeholderHint: null,
  },
  landmark: {
    key: 'landmark', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Landmark (optional)', placeholderHint: null,
  },
  gateEntryNote: {
    key: 'gateEntryNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gate-entry note (optional)', placeholderHint: 'Guest-facing arrival instructions only — does not replace the real gate-pass system',
  },
  havanEnabled: {
    key: 'havanEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Includes a Havan', placeholderHint: null,
  },
  lakshmiPujaEnabled: {
    key: 'lakshmiPujaEnabled', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Includes a Lakshmi Puja', placeholderHint: null,
  },

  // — Religious & solemn (religious-event, funeral-last-rites) —
  religiousEventType: {
    key: 'religiousEventType', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Type of event', placeholderHint: 'e.g. Puja, Havan, Satsang, Mata Ki Chowki, Jagran, Kirtan, Bhajan Sandhya, Paath, Pravachan, Bhandara, Aarti — or your own',
  },
  traditionNote: {
    key: 'traditionNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Tradition (optional)', placeholderHint: null,
  },
  focusDeity: {
    key: 'focusDeity', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Deity / focus (optional)', placeholderHint: null,
  },
  religiousLeaderName: {
    key: 'religiousLeaderName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Religious leader (optional)', placeholderHint: null,
  },
  aartiTime: {
    key: 'aartiTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Aarti time (optional)', placeholderHint: null,
  },
  bhajanTime: {
    key: 'bhajanTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Bhajan time (optional)', placeholderHint: null,
  },
  bhandaraNote: {
    key: 'bhandaraNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Bhandara (optional)', placeholderHint: null,
  },

  riteType: {
    key: 'riteType', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Rite type', placeholderHint: 'e.g. Last Rites, Funeral, Cremation, Burial, Prayer Meeting, Condolence Meeting, Chautha, Uthala, Tehravi, Bhog, Memorial — or your own',
  },
  dateOfPassing: {
    key: 'dateOfPassing', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Date of passing (optional)', placeholderHint: null,
  },
  dateOfBirth: {
    key: 'dateOfBirth', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Date of birth (optional)', placeholderHint: null,
  },
  ageAtPassing: {
    key: 'ageAtPassing', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Age (optional)', placeholderHint: null,
  },
  relationshipDescription: {
    key: 'relationshipDescription', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Relationship description (optional)', placeholderHint: 'e.g. Beloved father and grandfather',
  },
  memorialMessage: {
    key: 'memorialMessage', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.SUBJECT,
    legacyColumn: null, label: 'Memorial message (optional)', placeholderHint: null,
  },
  riteDetailsNote: {
    key: 'riteDetailsNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Cremation / burial details (optional)', placeholderHint: null,
  },
  familyContactInfo: {
    key: 'familyContactInfo', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Family contact', placeholderHint: null,
  },

  // — Corporate & professional (corporate-conference, product-launch, team-offsite) —
  conferenceEdition: {
    key: 'conferenceEdition', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Edition (optional)', placeholderHint: 'e.g. 5th Annual',
  },
  chiefGuestName: {
    key: 'chiefGuestName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Chief guest (optional)', placeholderHint: null,
  },
  speakersNote: {
    key: 'speakersNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Speakers / panelists (optional)', placeholderHint: null,
  },
  checkInTime: {
    key: 'checkInTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Check-in time (optional)', placeholderHint: null,
  },
  sponsorsNote: {
    key: 'sponsorsNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Sponsors / partners (optional)', placeholderHint: null,
  },
  productNameHidden: {
    key: 'productNameHidden', kind: FIELD_KIND.BOOLEAN, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Keep the product name under wraps', placeholderHint: null,
  },
  productName: {
    key: 'productName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Product name', placeholderHint: null,
  },
  founderName: {
    key: 'founderName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Founder (optional)', placeholderHint: null,
  },
  embargoNote: {
    key: 'embargoNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Embargo note (optional)', placeholderHint: null,
  },
  vipAccessNote: {
    key: 'vipAccessNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'VIP access (optional)', placeholderHint: null,
  },
  liveStreamUrl: {
    key: 'liveStreamUrl', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Live stream link (optional)', placeholderHint: null,
  },
  destinationNote: {
    key: 'destinationNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Destination', placeholderHint: null,
  },
  meetingPoint: {
    key: 'meetingPoint', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Meeting point (optional)', placeholderHint: null,
  },
  departureTime: {
    key: 'departureTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Departure time (optional)', placeholderHint: null,
  },
  packingListNote: {
    key: 'packingListNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Packing list (optional)', placeholderHint: null,
  },
  documentsToCarryNote: {
    key: 'documentsToCarryNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Documents to carry (optional)', placeholderHint: null,
  },
  returnTime: {
    key: 'returnTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Return time (optional)', placeholderHint: null,
  },

  // — Public & large-scale (exhibition, concert, festival-fair, sports-event) —
  artistNamesNote: {
    key: 'artistNamesNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Artist(s) (optional)', placeholderHint: null,
  },
  curatorName: {
    key: 'curatorName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Curator (optional)', placeholderHint: null,
  },
  galleryName: {
    key: 'galleryName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gallery (optional)', placeholderHint: null,
  },
  openingHoursNote: {
    key: 'openingHoursNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Opening hours (optional)', placeholderHint: null,
  },
  closingDate: {
    key: 'closingDate', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Closing date (optional)', placeholderHint: null,
  },
  genreNote: {
    key: 'genreNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Genre (optional)', placeholderHint: null,
  },
  doorsOpenTime: {
    key: 'doorsOpenTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Doors-open time (optional)', placeholderHint: null,
  },
  ticketTiersNote: {
    key: 'ticketTiersNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Ticket tiers (optional)', placeholderHint: null,
  },
  prohibitedItemsNote: {
    key: 'prohibitedItemsNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Prohibited items (optional)', placeholderHint: null,
  },
  organiserName: {
    key: 'organiserName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Organiser', placeholderHint: null,
  },
  featuredAttractionsNote: {
    key: 'featuredAttractionsNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Featured attractions (optional)', placeholderHint: null,
  },
  shuttleNote: {
    key: 'shuttleNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Shuttle info (optional)', placeholderHint: null,
  },
  vendorStallInfoNote: {
    key: 'vendorStallInfoNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Vendor / stall info (optional)', placeholderHint: null,
  },
  sportName: {
    key: 'sportName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Sport', placeholderHint: null,
  },
  participationMode: {
    key: 'participationMode', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Participation mode', placeholderHint: 'Participant event, spectator event, or both',
  },
  tournamentType: {
    key: 'tournamentType', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Tournament type (optional)', placeholderHint: null,
  },
  categoryNote: {
    key: 'categoryNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Category / age group (optional)', placeholderHint: null,
  },
  reportingTime: {
    key: 'reportingTime', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Reporting time (optional)', placeholderHint: null,
  },
  prizesNote: {
    key: 'prizesNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Prizes (optional)', placeholderHint: null,
  },
  kitEquipmentNote: {
    key: 'kitEquipmentNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Kit / equipment (optional)', placeholderHint: null,
  },
  liveScoreUrl: {
    key: 'liveScoreUrl', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Live score link (optional)', placeholderHint: null,
  },

  // — Wellness-retreat / Other —
  facilitatorName: {
    key: 'facilitatorName', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Facilitator', placeholderHint: null,
  },
  accommodationInfoNote: {
    key: 'accommodationInfoNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Accommodation info (optional)', placeholderHint: 'Guest-facing summary only — the real per-guest stay assignment stays in event_accommodations',
  },
  bookingInfoNote: {
    key: 'bookingInfoNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Booking info (optional)', placeholderHint: null,
  },
  includedNote: {
    key: 'includedNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: "What's included (optional)", placeholderHint: null,
  },
  notIncludedNote: {
    key: 'notIncludedNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: "What's not included (optional)", placeholderHint: null,
  },
  fitnessLevelNote: {
    key: 'fitnessLevelNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Fitness level (optional)', placeholderHint: null,
  },
  medicalNote: {
    key: 'medicalNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Medical note (optional)', placeholderHint: null,
  },
  pricingNote: {
    key: 'pricingNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Pricing (optional)', placeholderHint: null,
  },
  capacityNote: {
    key: 'capacityNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Capacity (optional)', placeholderHint: null,
  },
  subtitleNote: {
    key: 'subtitleNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Subtitle (optional)', placeholderHint: null,
  },
  honoureesNote: {
    key: 'honoureesNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Honourees (optional)', placeholderHint: null,
  },
  guestNote: {
    key: 'guestNote', kind: FIELD_KIND.TEXTAREA, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Note to guests (optional)', placeholderHint: null,
  },
  galleryReferenceNote: {
    key: 'galleryReferenceNote', kind: FIELD_KIND.TEXT, wordingMode: WORDING_MODE.NEUTRAL,
    legacyColumn: null, label: 'Gallery reference (optional)', placeholderHint: null,
  },
});
