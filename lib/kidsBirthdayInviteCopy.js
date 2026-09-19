// Kids Birthday Theme-Aware Invite Designer — per-theme text content.
//
// Anish's brief (Sept 17): "tagline- auto fill according to theme, kicker
// text- auto generate, dress code- give ideas here as per birthday theme-
// host can select one." Kept in its own file, separate from
// lib/kidsBirthdayThemes.js (which is documented as pure visual/registry
// config — archetype, icons, palette), so this purely-copy content can
// change freely without touching that already-verified file. Covers all
// 18 real theme slugs from lib/kidsBirthdayThemes.js — every theme gets a
// tagline/kicker/dress-code set, not just the 3 piloted with real art.
//
// tagline/kickerText are used as silent DEFAULTS (only fill an empty
// field, host's own edit always wins — see
// lib/kidsBirthdayInviteDefaults.js). dressCodeIdeas are shown as
// tappable suggestion chips (see InviteFieldRenderer.js's `suggestions`
// prop) — the host taps one to fill the field, or types their own; never
// auto-filled silently, per "host can select one."
const COPY = {
  'jungle-safari': {
    tagline: 'Small explorers, big adventures',
    kickerText: "IT'S A JUNGLE ADVENTURE",
    dressCodeIdeas: ['Safari colours (khaki, green, brown)', 'Animal print welcome', 'Comfortable play clothes'],
  },
  'under-the-sea': {
    tagline: 'Dive into the fun',
    kickerText: 'MAKE A SPLASH',
    dressCodeIdeas: ['Ocean blues and greens', 'Mermaid or sailor style', 'Comfortable play clothes'],
  },
  'space-explorer': {
    tagline: 'Big dreams, brighter tomorrows',
    kickerText: 'BLAST OFF!',
    dressCodeIdeas: ['Astronaut or space colours (silver, blue, black)', 'Star-print welcome', 'Comfortable play clothes'],
  },
  'dinosaur-discovery': {
    tagline: 'Roar into another year',
    kickerText: 'A DINO-MITE BIRTHDAY',
    dressCodeIdeas: ['Earthy greens and browns', 'Dino print welcome', 'Comfortable play clothes'],
  },
  'unicorn-rainbows': {
    tagline: 'A little magic, a lot of fun',
    kickerText: "YOU'RE INVITED",
    dressCodeIdeas: ['Pastels and rainbow colours', 'Sparkle welcome', 'Comfortable play clothes'],
  },
  'princess-castle': {
    tagline: 'A royal celebration awaits',
    kickerText: 'A ROYAL INVITATION',
    dressCodeIdeas: ['Royal colours (gold, pink, purple)', 'Dress-up welcome', 'Comfortable play clothes'],
  },
  'superhero-squad': {
    tagline: 'Calling all superheroes',
    kickerText: 'SAVE THE DATE, HERO',
    dressCodeIdeas: ['Bold primary colours', 'Cape or mask welcome', 'Comfortable play clothes'],
  },
  'circus-carnival': {
    tagline: 'Step right up for the fun',
    kickerText: 'THE SHOW IS ABOUT TO START',
    dressCodeIdeas: ['Bright, festive colours', 'Stripes welcome', 'Comfortable play clothes'],
  },
  'sports-champions': {
    tagline: "Game on — let's celebrate",
    kickerText: "IT'S GAME DAY",
    dressCodeIdeas: ['Team colours', 'Jersey or sporty wear', 'Comfortable play clothes'],
  },
  'enchanted-garden': {
    tagline: 'A little garden magic',
    kickerText: "YOU'RE INVITED",
    dressCodeIdeas: ['Soft florals and pastels', 'Garden-party casual', 'Comfortable play clothes'],
  },
  'cars-wheels': {
    tagline: 'Start your engines',
    kickerText: 'READY, SET, CELEBRATE',
    dressCodeIdeas: ['Racing colours (red, black, yellow)', 'Checkered welcome', 'Comfortable play clothes'],
  },
  'teddy-rattles': {
    tagline: 'A cuddly little celebration',
    kickerText: "YOU'RE INVITED",
    dressCodeIdeas: ['Soft pastels', 'Cosy and comfortable', 'Comfortable play clothes'],
  },
  'wizarding-school': {
    tagline: 'A little bit of magic this way',
    kickerText: 'THE MAGIC BEGINS',
    dressCodeIdeas: ['Deep jewel tones', 'Wizard robe or cape welcome', 'Comfortable play clothes'],
  },
  'magic-kingdom-fairytale': {
    tagline: 'Once upon a birthday',
    kickerText: 'THE MAGIC BEGINS',
    dressCodeIdeas: ['Fairytale colours (gold, blue, pink)', 'Dress-up welcome', 'Comfortable play clothes'],
  },
  'candy-land': {
    tagline: 'A sweet celebration awaits',
    kickerText: "IT'S SWEET TO CELEBRATE",
    dressCodeIdeas: ['Bright candy colours', 'Sweet and playful', 'Comfortable play clothes'],
  },
  'tropical-luau': {
    tagline: 'Sunshine, fun and celebration',
    kickerText: "LET'S PARTY, ALOHA STYLE",
    dressCodeIdeas: ['Tropical prints and bright colours', 'Hawaiian shirt welcome', 'Comfortable play clothes'],
  },
  'music-dance-party': {
    tagline: "Let's dance the day away",
    kickerText: 'TURN UP THE MUSIC',
    dressCodeIdeas: ['Bright, fun colours', 'Dance-ready comfortable wear', 'Comfortable play clothes'],
  },
  'gaming-zone': {
    tagline: 'Level up and celebrate',
    kickerText: 'PLAYER ONE IS READY',
    dressCodeIdeas: ['Bold gaming colours', 'Comfortable, casual wear', 'Comfortable play clothes'],
  },
};

const FALLBACK = {
  tagline: "A birthday to remember",
  kickerText: "YOU'RE INVITED",
  dressCodeIdeas: ['Come as you are', 'Festive colours welcome', 'Comfortable play clothes'],
};

export function getKidsBirthdayInviteCopy(themeSlug) {
  return COPY[themeSlug] || FALLBACK;
}
