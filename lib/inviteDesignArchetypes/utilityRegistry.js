// Utility-component contract — formalizes the "Emotional Canvas vs Utsav
// Utility UI" split from the pilot wave into a real registry, so a future
// archetype themes these consistently instead of a design silently
// rebuilding its own RSVP/Map/etc. Every utility component (implemented or
// planned) reads ONLY the themeTokenKeys listed here from the active
// variant's tokens — never a bespoke per-archetype styling path — which is
// the actual mechanism behind "do not redesign RSVP differently for every
// archetype."
import { ARCHETYPE_STATUS, SCENE_ROLE } from './types';

function utility({ id, name, status, sceneRoleId, themeTokenKeys, componentPath = null }) {
  return Object.freeze({ id, name, status, sceneRoleId, themeTokenKeys, componentPath });
}

// themeTokenKeys reference lib/inviteDesignArchetypes/tokens.js's semantic
// token set (utilitySurface/utilityBorder/utilityAction plus the shared
// primaryText/secondaryText/accent) — every utility card, implemented or
// planned, is specified to consume the SAME small token subset, which is
// what keeps a future card from inventing its own colour story.
const STANDARD_UTILITY_TOKENS = Object.freeze(['utilitySurface', 'utilityBorder', 'utilityAction', 'primaryText', 'secondaryText', 'accent']);

export const UTILITY_REGISTRY = Object.freeze({
  'function-card': utility({
    id: 'function-card', name: 'FunctionCard', status: ARCHETYPE_STATUS.IMPLEMENTED,
    sceneRoleId: SCENE_ROLE.FUNCTIONS, themeTokenKeys: STANDARD_UTILITY_TOKENS,
    componentPath: 'components/inviteArchetypes/utility/FunctionCard.js',
  }),
  'map-card': utility({
    id: 'map-card', name: 'MapCard', status: ARCHETYPE_STATUS.IMPLEMENTED,
    sceneRoleId: SCENE_ROLE.VENUE, themeTokenKeys: STANDARD_UTILITY_TOKENS,
    componentPath: 'components/inviteArchetypes/utility/MapCard.js',
  }),
  'rsvp-card': utility({
    id: 'rsvp-card', name: 'RSVPCard', status: ARCHETYPE_STATUS.IMPLEMENTED,
    sceneRoleId: SCENE_ROLE.RSVP, themeTokenKeys: STANDARD_UTILITY_TOKENS,
    componentPath: 'components/inviteArchetypes/utility/RSVPCard.js',
  }),
  'travel-card': utility({
    id: 'travel-card', name: 'TravelCard', status: ARCHETYPE_STATUS.IMPLEMENTED,
    sceneRoleId: SCENE_ROLE.TRAVEL, themeTokenKeys: STANDARD_UTILITY_TOKENS,
    componentPath: 'components/inviteArchetypes/utility/TravelCard.js',
  }),
  'stay-card': utility({
    id: 'stay-card', name: 'StayCard', status: ARCHETYPE_STATUS.IMPLEMENTED,
    sceneRoleId: SCENE_ROLE.ACCOMMODATION, themeTokenKeys: STANDARD_UTILITY_TOKENS,
    componentPath: 'components/inviteArchetypes/utility/StayCard.js',
  }),

  // ── Planned — semantic id + scene/token contract only, no component yet ──
  'transport-card': utility({ id: 'transport-card', name: 'TransportCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.TRANSPORT, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'gate-pass-card': utility({ id: 'gate-pass-card', name: 'GatePassCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.GUEST_ACCESS, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'contact-card': utility({ id: 'contact-card', name: 'ContactCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.CONTACT, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'dress-code-card': utility({ id: 'dress-code-card', name: 'DressCodeCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.DRESS_CODE, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'gift-card': utility({ id: 'gift-card', name: 'GiftCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.GIFTS, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'wishing-wall-card': utility({ id: 'wishing-wall-card', name: 'WishingWallCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.WISHING_WALL, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'schedule-card': utility({ id: 'schedule-card', name: 'ScheduleCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.PROGRAMME, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'registration-card': utility({ id: 'registration-card', name: 'RegistrationCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.REGISTRATION, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'ticket-card': utility({ id: 'ticket-card', name: 'TicketCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.TICKETS, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
  'speaker-card': utility({ id: 'speaker-card', name: 'SpeakerCard', status: ARCHETYPE_STATUS.PLANNED, sceneRoleId: SCENE_ROLE.SPEAKERS, themeTokenKeys: STANDARD_UTILITY_TOKENS }),
});

export function getUtilityDefinition(id) {
  return UTILITY_REGISTRY[id] || null;
}

export function listUtilityDefinitions() {
  return Object.values(UTILITY_REGISTRY);
}

export function validateUtilityRegistry() {
  const problems = [];
  const seen = new Set();
  for (const [key, def] of Object.entries(UTILITY_REGISTRY)) {
    if (def.id !== key) problems.push(`Utility registered under key "${key}" has mismatched internal id "${def.id}".`);
    if (seen.has(def.id)) problems.push(`Duplicate utility id "${def.id}".`);
    seen.add(def.id);
    if (def.status === ARCHETYPE_STATUS.IMPLEMENTED && !def.componentPath) {
      problems.push(`Utility "${def.id}" is marked implemented but has no componentPath.`);
    }
    if (!Array.isArray(def.themeTokenKeys) || def.themeTokenKeys.length === 0) {
      problems.push(`Utility "${def.id}" has no themeTokenKeys.`);
    }
  }
  return problems;
}
