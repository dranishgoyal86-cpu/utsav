// Standardized scene-definition contract + the full ~30-role semantic
// scene registry. This is the PLANNING/CONTRACT layer — it does not
// replace lib/inviteSceneResolver.js's resolveScenes() (which still
// drives the real, working WebInvitePreview.js exactly as the Hindu
// Wedding pilot verified live) and does not require a React component for
// every role listed here. Its job is narrower: give every future scene a
// stable id, a declared meaning, and enough metadata (content/capability
// requirements, nav label, lifecycle priority, density contribution,
// solemn-safety) that a future renderer/resolver can be built FROM this
// contract instead of inventing incompatible one-off shapes per scene.
//
// Where a role here already has a real, wired implementation under a
// different literal string in SCENE (types.js) — SCENE.STAY ('stay') vs.
// this file's more semantically-named SCENE_ROLE.ACCOMMODATION
// ('accommodation') — the entry's `implementedAs` field documents that
// mapping rather than this file inventing a second working scene id.
import { SCENE_ROLE, LIFECYCLE_MODE, LIFECYCLE_PRIORITY } from './types';

// capabilityRequirements values are lib/eventCapabilities.js's own
// INVITE_CAPABILITY_MAP keys (reused, never redefined here) — this file
// never gates a capability itself, only documents which one(s) a scene's
// content depends on.
function scene({
  id, role, contentRequirements = [], capabilityRequirements = [],
  optional = true, navigationLabel = null, lifecyclePriority,
  densityContribution = 'low', solemnSafe = true, implementedAs = null,
}) {
  return Object.freeze({
    id, role, contentRequirements, capabilityRequirements, optional,
    navigationLabel, lifecyclePriority: Object.freeze(lifecyclePriority), densityContribution, solemnSafe, implementedAs,
  });
}

const P = LIFECYCLE_PRIORITY;
const M = LIFECYCLE_MODE;

export const SCENE_REGISTRY = Object.freeze({
  [SCENE_ROLE.OPENING]: scene({
    id: SCENE_ROLE.OPENING, role: 'First impression / cover moment', optional: false,
    lifecyclePriority: { [M.INVITATION]: P.VERY_HIGH, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.LOW },
    densityContribution: 'none', implementedAs: 'opening',
  }),
  [SCENE_ROLE.INVOCATION]: scene({
    id: SCENE_ROLE.INVOCATION, role: 'Host-selected religious/ceremonial opening text',
    contentRequirements: ['invocationText or equivalent host-written blessing text'],
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.NONE, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium', solemnSafe: false, implementedAs: 'invocation',
  }),
  [SCENE_ROLE.PEOPLE]: scene({
    id: SCENE_ROLE.PEOPLE, role: 'Generic named-people presentation (superset of couple/honouree)',
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.LOW },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.COUPLE]: scene({
    id: SCENE_ROLE.COUPLE, role: 'Two-partner identity presentation',
    contentRequirements: ['partner1Name (+ optional partner2Name/photo/quote)'],
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.LOW },
    densityContribution: 'low', implementedAs: 'couple',
  }),
  [SCENE_ROLE.FAMILY]: scene({
    id: SCENE_ROLE.FAMILY, role: 'Hosting family / parents / grandparents presentation',
    contentRequirements: ['hostedBy or grandparentsNote/familySurname'],
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium', implementedAs: 'family',
  }),
  [SCENE_ROLE.HONOUREE]: scene({
    id: SCENE_ROLE.HONOUREE, role: 'Single-honouree identity presentation (birthday/mundan/naming/memorial)',
    contentRequirements: ['celebrantName/childName/babyName/subjectNameLine1 or equivalent'],
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.LOW },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.EVENT_DETAILS]: scene({
    id: SCENE_ROLE.EVENT_DETAILS, role: 'Plain date/time/venue summary for non-couple/non-honouree event types',
    optional: false,
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'none',
  }),
  [SCENE_ROLE.FUNCTIONS]: scene({
    id: SCENE_ROLE.FUNCTIONS, role: 'Multi-function schedule (event_functions)',
    contentRequirements: ['one or more event_functions rows'], capabilityRequirements: ['perFunctionRsvp'],
    navigationLabel: 'Functions',
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.VERY_HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'high', implementedAs: 'functions',
  }),
  [SCENE_ROLE.PROGRAMME]: scene({
    id: SCENE_ROLE.PROGRAMME, role: 'Session/agenda-style schedule (conference, offsite, retreat, festival)',
    contentRequirements: ['scheduleNote or a future structured programme editor'],
    navigationLabel: 'Agenda',
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.VERY_HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'high',
  }),
  [SCENE_ROLE.STORY]: scene({
    id: SCENE_ROLE.STORY, role: 'Freeform narrative (customMessage/ceremonyDescriptionNote)',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.NONE, [M.EVENT_DAY]: P.NONE, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium',
  }),
  [SCENE_ROLE.GALLERY]: scene({
    id: SCENE_ROLE.GALLERY, role: 'Photo/album presentation', capabilityRequirements: ['gallery'],
    navigationLabel: 'Gallery',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.VERY_HIGH },
    densityContribution: 'high', implementedAs: 'gallery',
  }),
  [SCENE_ROLE.VENUE]: scene({
    id: SCENE_ROLE.VENUE, role: 'Venue name/address presentation', capabilityRequirements: ['maps'],
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.VERY_HIGH, [M.POST_EVENT]: P.NONE },
    // Currently fulfilled by the SAME working 'venue' scene/MapCard as
    // SCENE_ROLE.MAPS below (one component shows both the address and the
    // maps link) — `implementedAs` is deliberately left null here rather
    // than claimed by both roles, so getSceneDefinitionForImplementedId()
    // has exactly one unambiguous owner (MAPS, since its navigationLabel
    // is what a nav bar actually needs). Not a gap — a future split of
    // "address" from "directions action" into two components would give
    // this role its own implementedAs then.
    densityContribution: 'none',
  }),
  [SCENE_ROLE.MAPS]: scene({
    id: SCENE_ROLE.MAPS, role: 'Direct maps/directions action', capabilityRequirements: ['maps'],
    navigationLabel: 'Location',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.VERY_HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'none', implementedAs: 'venue',
  }),
  [SCENE_ROLE.TRAVEL]: scene({
    id: SCENE_ROLE.TRAVEL, role: 'Outstation guest travel guidance', capabilityRequirements: ['travelCoordination'],
    navigationLabel: 'Travel',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.NONE },
    densityContribution: 'high', implementedAs: 'travel',
  }),
  [SCENE_ROLE.ACCOMMODATION]: scene({
    id: SCENE_ROLE.ACCOMMODATION, role: 'Stay/hotel-block guidance', capabilityRequirements: ['accommodation'],
    navigationLabel: 'Stay',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.MEDIUM, [M.POST_EVENT]: P.NONE },
    densityContribution: 'high', implementedAs: 'stay', // SCENE.STAY — same concept, existing working id, not renamed
  }),
  [SCENE_ROLE.TRANSPORT]: scene({
    id: SCENE_ROLE.TRANSPORT, role: 'Local pickup/shuttle coordination', capabilityRequirements: ['transportPickup'],
    navigationLabel: 'Transport',
    lifecyclePriority: { [M.INVITATION]: P.NONE, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium',
  }),
  [SCENE_ROLE.GUEST_ACCESS]: scene({
    id: SCENE_ROLE.GUEST_ACCESS, role: 'Gate-pass / arrival instructions', capabilityRequirements: ['gatePass'],
    lifecyclePriority: { [M.INVITATION]: P.NONE, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.VERY_HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low', implementedAs: 'guest-access',
  }),
  [SCENE_ROLE.DRESS_CODE]: scene({
    id: SCENE_ROLE.DRESS_CODE, role: 'Dress-code guidance', capabilityRequirements: ['dressCode'],
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.MEDIUM, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.FOOD]: scene({
    id: SCENE_ROLE.FOOD, role: 'Meal/catering/dietary note',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.MEDIUM, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.GIFTS]: scene({
    id: SCENE_ROLE.GIFTS, role: 'Gift registry/note presentation', capabilityRequirements: ['gifts'],
    navigationLabel: 'Gifts',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.NONE, [M.POST_EVENT]: P.LOW },
    densityContribution: 'low', solemnSafe: false,
  }),
  [SCENE_ROLE.WISHING_WALL]: scene({
    id: SCENE_ROLE.WISHING_WALL, role: 'Guest message wall', capabilityRequirements: ['wishingWall'],
    navigationLabel: 'Wishes',
    lifecyclePriority: { [M.INVITATION]: P.NONE, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.MEDIUM, [M.POST_EVENT]: P.HIGH },
    densityContribution: 'low', solemnSafe: false, implementedAs: 'wishing-wall',
  }),
  [SCENE_ROLE.REGISTRATION]: scene({
    id: SCENE_ROLE.REGISTRATION, role: 'Registration link/QR/instructions (corporate/exhibition/sports)',
    navigationLabel: 'Register',
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium',
  }),
  [SCENE_ROLE.SPEAKERS]: scene({
    id: SCENE_ROLE.SPEAKERS, role: 'Speaker/panelist presentation (corporate-conference)',
    navigationLabel: 'Speakers',
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'medium',
  }),
  [SCENE_ROLE.ARTWORK]: scene({
    id: SCENE_ROLE.ARTWORK, role: 'Featured artwork/exhibit presentation (exhibition)',
    lifecyclePriority: { [M.INVITATION]: P.MEDIUM, [M.PRE_EVENT]: P.LOW, [M.EVENT_DAY]: P.MEDIUM, [M.POST_EVENT]: P.LOW },
    densityContribution: 'medium',
  }),
  [SCENE_ROLE.TICKETS]: scene({
    id: SCENE_ROLE.TICKETS, role: 'Ticket tier/link presentation (concert/exhibition/sports)',
    navigationLabel: 'Tickets',
    lifecyclePriority: { [M.INVITATION]: P.HIGH, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.RULES]: scene({
    id: SCENE_ROLE.RULES, role: 'Rules/prohibited-items/eligibility note (sports/concert)',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.PACKING]: scene({
    id: SCENE_ROLE.PACKING, role: 'Packing-list guidance (team-offsite/wellness-retreat)',
    lifecyclePriority: { [M.INVITATION]: P.NONE, [M.PRE_EVENT]: P.HIGH, [M.EVENT_DAY]: P.LOW, [M.POST_EVENT]: P.NONE },
    densityContribution: 'low',
  }),
  [SCENE_ROLE.RSVP]: scene({
    id: SCENE_ROLE.RSVP, role: 'RSVP call-to-action', optional: false, navigationLabel: 'RSVP',
    lifecyclePriority: { [M.INVITATION]: P.VERY_HIGH, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.NONE, [M.POST_EVENT]: P.NONE },
    densityContribution: 'none', implementedAs: 'rsvp',
  }),
  [SCENE_ROLE.CONTACT]: scene({
    id: SCENE_ROLE.CONTACT, role: 'Host/organiser contact details',
    navigationLabel: 'Contact',
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.MEDIUM, [M.EVENT_DAY]: P.HIGH, [M.POST_EVENT]: P.LOW },
    densityContribution: 'none',
  }),
  [SCENE_ROLE.CLOSING]: scene({
    id: SCENE_ROLE.CLOSING, role: 'Attribution + optional acquisition CTA', optional: false,
    lifecyclePriority: { [M.INVITATION]: P.LOW, [M.PRE_EVENT]: P.NONE, [M.EVENT_DAY]: P.NONE, [M.POST_EVENT]: P.LOW },
    densityContribution: 'none', implementedAs: 'closing',
  }),
});

export function getSceneDefinition(sceneRoleId) {
  return SCENE_REGISTRY[sceneRoleId] || null;
}

export function listSceneDefinitions() {
  return Object.values(SCENE_REGISTRY);
}

// Reverse lookup: given a working lib/inviteSceneResolver.js SCENE id
// (e.g. 'stay'), returns the SCENE_ROLE definition that documents it via
// `implementedAs` (e.g. SCENE_ROLE.ACCOMMODATION's definition) — the
// bridge lib/inviteUtilityNav.js's resolveUtilityNavFromScenes() uses to
// read a navigationLabel for a scene id that already exists in the
// working, pre-this-wave vocabulary.
const IMPLEMENTED_ID_TO_DEFINITION = Object.freeze(
  Object.fromEntries(listSceneDefinitions().filter((d) => d.implementedAs).map((d) => [d.implementedAs, d]))
);
export function getSceneDefinitionForImplementedId(implementedSceneId) {
  return IMPLEMENTED_ID_TO_DEFINITION[implementedSceneId] || null;
}

// Dev/test-time integrity check — same convention as every other registry
// validator in this codebase. Confirms every entry's id matches its own
// registry key, capabilityRequirements only names real
// lib/eventCapabilities.js module keys, and lifecyclePriority declares all
// 4 LIFECYCLE_MODE values with a real LIFECYCLE_PRIORITY value each.
export function validateSceneRegistry(validCapabilityModuleKeys) {
  const problems = [];
  const seenIds = new Set();
  for (const [key, def] of Object.entries(SCENE_REGISTRY)) {
    if (def.id !== key) problems.push(`Scene registered under key "${key}" has mismatched internal id "${def.id}".`);
    if (seenIds.has(def.id)) problems.push(`Duplicate scene id "${def.id}".`);
    seenIds.add(def.id);
    for (const capKey of def.capabilityRequirements) {
      if (validCapabilityModuleKeys && !validCapabilityModuleKeys.includes(capKey)) {
        problems.push(`Scene "${def.id}" references unknown capability module "${capKey}".`);
      }
    }
    for (const mode of Object.values(LIFECYCLE_MODE)) {
      if (!Object.values(LIFECYCLE_PRIORITY).includes(def.lifecyclePriority[mode])) {
        problems.push(`Scene "${def.id}" has an invalid lifecyclePriority for mode "${mode}".`);
      }
    }
  }
  return problems;
}
