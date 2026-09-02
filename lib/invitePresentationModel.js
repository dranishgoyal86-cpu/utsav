// Production Integration Wave — the shared content-mapping layer the
// Launch-Readiness Audit found still living only inside the dev-only
// screens/customer/InviteArchetypePilot.js screen. Extracted here so both
// that pilot AND the real production renderer bridge
// (components/invite/ProductionInviteCard.js) call the exact same
// resolution logic — one canonical mapping from stored invite content to
// presentation content, never two competing copies. Every function here
// is pure (plain data in, plain data out, no Supabase, no React) — the
// same "Supabase-free, plain-data-in/plain-data-out" convention as
// lib/eventResolver.js and lib/inviteSchemas' own resolvers.
//
// This module owns MAPPING, not rendering — no component/JSX/UI code
// belongs here (that stays in the screens/components that call it).

// Batch 2 — corporate-conference/product-launch use Registration instead
// of RSVP ("Do not use wedding-style terminology such as RSVP when
// registration is the more appropriate semantic action").
export const PROFESSIONAL_EVENT_SLUGS = ['corporate-conference', 'product-launch'];

// Batch 4 — public events use Tickets/Registration instead of RSVP too
// ("Avoid forcing RSVP across all public events"). A ticketed event with
// neither ticket nor registration content simply shows no action at all
// (a legitimate "Free Entry, just show up" state), rather than a
// generic RSVP fallback that isn't the canonical action here.
export const TICKETED_EVENT_SLUGS = ['exhibition', 'concert', 'festival-fair', 'sports-event'];

// Per-event-type "what matters most" for the nav bar — the content-
// mapping-layer branching resolveUtilityNavFromScenes()'s own header
// comment describes; the resolver itself stays a pure, generic ranking
// function with zero per-slug knowledge.
export const NAV_BOOST_BY_EVENT_TYPE = {
  concert: ['tickets'], 'festival-fair': ['tickets'], exhibition: ['registration'], 'sports-event': ['registration', 'tickets'],
  'team-offsite': ['travel', 'accommodation'], 'wellness-retreat': ['functions', 'accommodation'],
};

// QA-pass fix — FamilyScene's default "WITH LOVE FROM" heading is right
// for a wedding/family celebration but reads oddly on a corporate/public-
// event organiser line ("WITH LOVE FROM TechCorp India"). Every event
// type outside the family-celebration set uses the neutral label instead.
export const NON_FAMILY_TONE_EVENT_SLUGS = [...PROFESSIONAL_EVENT_SLUGS, ...TICKETED_EVENT_SLUGS, 'team-offsite', 'wellness-retreat'];

// Batch 3 — anniversary's derived milestone label (host content always
// wins; this is decorative wording only, never a fact this app invents —
// the year count itself is always the host's own anniversaryYears value).
const MILESTONE_LABELS = { 25: 'Silver', 50: 'Golden', 60: 'Diamond' };
export function getMilestoneLabel(years) {
  const n = parseInt(years, 10);
  return MILESTONE_LABELS[n] || null;
}

// Batch 5 — interfaithCeremonies is a FIELD_KIND.SECTIONS array (see
// components/invite/schema/RepeatableSectionEditor.js), each item shaped
// { title, description, date, startTime, endTime, venue, personLabel,
// sortOrder }. Sorted by sortOrder (falls back to array position) so
// ordering always follows what the host actually entered/reordered,
// never a fixed default.
export function sortedCeremonies(ceremonies) {
  if (!Array.isArray(ceremonies)) return [];
  return ceremonies.slice().sort((a, b) => (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0));
}
// One line per ceremony (title — venue — description), so a host-entered
// ceremony with real content always reads as its own paragraph rather
// than being merged into a single run-on sentence with the others —
// symmetric treatment, no ceremony visually favoured over another.
export function buildInterfaithCeremonyLines(ceremonies) {
  return sortedCeremonies(ceremonies)
    .map((c) => [c?.title, c?.venue, c?.description].filter(Boolean).join(' — '))
    .filter(Boolean);
}
// Reuses FunctionCard (retitled "Ceremonies") instead of a dedicated
// interfaith schedule component — same "do not build four event-specific
// schedule components" discipline Batch 4 already established.
export function ceremoniesToFunctionRows(ceremonies) {
  return sortedCeremonies(ceremonies)
    .map((c, i) => ({
      id: c?.id || `ceremony_${i}`,
      name: c?.personLabel ? `${c.title} (${c.personLabel})` : c?.title,
      date: c?.date || null,
      time: [c?.startTime, c?.endTime].filter(Boolean).join(' – ') || null,
    }))
    .filter((f) => f.name);
}

// Batch 5 — each of the 5 wedding-tradition schemas models its own
// religious content as an enabled/text pair (nikah's bismillahEnabled/
// bismillahText, anand-karaj's ikOnkarEnabled/gurbaniLine, ...) rather
// than hindu-wedding's single generic invocationText field.
// applyConditionalSuppression() has already blanked each *Text field
// whenever its own *Enabled flag is false, so this only ever needs to
// check the text fields' own truthiness — never re-reads the Enabled
// flags directly.
export function resolveInvocationText(eventTypeSlug, values) {
  if (eventTypeSlug === 'nikah') {
    return [values.bismillahText, values.quranicVerseText, values.duaText].filter(Boolean).join('\n') || null;
  }
  if (eventTypeSlug === 'anand-karaj') {
    return values.gurbaniLine || null;
  }
  if (eventTypeSlug === 'christian-wedding') {
    return [values.scriptureText, values.prayerText].filter(Boolean).join('\n') || null;
  }
  if (eventTypeSlug === 'parsi-wedding') {
    return values.familyBlessingText || null;
  }
  if (eventTypeSlug === 'jain-wedding') {
    return [values.navkarMantraText, values.familyBlessingText].filter(Boolean).join('\n') || null;
  }
  return values.invocationText || null;
}

// Batch 5 — folds each tradition's own guest-preparation notes into the
// same DressCodeCard every other event type already uses ("do not create
// religious-specific utility cards") rather than a new etiquette
// component. anand-karaj/interfaith-wedding don't have a plain dressCode
// field at all; every other schema (including every pre-existing one)
// keeps using its own dressCode field unchanged via the final fallback.
export function resolveDressGuidance(eventTypeSlug, values) {
  if (eventTypeSlug === 'anand-karaj') return values.headCoveringNote || null;
  if (eventTypeSlug === 'interfaith-wedding') {
    return [values.headCoveringNote, values.shoeRemovalNote, values.photographyNote, values.etiquetteNote].filter(Boolean).join('  ·  ') || null;
  }
  return values.dressCode || null;
}

// Batch 5 — anand-karaj/christian-wedding each have their own REQUIRED
// primary-ceremony-venue field (gurdwaraAddress/churchAddress), more
// specific than the generic events.venue a host fills in at plan level.
// Every other event type keeps reading straight off event.venue,
// unchanged.
export function resolvePrimaryVenue(eventTypeSlug, values, event) {
  if (eventTypeSlug === 'anand-karaj') return values.gurdwaraAddress || event?.venue || null;
  if (eventTypeSlug === 'christian-wedding') return values.churchAddress || event?.venue || null;
  return event?.venue || null;
}

// Batch 4 — sports-event's participationMode is free text ("Participant
// event", "Spectator event", "Both", etc., per the schema's own
// placeholder hint), not an enum — simple substring matching on whatever
// the host actually typed, never a guess when the field is empty.
export function participationIncludes(participationMode, kind) {
  return (participationMode || '').toLowerCase().includes(kind);
}

// A plain composition of whatever schedule/ceremony-detail free text a
// given event type actually has — reuses the generic 'story' scene rather
// than inventing a dedicated scene per event type. Every value here is
// host-supplied structured content (a free-text field, or a boolean the
// host explicitly toggled) — never fabricated or inferred.
export function buildStoryText(eventTypeSlug, values) {
  const lines = [];
  // Batch 5 — mealNote/giftNote/dietaryNote are declared on 13+ schemas
  // going back to hindu-wedding/kids-birthday/baby-shower, but were never
  // actually read anywhere until Batch 5 — folded in generically instead
  // of duplicating the same three lines into every per-type branch.
  if (values.mealNote) lines.push(values.mealNote);
  if (values.giftNote) lines.push(values.giftNote);
  if (values.dietaryNote) lines.push(`Dietary: ${values.dietaryNote}`);
  if (eventTypeSlug === 'nikah') {
    if (values.officiantName) lines.push(`Officiant: ${values.officiantName}`);
  } else if (eventTypeSlug === 'anand-karaj') {
    if (values.langarTime) lines.push(`Langar: ${values.langarTime}`);
  } else if (eventTypeSlug === 'christian-wedding') {
    if (values.massType) lines.push(values.massType);
    if (values.officiantName) lines.push(`Officiant: ${values.officiantName}`);
    if (values.receptionVenue) lines.push(`Reception at ${values.receptionVenue}`);
  } else if (eventTypeSlug === 'parsi-wedding') {
    if (values.ceremonyDescriptionNote) lines.push(values.ceremonyDescriptionNote);
    if (values.receptionVenue) lines.push(`Reception at ${values.receptionVenue}`);
  } else if (eventTypeSlug === 'jain-wedding') {
    if (values.muhurat) lines.push(`Muhurat: ${values.muhurat}`);
  } else if (eventTypeSlug === 'interfaith-wedding') {
    if (values.traditionExplainerNote) lines.push(values.traditionExplainerNote);
    lines.push(...buildInterfaithCeremonyLines(values.interfaithCeremonies));
  } else if (eventTypeSlug === 'other') {
    if (values.subtitleNote) lines.push(values.subtitleNote);
    if (values.scheduleNote) lines.push(values.scheduleNote);
    if (values.guestNote) lines.push(values.guestNote);
    if (values.galleryReferenceNote) lines.push(values.galleryReferenceNote);
  } else if (eventTypeSlug === 'engagement') {
    if (values.muhurat) lines.push(`Muhurat: ${values.muhurat}`);
    if (values.ringExchangeTime) lines.push(`Ring exchange at ${values.ringExchangeTime}`);
    if (values.scheduleNote) lines.push(values.scheduleNote);
  } else if (eventTypeSlug === 'baby-shower') {
    if (values.ritualTime) lines.push(`Ritual: ${values.ritualTime}`);
    if (values.blessingText) lines.push(values.blessingText);
    if (values.activitiesNote) lines.push(values.activitiesNote);
  } else if (eventTypeSlug === 'naming-ceremony') {
    if (values.pujaTime) lines.push(`Puja: ${values.pujaTime}`);
    if (values.cradleCeremonyEnabled === true) lines.push('Cradle ceremony to follow.');
  } else if (eventTypeSlug === 'housewarming') {
    if (values.muhurat) lines.push(`Muhurat: ${values.muhurat}`);
    if (values.havanEnabled === true) lines.push('Havan will be performed.');
    if (values.lakshmiPujaEnabled === true) lines.push('Lakshmi Puja will be performed.');
  } else if (eventTypeSlug === 'corporate-conference') {
    if (values.tagline) lines.push(values.tagline);
    if (values.chiefGuestName) lines.push(`Chief Guest: ${values.chiefGuestName}`);
    // speakersNote is real, RECOMMENDED content, but it's a single
    // free-text field, not structured per-speaker data — surfaced here
    // rather than fabricated into fake individual speaker cards. See the
    // Launch-Readiness Audit's structured-people assessment.
    if (values.speakersNote) lines.push(values.speakersNote);
  } else if (eventTypeSlug === 'product-launch') {
    if (values.tagline && values.productNameHidden !== true) lines.push(values.tagline);
    if (values.founderName) lines.push(`Hosted by ${values.founderName}`);
  } else if (eventTypeSlug === 'kids-birthday') {
    if (values.activitiesNote) lines.push(values.activitiesNote);
  } else if (eventTypeSlug === 'adult-birthday') {
    // Launch-readiness audit fix — adult-birthday's own buildStoryText
    // branch: tagline/activitiesNote and the whole surprise-party signal
    // (surprisePartyEnabled + its 3 conditional fields). milestoneAge is
    // handled separately, in honoureeAgeLine (buildPresentationContent
    // below) — not duplicated here.
    if (values.tagline) lines.push(values.tagline);
    if (values.activitiesNote) lines.push(values.activitiesNote);
    if (values.surprisePartyEnabled === true) {
      if (values.secrecyNote) lines.push(values.secrecyNote);
      if (values.guestArrivalTime) lines.push(`Guests, please arrive by ${values.guestArrivalTime} — it's a surprise!`);
      if (values.celebrantArrivalTime) lines.push(`${values.celebrantName || 'The celebrant'} arrives at ${values.celebrantArrivalTime}.`);
    }
  } else if (eventTypeSlug === 'anniversary') {
    const milestone = getMilestoneLabel(values.anniversaryYears);
    if (values.anniversaryYears) lines.push(milestone ? `${values.anniversaryYears} Years — ${milestone} Anniversary` : `${values.anniversaryYears} Years Together`);
    if (values.originalWeddingDate) lines.push(`Married on ${values.originalWeddingDate}`);
    if (values.vowRenewalEnabled === true) lines.push('Vow renewal ceremony to follow.');
    if (values.childrenAsHosts) lines.push(values.childrenAsHosts);
  } else if (eventTypeSlug === 'mundan') {
    if (values.muhurat) lines.push(`Muhurat: ${values.muhurat}`);
    if (values.prasadNote) lines.push(values.prasadNote);
  } else if (eventTypeSlug === 'religious-event') {
    if (values.traditionNote) lines.push(values.traditionNote);
    if (values.religiousLeaderName) lines.push(`Led by ${values.religiousLeaderName}`);
    if (values.aartiTime) lines.push(`Aarti: ${values.aartiTime}`);
    if (values.bhajanTime) lines.push(`Bhajan: ${values.bhajanTime}`);
    if (values.scheduleNote) lines.push(values.scheduleNote);
    if (values.prasadNote) lines.push(values.prasadNote);
    if (values.bhandaraNote) lines.push(values.bhandaraNote);
    if (values.headCoveringNote) lines.push(values.headCoveringNote);
    if (values.shoeRemovalNote) lines.push(values.shoeRemovalNote);
  } else if (eventTypeSlug === 'team-offsite') {
    if (values.destinationNote) lines.push(`Destination: ${values.destinationNote}`);
    if (values.activitiesNote) lines.push(values.activitiesNote);
    if (values.packingListNote) lines.push(`Pack: ${values.packingListNote}`);
    if (values.documentsToCarryNote) lines.push(`Carry: ${values.documentsToCarryNote}`);
  } else if (eventTypeSlug === 'wellness-retreat') {
    if (values.destinationNote) lines.push(`Destination: ${values.destinationNote}`);
    if (values.customMessage) lines.push(values.customMessage);
    if (values.activitiesNote) lines.push(values.activitiesNote);
    if (values.includedNote) lines.push(`Included: ${values.includedNote}`);
    if (values.notIncludedNote) lines.push(`Not included: ${values.notIncludedNote}`);
    if (values.packingListNote) lines.push(`Pack: ${values.packingListNote}`);
    if (values.fitnessLevelNote) lines.push(`Fitness level: ${values.fitnessLevelNote}`);
    if (values.medicalNote) lines.push(values.medicalNote);
  } else if (eventTypeSlug === 'exhibition') {
    if (values.artistNamesNote) lines.push(values.artistNamesNote);
    if (values.curatorName) lines.push(`Curated by ${values.curatorName}`);
    if (values.galleryName) lines.push(values.galleryName);
    if (values.openingHoursNote) lines.push(values.openingHoursNote);
    if (values.closingDate) lines.push(`On view through ${values.closingDate}`);
    if (values.chiefGuestName) lines.push(`Chief Guest: ${values.chiefGuestName}`);
  } else if (eventTypeSlug === 'concert') {
    if (values.artistNamesNote) lines.push(values.artistNamesNote);
    if (values.doorsOpenTime) lines.push(`Doors open ${values.doorsOpenTime}`);
    if (values.ageGuidance) lines.push(values.ageGuidance);
    if (values.prohibitedItemsNote) lines.push(values.prohibitedItemsNote);
    if (values.parkingNote) lines.push(values.parkingNote);
  } else if (eventTypeSlug === 'festival-fair') {
    if (values.tagline) lines.push(values.tagline);
    if (values.featuredAttractionsNote) lines.push(values.featuredAttractionsNote);
    if (values.openingHoursNote) lines.push(values.openingHoursNote);
    if (values.closingDate) lines.push(`Through ${values.closingDate}`);
    if (values.scheduleNote) lines.push(values.scheduleNote);
    if (values.chiefGuestName) lines.push(`Chief Guest: ${values.chiefGuestName}`);
    if (values.vendorStallInfoNote) lines.push(values.vendorStallInfoNote);
    if (values.shuttleNote) lines.push(values.shuttleNote);
    if (values.parkingNote) lines.push(values.parkingNote);
    if (values.sponsorsNote) lines.push(`Sponsors: ${values.sponsorsNote}`);
  } else if (eventTypeSlug === 'sports-event') {
    if (values.tournamentType) lines.push(values.tournamentType);
    if (values.categoryNote) lines.push(values.categoryNote);
    if (values.reportingTime) lines.push(`Reporting time: ${values.reportingTime}`);
    if (values.prizesNote) lines.push(`Prizes: ${values.prizesNote}`);
    if (values.kitEquipmentNote) lines.push(`Kit/equipment: ${values.kitEquipmentNote}`);
    if (values.parkingNote) lines.push(values.parkingNote);
    if (values.sponsorsNote) lines.push(`Sponsors: ${values.sponsorsNote}`);
    if (values.liveScoreUrl) lines.push(`Live score: ${values.liveScoreUrl}`);
  }
  return lines.join('  ·  ') || null;
}

function resolveFunctionsTitle(eventTypeSlug, isProfessionalEvent) {
  if (isProfessionalEvent) return 'Agenda';
  if (eventTypeSlug === 'interfaith-wedding') return 'Ceremonies';
  if (eventTypeSlug === 'sports-event') return 'Fixtures';
  if (eventTypeSlug === 'concert') return 'Schedule';
  if (['baby-shower', 'housewarming', 'naming-ceremony', 'exhibition', 'festival-fair', 'team-offsite', 'wellness-retreat'].includes(eventTypeSlug)) return 'Programme';
  return undefined;
}

// The single composed entry point — everything a renderer (pilot OR real
// production bridge) needs beyond the raw normalized `values`, computed
// once, identically, in one place. Returns plain data only; callers
// decide how to feed it into StaticInviteCard/WebInvitePreview/PDF
// builders.
export function buildPresentationContent({ eventTypeSlug, values, event, functions = [] } = {}) {
  const isProfessionalEvent = PROFESSIONAL_EVENT_SLUGS.includes(eventTypeSlug);
  const isTicketedEvent = TICKETED_EVENT_SLUGS.includes(eventTypeSlug);

  // Batch 3 — wellness-retreat's bookingInfoNote is the same "Book/Register
  // instead of RSVP" semantic action as corporate/product's registrationInfo.
  // Batch 4 — exhibition always Registers (no ticket fields exist on its
  // schema); sports-event Registers only in a participant-facing mode.
  const registrationText = isProfessionalEvent ? values.registrationInfo
    : eventTypeSlug === 'wellness-retreat' ? values.bookingInfoNote
    : eventTypeSlug === 'exhibition' ? values.registrationInfo
    : (eventTypeSlug === 'sports-event' && participationIncludes(values.participationMode, 'participant')) ? values.registrationInfo
    : null;
  const ticketUrl = eventTypeSlug === 'concert' ? (values.websiteOrTicketUrl || null) : null;
  const tierNote = eventTypeSlug === 'concert' ? (values.ticketTiersNote || null) : null;
  const entryNote = eventTypeSlug === 'festival-fair' ? values.entryFeeNote
    : (eventTypeSlug === 'sports-event' && participationIncludes(values.participationMode, 'spectator')) ? values.entryFeeNote
    : null;

  const storyText = buildStoryText(eventTypeSlug, values);
  const invocationText = resolveInvocationText(eventTypeSlug, values);
  const dressGuidance = resolveDressGuidance(eventTypeSlug, values);
  const primaryVenue = resolvePrimaryVenue(eventTypeSlug, values, event);
  const addressDetail = [values.houseName, values.towerBlock, values.landmark].filter(Boolean).join(', ') || null;
  const gatePassNote = [values.gateEntryNote, values.parkingNote].filter(Boolean).join('  ') || null;

  // interfaith-wedding's ceremonies are additional schedule rows, not a
  // replacement for any real event_functions the host also added —
  // ceremonies first (core to the event), canonical functions after.
  const effectiveFunctions = eventTypeSlug === 'interfaith-wedding'
    ? [...ceremoniesToFunctionRows(values.interfaithCeremonies), ...functions]
    : functions;

  // Visual QA pass fix: kids-birthday/mundan/naming-ceremony/funeral
  // schemas store their hero photo under subjectPhotoUrl, NOT
  // couplePhotoUrl; exhibition/concert/festival-fair/sports-event/other
  // use their own generic heroPhotoUrl field. A schema only ever
  // populates one of the three.
  const heroPhotoUrl = values.couplePhotoUrl || values.subjectPhotoUrl || values.heroPhotoUrl || null;

  // babyName/productName are already suppressed upstream by
  // lib/inviteContentAdapter.js's applyConditionalSuppression whenever
  // nameIsSecret/productNameHidden is true — safe to read directly here.
  // Launch-readiness audit fix — honoureesNote (other's own plain-text
  // honouree list) sits at the end of this chain so it never overrides
  // any event type that already has a real named honouree.
  const honoureeName = values.childName || values.celebrantName || values.babyName || values.productName || values.facilitatorName || values.subjectNameLine1 || values.honoureesNote || null;
  // Launch-readiness audit fix — adult-birthday's own age field is
  // milestoneAge, not kids-birthday's turningAge (a different key).
  const honoureeAgeLine = values.turningAge ? `Turning ${values.turningAge}` : (values.milestoneAge ? `Turning ${values.milestoneAge}` : null);

  const kicker = values.kickerText || values.ceremonyName?.toUpperCase() || values.ceremonyType?.toUpperCase() || values.ceremonyCustomName?.toUpperCase() || values.religiousEventType?.toUpperCase() || values.sportName?.toUpperCase() || values.genreNote?.toUpperCase() || 'YOU ARE INVITED';
  const headline = values.headlineText
    || (values.nameIsSecret === true ? 'Join us as we welcome and name our little one' : null)
    || (values.productNameHidden === true ? (values.tagline || 'Something big is coming') : null)
    || event?.name || null;

  return {
    isProfessionalEvent, isTicketedEvent,
    registrationText, ticketUrl, tierNote, entryNote,
    storyText, invocationText, dressGuidance, primaryVenue, addressDetail, gatePassNote,
    effectiveFunctions, functionsTitle: resolveFunctionsTitle(eventTypeSlug, isProfessionalEvent),
    heroPhotoUrl, honoureeName, honoureeAgeLine,
    kicker, headline,
    familyKickerLabel: NON_FAMILY_TONE_EVENT_SLUGS.includes(eventTypeSlug) ? 'HOSTED BY' : undefined,
    hasRsvpContent: !isProfessionalEvent && !isTicketedEvent,
  };
}
