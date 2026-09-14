// Kids Birthday Theme-Aware Invite Designer — canonical theme registry.
//
// Reuses, rather than duplicates, the Plan screen's existing theme data
// (lib/eventThemes.js's EVENT_THEMES['kids-birthday']) for slug/label/
// palettes/motif-hint-text — those 18 slugs are the real, stable IDs
// already persisted via events.theme_slug (see
// supabase/migrations/20260913010000_event_theme_palette.sql) and read/
// written by components/SlotField.js's ThemeField. This file does NOT
// invent a second, competing set of theme ids — per the spec's own
// instruction: "If Event Planning already uses stable IDs/slugs, preserve
// those rather than creating incompatible duplicates." No host/event data
// lives in this file — it is pure, static, renderer-agnostic config, same
// discipline as lib/priceEngine.js and lib/eventThemes.js.
//
// Per the spec's explicit architectural mandate — "Do NOT create 18
// independent archetypes" — every theme below resolves to one of the
// three archetype/variant combinations already IMPLEMENTED and already
// recommended for kids-birthday in
// lib/inviteDesignArchetypes/catalogue.js's EVENT_STRONG_ARCHETYPES
// ('playful-pop', 'illustrated-story', 'celestial' — 'photo-editorial'/
// 'cultural-poster' are also strong-listed there but are poor fits for a
// themed kids' party card and are left unused by this registry).
// Differentiation between themes sharing an archetype/variant comes from
// a real accent colour (sourced directly from that theme's own
// eventThemes.js palette — never invented here), a small generic icon
// set, and a copy tone — not a forked renderer, not 18 bespoke
// components.
//
// Icon sets are plain, generic, non-branded emoji only. This is the
// strictest constraint for Superhero Squad, Wizarding School, Magic
// Kingdom Fairytale, Candy Land, Gaming Zone and Cars & Wheels — no
// franchise characters, logos, or trademarked crests anywhere below.
import { EVENT_THEMES } from './eventThemes';

const SOURCE_THEMES = EVENT_THEMES['kids-birthday'] || [];
const SOURCE_BY_SLUG = Object.fromEntries(SOURCE_THEMES.map((t) => [t.slug, t]));

// archetypeId/variantId pairs — both real, IMPLEMENTED entries verified
// directly against lib/inviteDesignArchetypes/catalogue.js before writing
// this file, not assumed from the spec's prose.
const CONFETTI = { archetypeId: 'playful-pop', variantId: 'confetti-pop' };
const COMIC = { archetypeId: 'playful-pop', variantId: 'comic-burst' };
const STORYBOOK = { archetypeId: 'illustrated-story', variantId: 'storybook-party' };
const SPACE = { archetypeId: 'celestial', variantId: 'space-adventure' };

// Note: eventThemes.js's own `motifs` text hint for 'under-the-sea'
// includes "Mermaid" (a Plan-screen chip label shown when a host is
// choosing a theme NAME, authored before this spec). This registry's
// icon set deliberately leaves mermaid imagery out of generated invite
// artwork, per this spec's explicit "do not assume mermaid imagery
// unless the host explicitly selects an appropriate direction" rule.
// The two data sources are allowed to differ: eventThemes.js's motifs are
// planning-side descriptive text, not generated visuals.
const REGISTRY = {
  'jungle-safari': { ...STORYBOOK, copyTone: 'adventure', icons: ['🦁', '🐘', '🐒', '🌿'] },
  'under-the-sea': { ...STORYBOOK, copyTone: 'playful', icons: ['🐠', '🐙', '⭐', '🫧'] },
  // Spec note: "Prefer existing Celestial architecture where appropriate."
  'space-explorer': { ...SPACE, copyTone: 'adventure', icons: ['🧑‍🚀', '🚀', '🪐', '⭐'] },
  // "Keep illustrations child-friendly rather than frightening."
  'dinosaur-discovery': { ...STORYBOOK, copyTone: 'adventure', icons: ['🦕', '🦖', '🌋', '🌿'] },
  // "Do not force this theme based on gender."
  'unicorn-rainbows': { ...STORYBOOK, copyTone: 'magical', icons: ['🦄', '☁️', '⭐', '🌈'] },
  // "Host-selected theme only."
  'princess-castle': { ...STORYBOOK, copyTone: 'magical', icons: ['🏰', '👑', '🌹', '⭐'] },
  // CRITICAL COPYRIGHT: generic superhero visual language only — no
  // Marvel/DC/named-character imagery anywhere in this icon set.
  'superhero-squad': { ...COMIC, copyTone: 'energetic', icons: ['🦸', '⚡', '🏙️', '💥'] },
  'circus-carnival': { ...CONFETTI, copyTone: 'playful', icons: ['🎪', '🎈', '🍿', '🎡'] },
  // "Do not automatically use copyrighted professional team logos."
  'sports-champions': { ...CONFETTI, copyTone: 'energetic', icons: ['🏆', '🏟️', '🎽', '🥇'] },
  'enchanted-garden': { ...STORYBOOK, copyTone: 'warm', icons: ['🦋', '🌸', '🍃', '✨'] },
  // "Do not use branded car designs or movie characters."
  'cars-wheels': { ...COMIC, copyTone: 'energetic', icons: ['🏎️', '🏁', '🛞', '🚦'] },
  // "Do not infer palette from child's gender."
  'teddy-rattles': { ...STORYBOOK, copyTone: 'warm', icons: ['🧸', '🍼', '🧱', '🎈'] },
  // CRITICAL COPYRIGHT: generic fantasy/wizard only — no Harry Potter,
  // Hogwarts, house crests, or franchise-specific terms anywhere here.
  'wizarding-school': { ...SPACE, copyTone: 'magical', icons: ['🪄', '📖', '🦉', '🕯️'] },
  // CRITICAL COPYRIGHT: this is NOT Disney — no castle branding, Mickey
  // silhouette, or princess likenesses anywhere here.
  'magic-kingdom-fairytale': { ...STORYBOOK, copyTone: 'magical', icons: ['🏰', '🎆', '🪄', '⭐'] },
  // "Do not copy Hasbro's Candy Land board-game artwork or branding" —
  // generic confectionery imagery only.
  'candy-land': { ...CONFETTI, copyTone: 'playful', icons: ['🍭', '🍬', '🍡', '✨'] },
  'tropical-luau': { ...STORYBOOK, copyTone: 'energetic', icons: ['🌴', '🍍', '🌺', '☀️'] },
  // "Should naturally work with the DJ/Dance Party activity when selected"
  // — see lib/kidsBirthdayInviteDefaults.js's activity-label mapping.
  'music-dance-party': { ...COMIC, copyTone: 'energetic', icons: ['🪩', '🎧', '💿', '🎵'] },
  // "Do not use copyrighted game characters, console logos or branded
  // controller trade dress" — generic joystick/pixel imagery only.
  'gaming-zone': { ...SPACE, copyTone: 'cool', icons: ['🎮', '🕹️', '⭐', '🪙'] },
};

const FALLBACK_ENTRY = {
  archetypeId: 'playful-pop', variantId: 'confetti-pop', copyTone: 'playful',
  icons: ['🎈', '🎉', '🎂', '✨'],
};
const FALLBACK_DISPLAY_LABEL = 'Birthday Celebration';

function decorate(slug) {
  const source = SOURCE_BY_SLUG[slug];
  const reg = REGISTRY[slug];
  if (!source || !reg) return null;
  return {
    slug,
    displayName: source.label,
    ageAffinity: source.ages,
    archetypeId: reg.archetypeId,
    variantId: reg.variantId,
    copyTone: reg.copyTone,
    icons: reg.icons,
    // [{name, colors:[primary,secondary]}, ...] — the exact same palette
    // data events.theme_palette already indexes into on the Plan screen;
    // not re-authored here.
    palettes: source.palettes,
    motifVocabulary: source.motifs,
  };
}

export function listKidsBirthdayThemes() {
  return SOURCE_THEMES.map((t) => decorate(t.slug)).filter(Boolean);
}

// Centralized fuzzy-text resolver — the ONLY place a free-text or legacy
// theme value gets matched against the registry, per the spec's
// "centralized fuzzy resolver only (not scattered string matching)"
// instruction. Tries an exact slug match first (the normal, correct case
// — events.theme_slug is already a stable slug from the Plan screen's own
// chip picker), then a loose match against the display label for
// old/hand-typed data, and returns null (never throws) if nothing
// matches — callers fall back to the generic entry.
export function resolveKidsBirthdayTheme(themeSlugOrText) {
  const raw = (themeSlugOrText || '').toString().trim();
  if (!raw) return null;
  const exact = decorate(raw);
  if (exact) return exact;
  const normalized = raw.toLowerCase();
  const fuzzyMatch = SOURCE_THEMES.find((t) =>
    normalized.includes(t.slug.replace(/-/g, ' ')) || normalized.includes(t.label.toLowerCase())
  );
  return fuzzyMatch ? decorate(fuzzyMatch.slug) : null;
}

// The one production-safe resolver a picker/renderer should call.
// Deterministic: the same (themeSlug, paletteName) pair always returns
// the same shape, so a persisted selection renders identically after
// reload. Never throws, never returns an archetype/variant pair that
// isn't real — an unknown/free-text/missing theme falls back to the
// generic Playful Pop treatment rather than crashing or rendering blank.
//
// paletteName (not an index): events.theme_palette is a TEXT column that
// stores the palette's own `name` (see components/SlotField.js's
// ThemeField, which saves `theme_palette: p.name` when a host picks a
// palette chip) or null when unset. This used to be typed/treated as a
// numeric array index, which meant `resolved.palettes[paletteName]` was
// always undefined for any real (string) value passed in and silently
// fell back to palettes[0] every time — a host picking the second
// palette chip had no visible effect. Matching on name is what actually
// round-trips what's persisted.
export function getKidsBirthdayInviteOptions(themeSlug, paletteName = null) {
  const resolved = resolveKidsBirthdayTheme(themeSlug);
  if (!resolved) {
    return {
      archetypeId: FALLBACK_ENTRY.archetypeId,
      variantId: FALLBACK_ENTRY.variantId,
      accentOverride: null,
      icons: FALLBACK_ENTRY.icons,
      copyTone: FALLBACK_ENTRY.copyTone,
      displayLabel: FALLBACK_DISPLAY_LABEL,
      shortDescriptor: 'A cheerful, theme-neutral birthday design',
      isFallback: true,
    };
  }
  const palette = resolved.palettes.find((p) => p.name === paletteName) || resolved.palettes[0];
  return {
    archetypeId: resolved.archetypeId,
    variantId: resolved.variantId,
    accentOverride: palette?.colors?.[0] || null,
    icons: resolved.icons,
    copyTone: resolved.copyTone,
    // Friendly, host-facing label — never an engineering composition like
    // "illustrated-story / jungle-safari / palette-2".
    displayLabel: palette ? `${resolved.displayName} — ${palette.name}` : resolved.displayName,
    shortDescriptor: (resolved.motifVocabulary || []).slice(0, 3).join(' · '),
    isFallback: false,
  };
}
