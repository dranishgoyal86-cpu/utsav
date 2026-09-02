// Pure web-scene resolver — derives which scenes actually apply for one
// event from: the selected archetype's declared scenePreset (an ORDERED
// candidate list) + the archetype's own `supports` flags + real populated-
// content/capability signals the caller computes from canonical data.
// Never includes a scene just because the event TYPE is a wedding — only
// when there's real content or an active capability behind it, and only
// when the selected archetype actually declares support for it.
//
// Signals are booleans/counts the caller derives from real sources
// (lib/inviteContentAdapter's normalized values, lib/eventCapabilities'
// resolved capabilities, event_functions' row count, etc.) — this
// function stores none of that itself, matching every other resolver in
// this registry.
//
// Non-festive motion/design enforcement does NOT happen here — that's
// lib/inviteDesignArchetypes' resolveMotionForEvent(). This resolver
// naturally excludes celebratory-only scenes (gallery, wishing-wall) for a
// funeral simply because those schemas have no gallery/wishing-wall
// content signals to begin with, not via a special-cased check.
export function resolveScenes({
  archetype,
  hasInvocationContent = false,
  hasCoupleOrSubjectContent = false,
  hasFamilyContent = false,
  functionCount = 0,
  hasVenue = false,
  hasTravelInfo = false,
  hasAccommodationInfo = false,
  gatePassActive = false,
  galleryPhotoCount = 0,
  wishingWallActive = false,
  hasStoryContent = false,
  // Production Batch 1 — 2 new signals for the 2 new SCENE ids
  // (dress-code, honouree). hasHonoureeContent is deliberately separate
  // from hasCoupleOrSubjectContent — a single named child/celebrant
  // (kids-birthday) is a different scene id than couple, even though both
  // ultimately answer "is there a named person to present."
  hasHonoureeContent = false,
  hasDressCodeContent = false,
  // Production Batch 2 — signals for the 2 new SCENE ids (registration,
  // speakers), same "always available once the preset offers it and real
  // content exists" treatment as dress-code/honouree above.
  hasRegistrationContent = false,
  hasSpeakerContent = false,
  // Batch 2 — "Do not use wedding-style terminology such as RSVP when
  // registration is the more appropriate semantic action" (corporate-
  // conference/product-launch). Defaults true so every EXISTING caller
  // (which never passes this) keeps RSVP's unconditional behavior exactly
  // as before — only a caller that explicitly sets this false (a
  // professional-event context that's using `registration` instead)
  // suppresses it. An archetype shared across both contexts (e.g.
  // modern-indian) can declare BOTH 'rsvp' and 'registration' in its own
  // scenePreset; whichever one the caller's signals actually turn on is
  // the one that shows.
  hasRsvpContent = true,
  // Production Batch 3 — signals for the 2 new SCENE ids (transport,
  // contact), same content-gated treatment as registration/speakers.
  hasTransportContent = false,
  hasContactContent = false,
  // Production Batch 4 — signal for the new SCENE id (tickets), same
  // content-gated treatment as registration/transport/contact.
  hasTicketContent = false,
} = {}) {
  if (!archetype) return [];
  const preset = archetype.web?.scenePreset || [];
  const supports = archetype.supports || {};

  const applies = {
    opening: true, // every invite has an opening — never conditional
    invocation: !!supports.invocation && hasInvocationContent,
    couple: hasCoupleOrSubjectContent,
    family: hasFamilyContent,
    functions: !!supports.multipleFunctions && functionCount > 0,
    story: hasStoryContent,
    gallery: !!supports.gallery && galleryPhotoCount > 0,
    venue: !!supports.maps && hasVenue,
    travel: !!supports.travel && hasTravelInfo,
    stay: !!supports.accommodation && hasAccommodationInfo,
    'guest-access': !!supports.gatePass && gatePassActive,
    rsvp: hasRsvpContent, // core operational functionality by default — always included when the archetype's preset offers it, unless a professional-event caller explicitly turns it off in favour of `registration`
    'wishing-wall': !!supports.wishingWall && wishingWallActive,
    closing: true,
    honouree: hasHonoureeContent,
    // Dress code is a lightweight text field any implemented archetype can
    // present — gated purely on real content, no dedicated archetype
    // support flag (same "always available when the preset offers it"
    // treatment as rsvp/closing above).
    'dress-code': hasDressCodeContent,
    registration: hasRegistrationContent,
    speakers: hasSpeakerContent,
    transport: hasTransportContent,
    contact: hasContactContent,
    tickets: hasTicketContent,
  };

  return preset.filter((sceneId) => applies[sceneId] === true);
}
