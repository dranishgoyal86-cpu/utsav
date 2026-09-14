// Structured "party theme" options — only kids-birthday has themes today,
// same scope as before this rewrite (see components/SlotField.js's
// ThemeField for how these render: a chip grid, then a color-palette choice
// for whichever theme is picked, plus a trailing "Other" chip for a
// host's own custom name).
//
// Birthday Event Improvement plan (Piece 2, Sept 2026) — two deliberate
// product decisions baked into this data, both confirmed with Anish:
// 1. No hard boy/girl split. `popularFor` is a soft, non-restrictive
//    ordering/suggestion hint only — every theme is pickable regardless of
//    its tag. Values: 'girl', 'boy', 'neutral' (a theme can carry more than
//    one).
// 2. `motifs` are deliberately generic, non-branded inspiration text —
//    never a real owned character or franchise name (Wizarding School and
//    Magic Kingdom Fairytale are the intentional generic stand-ins for
//    "Harry Potter" and "Disney", which Anish's original examples named
//    directly — trademark risk, see the plan doc). A host who wants a
//    branded name for their own private planning still can, via the
//    "Other" custom-text option SlotField.js renders — the app itself just
//    never lists, suggests, or generates branded content.
//
// `ages` is the same kind of soft hint, pointing at lib/eventSubTypes.js's
// EVENT_SUB_TYPES slugs for kids-birthday (first-birthday/toddler-2-4/
// kids-5-12/teen-13-17) — again ordering only, not a filter; a first
// birthday can still pick "Gaming Zone" if that's genuinely what the host
// wants.
//
// `palettes`: 2 named color options per theme (each a [primary, secondary]
// hex pair) — chosen and saved separately via events.theme_palette (see
// supabase/migrations/*_event_theme_palette.sql), not folded into the theme
// object itself, so switching palettes doesn't mean re-picking the theme.
export const EVENT_THEMES = {
  'kids-birthday': [
    {
      slug: 'jungle-safari', label: 'Jungle Safari', emoji: '🦁',
      popularFor: ['neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Lion', 'Elephant', 'Monkey', 'Zebra'],
      palettes: [
        { name: 'Emerald & Gold', colors: ['#1B4D3E', '#D4A03C'] },
        { name: 'Sunset Orange', colors: ['#C2571A', '#F2A65A'] },
      ],
    },
    {
      slug: 'under-the-sea', label: 'Under the Sea', emoji: '🐠',
      popularFor: ['neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Mermaid', 'Octopus', 'Starfish', 'Dolphin'],
      palettes: [
        { name: 'Ocean Blue & Coral', colors: ['#0B4F6C', '#FF6F59'] },
        { name: 'Aqua & Silver', colors: ['#0FA3B1', '#CFD8DC'] },
      ],
    },
    {
      slug: 'space-explorer', label: 'Space Explorer', emoji: '🚀',
      popularFor: ['neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Astronaut', 'Rocket', 'Planets', 'Stars'],
      palettes: [
        { name: 'Galaxy Navy & Silver', colors: ['#0D1B2A', '#C0C7D1'] },
        { name: 'Cosmic Purple & Gold', colors: ['#3C1361', '#F2C14E'] },
      ],
    },
    {
      slug: 'dinosaur-discovery', label: 'Dinosaur Discovery', emoji: '🦖',
      popularFor: ['boy', 'neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['T-Rex', 'Triceratops', 'Volcano', 'Fossils'],
      palettes: [
        { name: 'Jungle Green & Brown', colors: ['#2E5339', '#6B4226'] },
        { name: 'Volcanic Orange & Black', colors: ['#D1495B', '#1B1B1B'] },
      ],
    },
    {
      slug: 'unicorn-rainbows', label: 'Unicorn & Rainbows', emoji: '🦄',
      popularFor: ['girl', 'neutral'], ages: ['first-birthday', 'toddler-2-4', 'kids-5-12'],
      motifs: ['Unicorn', 'Clouds', 'Stars', 'Rainbow'],
      palettes: [
        { name: 'Pastel Rainbow', colors: ['#F7A8C4', '#A0E7E5'] },
        { name: 'Lavender & Gold', colors: ['#B39DDB', '#F2C14E'] },
      ],
    },
    {
      slug: 'princess-castle', label: 'Princess Castle', emoji: '👑',
      popularFor: ['girl', 'neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Castle', 'Crown', 'Carriage', 'Roses'],
      palettes: [
        { name: 'Blush Pink & Gold', colors: ['#F4C2C2', '#D4A03C'] },
        { name: 'Royal Purple & Silver', colors: ['#5E366E', '#C0C7D1'] },
      ],
    },
    {
      slug: 'superhero-squad', label: 'Superhero Squad', emoji: '🦸',
      popularFor: ['boy', 'neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Cape', 'Mask', 'City Skyline', 'Lightning Bolt'],
      palettes: [
        { name: 'Red & Blue Classic', colors: ['#C1272D', '#1B3A6B'] },
        { name: 'Black & Gold Stealth', colors: ['#1B1B1B', '#D4A03C'] },
      ],
    },
    {
      slug: 'circus-carnival', label: 'Circus Carnival', emoji: '🎪',
      popularFor: ['neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Ringmaster', 'Balloons', 'Popcorn', 'Ferris Wheel'],
      palettes: [
        { name: 'Red & Gold Big Top', colors: ['#B22222', '#D4A03C'] },
        { name: 'Pastel Carnival', colors: ['#F7A8C4', '#A0E7E5'] },
      ],
    },
    {
      slug: 'sports-champions', label: 'Sports Champions', emoji: '⚽',
      popularFor: ['boy', 'neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Trophy', 'Stadium', 'Jersey Numbers', 'Medal'],
      palettes: [
        { name: 'Trophy Gold & Navy', colors: ['#D4A03C', '#1B3A6B'] },
        { name: 'Bold Team Colors', colors: ['#C1272D', '#1B1B1B'] },
      ],
    },
    {
      slug: 'enchanted-garden', label: 'Enchanted Garden', emoji: '🌸',
      popularFor: ['girl', 'neutral'], ages: ['first-birthday', 'toddler-2-4'],
      motifs: ['Butterflies', 'Flowers', 'Fairy Lights', 'Toadstools'],
      // Default primary was '#F4C2C2', identical to princess-castle's
      // default — reordered so the palette's own sage green leads instead
      // (still the same two colors, just distinct from princess-castle by
      // default now; see lib/kidsBirthdayThemes.js header for why default
      // accent distinctness matters).
      palettes: [
        { name: 'Sage & Blush', colors: ['#87A96B', '#F4C2C2'] },
        { name: 'Buttercream & Gold', colors: ['#FFF3DC', '#D4A03C'] },
      ],
    },
    {
      slug: 'cars-wheels', label: 'Cars & Wheels', emoji: '🏎️',
      popularFor: ['boy', 'neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Race Track', 'Tires', 'Traffic Light', 'Trophy'],
      // Default primary was '#C1272D', identical to superhero-squad's
      // default (both playful-pop/comic-burst) — reordered so this
      // theme's own blue palette leads instead.
      palettes: [
        { name: 'Cool Blue & Silver', colors: ['#1B6CA8', '#C0C7D1'] },
        { name: 'Racing Red & Checkered', colors: ['#C1272D', '#1B1B1B'] },
      ],
    },
    {
      slug: 'teddy-rattles', label: 'Teddy & Rattles', emoji: '🧸',
      popularFor: ['neutral'], ages: ['first-birthday'],
      motifs: ['Teddy Bear', 'Rattle', 'Building Blocks', 'Balloons'],
      palettes: [
        { name: 'Soft Cream & Sage', colors: ['#FFF3DC', '#87A96B'] },
        { name: 'Powder Blue & White', colors: ['#AFCBFF', '#FFFFFF'] },
      ],
    },
    {
      // Generic stand-in for "Harry Potter" — see file header.
      slug: 'wizarding-school', label: 'Wizarding School', emoji: '🪄',
      popularFor: ['neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Wand', 'Spellbook', 'Owl', 'Candles'],
      // Default primary was '#1B4D3E', identical to jungle-safari's
      // default — reordered so this theme's own purple palette leads
      // instead (the two themes already render on different archetypes/
      // backgrounds, but the data itself shouldn't collide either).
      palettes: [
        { name: 'Deep Purple & Silver', colors: ['#3C1361', '#C0C7D1'] },
        { name: 'Emerald & Bronze', colors: ['#1B4D3E', '#B08D57'] },
      ],
    },
    {
      // Generic stand-in for "Disney" — see file header.
      slug: 'magic-kingdom-fairytale', label: 'Magic Kingdom Fairytale', emoji: '✨',
      popularFor: ['neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Castle', 'Fireworks', 'Fairy Wand', 'Glass Slipper'],
      // Default primary was '#F7A8C4', identical to unicorn-rainbows'
      // default (both illustrated-story/storybook-party). Reordering to
      // this theme's own second palette isn't safe either — that one
      // ('#0D1B2A') collides with space-explorer's default — so this uses
      // a new lilac tone instead, keeping the same secondary and name
      // intent (a pastel, not the deep-blue option below).
      palettes: [
        { name: 'Lilac Castle & Sky', colors: ['#C9A0DC', '#AFCBFF'] },
        { name: 'Midnight Blue & Gold', colors: ['#0D1B2A', '#D4A03C'] },
      ],
    },
    {
      slug: 'candy-land', label: 'Candy Land', emoji: '🍭',
      popularFor: ['neutral'], ages: ['toddler-2-4', 'kids-5-12'],
      motifs: ['Lollipop', 'Gumdrops', 'Candy Cane', 'Swirl Lines'],
      palettes: [
        { name: 'Bubblegum Pink & Mint', colors: ['#FF6FA5', '#98E4D6'] },
        { name: 'Rainbow Sherbet', colors: ['#F7A8C4', '#F2C14E'] },
      ],
    },
    {
      slug: 'tropical-luau', label: 'Tropical Luau', emoji: '🌺',
      popularFor: ['neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Palm Tree', 'Pineapple', 'Hibiscus', 'Surfboard'],
      palettes: [
        { name: 'Sunset Coral & Turquoise', colors: ['#FF6F59', '#0FA3B1'] },
        { name: 'Pineapple Yellow & Green', colors: ['#F2C14E', '#2E5339'] },
      ],
    },
    {
      slug: 'music-dance-party', label: 'Music & Dance Party', emoji: '🎧',
      popularFor: ['neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Disco Ball', 'Headphones', 'Vinyl Record', 'Speaker'],
      palettes: [
        { name: 'Neon Nights', colors: ['#FF00A0', '#00E5FF'] },
        { name: 'Disco Gold & Black', colors: ['#D4A03C', '#1B1B1B'] },
      ],
    },
    {
      slug: 'gaming-zone', label: 'Gaming Zone', emoji: '🎮',
      popularFor: ['boy', 'neutral'], ages: ['kids-5-12', 'teen-13-17'],
      motifs: ['Joystick', 'Pixel Art', 'Controller', 'Power-Up Star'],
      palettes: [
        { name: 'Neon Green & Black', colors: ['#39FF14', '#1B1B1B'] },
        { name: 'Retro Arcade', colors: ['#FF6F59', '#0FA3B1'] },
      ],
    },
  ],
};

export function getThemeOptions(eventTypeSlug) {
  return EVENT_THEMES[eventTypeSlug] || [];
}
