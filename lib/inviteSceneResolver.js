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
    rsvp: true, // RSVP is core operational functionality, not a decorative extra — always included when the archetype's preset offers it
    'wishing-wall': !!supports.wishingWall && wishingWallActive,
    closing: true,
  };

  return preset.filter((sceneId) => applies[sceneId] === true);
}
