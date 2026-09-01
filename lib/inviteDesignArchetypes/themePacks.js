// Kids-birthday theme-pack mechanism — a small, lightweight, SUBORDINATE
// layer beneath the archetype/variant/tokens system, not a new
// architecture of its own. The event schema's `partyTheme` (free text,
// host-entered — see lib/inviteSchemas/schemas/kidsBirthday.js) remains
// the one canonical piece of content; nothing here duplicates or stores
// it. A theme pack only supplies OPTIONAL decorative hints (an accent
// colour nudge + an icon set) that a Playful Pop/Illustrated Story/
// Celestial renderer may use on top of whichever variant tokens are
// already active — it never replaces or overrides the selected
// archetype/variant's own tokens wholesale.
//
// Deliberately NOT one full visual template per theme (the brief's
// explicit "do not build separate full visual templates for all 15 theme
// values" rule) — 5 packs cover the requested minimum (Space, Jungle,
// Princess/Fairytale, Cricket/Sports, Generic Celebration), matched via
// keyword against the host's free-text partyTheme, always with a safe
// fallback. No trademarked/copyrighted character names or imagery are
// referenced anywhere in this file — icon sets are plain, generic emoji
// only.
const THEME_PACKS = Object.freeze({
  space: {
    id: 'space', label: 'Space', motifId: 'stars',
    accentOverride: '#7C6BC4', icons: ['🚀', '🪐', '⭐', '🌙'],
    keywords: ['space', 'astronaut', 'rocket', 'galaxy', 'planet', 'star'],
  },
  jungle: {
    id: 'jungle', label: 'Jungle', motifId: 'botanical',
    accentOverride: '#5B8A4A', icons: ['🦁', '🐘', '🌴', '🦒'],
    keywords: ['jungle', 'safari', 'animal', 'zoo', 'wild'],
  },
  fairytale: {
    id: 'fairytale', label: 'Princess / Fairytale', motifId: 'storybook',
    accentOverride: '#C4779A', icons: ['👑', '✨', '🏰', '🦋'],
    keywords: ['princess', 'fairy', 'fairytale', 'castle', 'unicorn', 'magic'],
  },
  sports: {
    id: 'sports', label: 'Cricket / Sports', motifId: 'confetti',
    accentOverride: '#3B7DBF', icons: ['🏏', '⚽', '🏆', '🎉'],
    keywords: ['cricket', 'sport', 'football', 'game', 'match', 'team'],
  },
  'generic-celebration': {
    id: 'generic-celebration', label: 'Celebration', motifId: 'confetti',
    accentOverride: null, icons: ['🎈', '🎉', '🎂', '✨'],
    keywords: [],
  },
});

const FALLBACK_PACK_ID = 'generic-celebration';

export function getThemePack(packId) {
  return THEME_PACKS[packId] || THEME_PACKS[FALLBACK_PACK_ID];
}

export function listThemePacks() {
  return Object.values(THEME_PACKS);
}

// Resolves a host's free-text partyTheme value (kids-birthday schema
// content — "Jungle", "space adventure", "Cars", a fully custom string,
// etc.) to the closest theme pack via simple keyword matching, always
// falling back to 'generic-celebration' rather than ever returning
// nothing — a custom/unrecognized theme still gets a complete, working
// decorative treatment, just the neutral one.
export function resolveThemePackForPartyTheme(partyTheme) {
  const normalized = (partyTheme || '').toLowerCase().trim();
  if (!normalized) return getThemePack(FALLBACK_PACK_ID);
  for (const pack of listThemePacks()) {
    if (pack.keywords.some((kw) => normalized.includes(kw))) return pack;
  }
  return getThemePack(FALLBACK_PACK_ID);
}
