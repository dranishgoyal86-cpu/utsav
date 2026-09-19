// Kids Birthday Theme-Aware Invite Designer — Image Template pilot.
//
// Anish's brief (Sept 17): for kids-birthday, a host should see real,
// fully-illustrated invite designs per theme (not the generic archetype
// cards) — up to 5 per theme, host picks one, the app fills in the real
// event details on top. This registry is the ONLY place that maps a
// kids-birthday theme slug to its real illustrated image(s) and where on
// each image the real text belongs.
//
// Pilot scope (Sept 17, two batches): 16 of the 18 kids-birthday themes now
// have 1 real image each, from Anish's own reference images
// (assets/inviteTemplates/kidsBirthday/*.jpg — bundled as local app assets
// via require(), the same convention this app's icons/logo already use; no
// Cloudinary needed for these since they ship inside the app itself, not
// per-host uploads). Still missing: 'under-the-sea' and 'music-dance-party'
// — no art received for either yet. Every theme without an entry here is
// completely unaffected — it keeps using the existing archetype/
// StaticInviteCard system exactly as before (see
// components/invite/ProductionInviteCard.js's branch order: image ideas
// are only ever tried for a theme that HAS some). Nothing about this file
// changes any other event type or any theme still without art.
//
// Each idea's `overlays` array says, for ONE of these three coordinate
// systems only, what real text to paint on top of the artwork and where —
// rect values are fractions of the image's own width/height (0..1), read
// off Anish's reference images by eye, not pixel-measured; they're a
// reasonable starting point, not guaranteed-exact, and can be nudged once
// seen live on a phone. Everything else on these images (the big
// headline, the RSVP button, the decorative art) is already exactly right
// as drawn — this only replaces the placeholder words ("NAME", "AGE",
// "DATE • TIME • PLACE") with the real event's details.
//
// `field` names below are resolved by components/invite/ImageTemplateCard.js
// from the real schema values + event row — this file only describes
// WHERE, never HOW a value is computed (same "content vs. layout" split
// the rest of the invite system already keeps).
const BOX_STYLE = { align: 'center', weight: '800' };

export const KIDS_BIRTHDAY_IMAGE_IDEAS = {
  'space-explorer': [
    {
      id: 'space-explorer-1',
      label: 'Blast Off!',
      image: require('../assets/inviteTemplates/kidsBirthday/space-explorer-1.jpg'),
      aspectRatio: 1060 / 1484,
      overlays: [
        {
          field: 'kicker', // "<Child's name>'s Birthday Mission"
          rect: { top: 0.325, left: 0.16, width: 0.68, height: 0.045 },
          ...BOX_STYLE, fontSize: 15, color: '#1B3E8C', bg: '#EAF2FF',
        },
        {
          field: 'age', // "Turning <age>"
          rect: { top: 0.505, left: 0.355, width: 0.29, height: 0.055 },
          ...BOX_STYLE, fontSize: 18, color: '#1B3E8C', bg: '#EAF2FF',
        },
        {
          field: 'details', // date · time · venue, 2-3 short lines
          rect: { top: 0.575, left: 0.275, width: 0.45, height: 0.14 },
          align: 'center', weight: '700', fontSize: 13, color: '#1B3E8C', bg: '#EAF2FF', multiline: true,
        },
      ],
    },
  ],
  'unicorn-rainbows': [
    {
      id: 'unicorn-rainbows-1',
      label: 'A Magical Birthday',
      image: require('../assets/inviteTemplates/kidsBirthday/unicorn-rainbows-1.jpg'),
      aspectRatio: 1060 / 1484,
      overlays: [
        {
          field: 'nameAge', // "<Child's name> Turns <age>"
          rect: { top: 0.495, left: 0.20, width: 0.60, height: 0.05 },
          ...BOX_STYLE, fontSize: 16, color: '#7A4EA6', bg: '#FBF4FF',
        },
        {
          field: 'details',
          rect: { top: 0.575, left: 0.28, width: 0.44, height: 0.05 },
          align: 'center', weight: '700', fontSize: 12, color: '#7A4EA6', bg: '#FBF4FF', multiline: true,
        },
      ],
    },
  ],
  'jungle-safari': [
    {
      id: 'jungle-safari-1',
      label: 'A Wild Birthday Adventure',
      image: require('../assets/inviteTemplates/kidsBirthday/jungle-safari-1.jpg'),
      aspectRatio: 1060 / 1484,
      overlays: [
        {
          field: 'nameAge', // "<Child's name> Turns <age>"
          rect: { top: 0.615, left: 0.19, width: 0.62, height: 0.055 },
          ...BOX_STYLE, fontSize: 16, color: '#5A3A1A', bg: '#F3E6C8',
        },
        {
          field: 'details',
          rect: { top: 0.69, left: 0.23, width: 0.54, height: 0.045 },
          align: 'center', weight: '700', fontSize: 12, color: '#2F5D2B', bg: '#F3F8EC', multiline: true,
        },
      ],
    },
  ],

  // Sept 17 (second batch) — 13 more themes' art, same reference source and
  // same "reasonable eyeballed rect, not pixel-measured" caveat as the
  // header comment above. Every one of these follows the exact same
  // "NAME TURNS AGE" banner + "DATE • TIME • PLACE" line pattern already
  // built for jungle-safari/unicorn-rainbows above — same two `field`s
  // (nameAge, details), same ImageTemplateCard.js, no new code, only new
  // registry data. RSVP is already correct, baked art on every one of
  // these and is never overlaid.
  'dinosaur-discovery': [{
    id: 'dinosaur-discovery-1',
    label: 'A Roar-Some Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/dinosaur-discovery-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.549, left: 0.22, width: 0.56, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#6B4A23', bg: '#F0E6C8' },
      { field: 'details', rect: { top: 0.593, left: 0.26, width: 0.48, height: 0.045 }, align: 'center', weight: '700', fontSize: 12, color: '#4A6B3A', bg: '#F0E6C8', multiline: true },
    ],
  }],
  'princess-castle': [{
    id: 'princess-castle-1',
    label: 'A Royal Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/princess-castle-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.643, left: 0.24, width: 0.53, height: 0.05 }, ...BOX_STYLE, fontSize: 16, color: '#8B5FA8', bg: '#FCEEF5' },
      { field: 'details', rect: { top: 0.701, left: 0.32, width: 0.38, height: 0.04 }, align: 'center', weight: '700', fontSize: 12, color: '#8B5FA8', bg: '#FCEEF5', multiline: true },
    ],
  }],
  'superhero-squad': [{
    id: 'superhero-squad-1',
    label: 'A Super Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/superhero-squad-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.499, left: 0.22, width: 0.56, height: 0.04 }, ...BOX_STYLE, fontSize: 15, color: '#111111', bg: '#FFFFFF' },
      { field: 'details', rect: { top: 0.532, left: 0.26, width: 0.48, height: 0.04 }, align: 'center', weight: '700', fontSize: 12, color: '#111111', bg: '#FFFFFF', multiline: true },
    ],
  }],
  'circus-carnival': [{
    id: 'circus-carnival-1',
    label: 'A Carnival Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/circus-carnival-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.576, left: 0.24, width: 0.53, height: 0.048 }, ...BOX_STYLE, fontSize: 15, color: '#B3151B', bg: '#FBF3D9' },
      { field: 'details', rect: { top: 0.623, left: 0.28, width: 0.44, height: 0.04 }, align: 'center', weight: '700', fontSize: 12, color: '#1B3A6B', bg: '#FBF3D9', multiline: true },
    ],
  }],
  'sports-champions': [{
    id: 'sports-champions-1',
    label: 'A Champion Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/sports-champions-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.600, left: 0.23, width: 0.54, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#0B2A5B', bg: '#FFFFFF' },
      { field: 'details', rect: { top: 0.643, left: 0.31, width: 0.38, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#E0791A', bg: '#FFFFFF', multiline: true },
    ],
  }],
  'cars-wheels': [{
    id: 'cars-wheels-1',
    label: 'A Fast & Fun Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/cars-wheels-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.495, left: 0.20, width: 0.60, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#1A1A1A', bg: '#FFFFFF' },
      { field: 'details', rect: { top: 0.596, left: 0.31, width: 0.38, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#1A1A1A', bg: '#FFFFFF', multiline: true },
    ],
  }],
  'teddy-rattles': [{
    id: 'teddy-rattles-1',
    label: 'A Sweet Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/teddy-rattles-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.610, left: 0.24, width: 0.53, height: 0.048 }, ...BOX_STYLE, fontSize: 15, color: '#8C6A3D', bg: '#F3E2C0' },
      { field: 'details', rect: { top: 0.677, left: 0.34, width: 0.35, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#5C7A9E', bg: '#F3E2C0', multiline: true },
    ],
  }],
  'enchanted-garden': [{
    id: 'enchanted-garden-1',
    label: 'An Enchanted Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/enchanted-garden-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.441, left: 0.31, width: 0.38, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#4C6B3A', bg: '#F7DCE6' },
      { field: 'details', rect: { top: 0.495, left: 0.35, width: 0.32, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#4C6B3A', bg: '#F7DCE6', multiline: true },
    ],
  }],
  'wizarding-school': [{
    id: 'wizarding-school-1',
    label: 'A Magical Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/wizarding-school-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.569, left: 0.24, width: 0.53, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#5C1A2E', bg: '#F3E7C9' },
      { field: 'details', rect: { top: 0.617, left: 0.30, width: 0.40, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#5C1A2E', bg: '#F3E7C9', multiline: true },
    ],
  }],
  'magic-kingdom-fairytale': [{
    id: 'magic-kingdom-fairytale-1',
    label: 'A Fairytale Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/magic-kingdom-fairytale-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.623, left: 0.28, width: 0.44, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#2B3A6B', bg: '#FBF6EC' },
      { field: 'details', rect: { top: 0.670, left: 0.33, width: 0.36, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#2B3A6B', bg: '#FBF6EC', multiline: true },
    ],
  }],
  'candy-land': [{
    id: 'candy-land-1',
    label: 'A Sweet Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/candy-land-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.600, left: 0.26, width: 0.48, height: 0.048 }, ...BOX_STYLE, fontSize: 15, color: '#D6247A', bg: '#FCE3EF' },
      { field: 'details', rect: { top: 0.643, left: 0.31, width: 0.38, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#5A3A1A', bg: '#FCE3EF', multiline: true },
    ],
  }],
  'tropical-luau': [{
    id: 'tropical-luau-1',
    label: 'A Tropical Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/tropical-luau-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.633, left: 0.22, width: 0.56, height: 0.045 }, ...BOX_STYLE, fontSize: 15, color: '#D6247A', bg: '#FBF3DC' },
      { field: 'details', rect: { top: 0.674, left: 0.31, width: 0.38, height: 0.038 }, align: 'center', weight: '700', fontSize: 12, color: '#1A7A8C', bg: '#FBF3DC', multiline: true },
    ],
  }],
  // gaming-zone follows the OTHER pattern (like space-explorer above): two
  // blank, editable boxes already drawn into the art (no baked placeholder
  // text to paint over) — "kicker" isn't used here (this design's own
  // "A GAMING ZONE BIRTHDAY" headline needs no name insert), just the two
  // blank boxes + skip the RSVP box (already correct, baked text).
  'gaming-zone': [{
    id: 'gaming-zone-1',
    label: 'A Gaming Zone Birthday',
    image: require('../assets/inviteTemplates/kidsBirthday/gaming-zone-1.jpg'),
    aspectRatio: 1060 / 1484,
    overlays: [
      { field: 'nameAge', rect: { top: 0.569, left: 0.22, width: 0.56, height: 0.037 }, align: 'center', weight: '800', fontSize: 14, color: '#7FE8FF', bg: '#10203D' },
      { field: 'details', rect: { top: 0.623, left: 0.22, width: 0.56, height: 0.061 }, align: 'center', weight: '700', fontSize: 12, color: '#B9F3FF', bg: '#10203D', multiline: true },
    ],
  }],
};

// The one production-safe lookup — never throws, returns [] for any theme
// slug with no real art yet (which is most of them, for now).
export function getKidsBirthdayImageIdeas(themeSlug) {
  if (!themeSlug) return [];
  return KIDS_BIRTHDAY_IMAGE_IDEAS[themeSlug] || [];
}

export function getKidsBirthdayImageIdeaById(themeSlug, ideaId) {
  return getKidsBirthdayImageIdeas(themeSlug).find((idea) => idea.id === ideaId) || null;
}
