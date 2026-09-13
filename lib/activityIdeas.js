// Activity Ideas Library — Birthday Event Improvement plan, Piece 3.
// A browsable, opt-in catalog of extra kids'-party activities (Anish's own
// India-specific list), organized the way he asked: "basic categories like
// entertainment, creative activities and then sub events as suggestion to
// host... only if host choose to look for added activities ideas."
//
// This is a static catalog, not event_requirements — nothing here shows up
// on a host's checklist automatically. A host who opts in and taps "+ Add"
// on one of these (components/ActivityIdeasLibrary.js) gets a real row
// written to the new `event_extra_activities` table for their event, which
// PlanView.js/useEventPlan.js then folds into the same P5 checklist bucket
// as everything else, using this item's `categorySlug` so it matches real
// vendors exactly like any other checklist item.
//
// `categorySlug` is a real vendorTaxonomy.js "Parent > Subcategory" key
// (the same format resolveMatchKey() produces) — not a made-up slug. Most
// of Anish's list already had a genuine matching subcategory; only four
// activity types didn't, and those four subcategories (Craft Activity
// Counters, Play Zone Equipment, Storytellers, Ventriloquists) were added
// to vendorTaxonomy.js's 'Kids Party Services' entry rather than inventing
// a slug with no real vendor category behind it (see that file's comment).
//
// `themeSlugs` is a soft, non-exhaustive tag: when the host has already
// picked one of these themes (lib/eventThemes.js), the matching activities
// surface first as "Suggested for your theme" — this is what folds in
// Anish's "Theme-Based Add-ons" list without giving it a separate category
// of its own, per the plan doc's consolidation decision.
//
// `ages` is display-only (shown as a "Best for: ..." hint), not a filter —
// the whole point of this being opt-in browsing is that a host can still
// add anything regardless of the usual age fit.
export const ACTIVITY_CATEGORIES = {
  'kids-birthday': [
    {
      slug: 'creative-counters',
      label: 'Creative Counters',
      emoji: '🎨',
      items: [
        { slug: 'pot-painting', name: 'Pot Painting', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens' },
        { slug: 'canvas-painting', name: 'Canvas Painting', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens' },
        { slug: 'clay-modelling', name: 'Clay Modelling', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Toddlers–Kids' },
        { slug: 'slime-making', name: 'Slime Making', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens', themeSlugs: ['gaming-zone'] },
        { slug: 'bracelet-bead-making', name: 'Bracelet & Bead Making', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens', themeSlugs: ['unicorn-rainbows', 'candy-land'] },
        { slug: 'diy-crown-cap-making', name: 'DIY Crown / Cap Making', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Toddlers–Kids', themeSlugs: ['princess-castle', 'superhero-squad'] },
        { slug: 'mask-making', name: 'Mask Making', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens', themeSlugs: ['superhero-squad', 'circus-carnival'] },
        { slug: 'paper-craft-origami', name: 'Paper Craft / Origami', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens' },
        { slug: 'fridge-magnet-making', name: 'Fridge Magnet Making', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens' },
        { slug: 't-shirt-painting', name: 'T-Shirt Painting', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Kids–Teens' },
        { slug: 'cupcake-decoration', name: 'Cupcake Decoration', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Toddlers–Kids', themeSlugs: ['candy-land'] },
        { slug: 'cookie-decoration', name: 'Cookie Decoration', categorySlug: 'Kids Party Services > Craft Activity Counters', ages: 'Toddlers–Kids', themeSlugs: ['candy-land'] },
      ],
    },
    {
      slug: 'more-fun-food-counters',
      label: 'More Fun Food Counters',
      emoji: '🍔',
      items: [
        { slug: 'chocolate-fountain', name: 'Chocolate Fountain', categorySlug: 'Food & Beverages > Dessert Counters', ages: 'All ages' },
        { slug: 'ice-gola-counter', name: 'Ice Gola Counter', categorySlug: 'Food & Beverages > Live Food Counters', ages: 'All ages', themeSlugs: ['tropical-luau'] },
        { slug: 'chaat-counter', name: 'Chaat Counter', categorySlug: 'Food & Beverages > Live Food Counters', ages: 'All ages' },
        { slug: 'mini-pizza-burger-station', name: 'Mini Pizza / Burger Station', categorySlug: 'Food & Beverages > Live Food Counters', ages: 'All ages' },
        { slug: 'waffle-pancake-counter', name: 'Waffle / Pancake Counter', categorySlug: 'Food & Beverages > Live Food Counters', ages: 'All ages' },
        { slug: 'mocktail-counter', name: 'Mocktail Counter', categorySlug: 'Food & Beverages > Mocktail Bars', ages: 'Teens & up', themeSlugs: ['tropical-luau', 'music-dance-party'] },
        { slug: 'fries-nuggets-counter', name: 'French Fries / Nuggets Counter', categorySlug: 'Food & Beverages > Live Food Counters', ages: 'All ages' },
      ],
    },
    {
      slug: 'more-photo-memory',
      label: 'More Photo & Memory',
      emoji: '📸',
      items: [
        { slug: 'polaroid-counter', name: 'Polaroid Counter', categorySlug: 'Photography & Videography > Instant Photo Booths', ages: 'All ages' },
        { slug: 'selfie-frame-with-name', name: 'Selfie Frame with Name', categorySlug: 'Decor Rentals > Selfie Booths', ages: 'All ages' },
        { slug: 'caricature-artist', name: 'Caricature Artist', categorySlug: 'Miscellaneous > Caricature Artists', ages: 'Kids–Teens' },
        { slug: 'digital-photo-wall', name: 'Digital Photo Wall / Slideshow', categorySlug: 'Photography & Videography > Instant Photo Booths', ages: 'All ages' },
      ],
    },
    {
      slug: 'play-zone-add-ons',
      label: 'Play Zone Add-ons',
      emoji: '🎠',
      items: [
        { slug: 'ball-pit', name: 'Ball Pit', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'First birthday–Toddlers' },
        { slug: 'soft-play-area', name: 'Soft Play Area', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'First birthday–Toddlers' },
        { slug: 'trampoline', name: 'Trampoline', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Kids–Teens' },
        { slug: 'mini-slide', name: 'Mini Slide', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Toddlers–Kids' },
        { slug: 'inflatable-obstacle-course', name: 'Inflatable Obstacle Course', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Kids–Teens' },
        { slug: 'toy-train-ride', name: 'Toy Train Ride', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Toddlers–Kids' },
        { slug: 'mini-carousel', name: 'Mini Carousel', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Toddlers–Kids' },
        { slug: 'rc-car-racing-zone', name: 'RC Car Racing Zone', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Kids–Teens', themeSlugs: ['cars-wheels'] },
        { slug: 'lego-block-station', name: 'Lego / Block-Building Station', categorySlug: 'Kids Party Services > Play Zone Equipment', ages: 'Toddlers–Kids' },
      ],
    },
    {
      slug: 'popular-extras',
      label: 'Popular Extras',
      emoji: '✨',
      items: [
        { slug: 'welcome-board-with-photo', name: 'Welcome Board with Photo', categorySlug: 'Invitations & Printing > Welcome Boards', ages: 'All ages' },
        { slug: 'personalized-chocolate-wrappers', name: 'Personalized Chocolate Wrappers', categorySlug: 'Gifts & Favours > Customized Gifts', ages: 'All ages' },
        { slug: 'name-tags-wristbands', name: 'Name Tags / Wristbands', categorySlug: 'Invitations & Printing > Name Cards', ages: 'All ages' },
        { slug: 'prize-table', name: 'Prize Table', categorySlug: 'Wedding Services > Return Gifts', ages: 'All ages' },
        { slug: 'live-dhol-grand-entry', name: 'Live Dhol / Grand Entry', categorySlug: 'Entertainment > Dhol & Baraat Bands', ages: 'All ages' },
        { slug: 'confetti-blast', name: 'Cake-Cutting Confetti Blast', categorySlug: 'Audio Visual & Production > Special Effects', ages: 'All ages' },
        // Cold pyro needs venue sign-off — flagged in the UI, not silently
        // treated the same as the rest of this list.
        { slug: 'cold-pyro-sparkle-entry', name: 'Cold Pyro / Sparkle Entry', categorySlug: 'Audio Visual & Production > Pyrotechnics', ages: 'All ages', note: 'Check with your venue first — many don’t allow pyro indoors.' },
      ],
    },
    {
      slug: 'entertainment-extras',
      label: 'Entertainment',
      emoji: '🎭',
      items: [
        { slug: 'joker-clown', name: 'Joker / Clown', categorySlug: 'Kids Party Services > Clowns', ages: 'Toddlers–Kids', themeSlugs: ['circus-carnival'] },
        { slug: 'storytelling-session', name: 'Storytelling Session', categorySlug: 'Kids Party Services > Storytellers', ages: 'Toddlers–Kids', themeSlugs: ['wizarding-school', 'magic-kingdom-fairytale', 'enchanted-garden'] },
        { slug: 'ventriloquist-show', name: 'Ventriloquist Show', categorySlug: 'Kids Party Services > Ventriloquists', ages: 'Kids–Teens' },
      ],
    },
  ],
};

// Musical Chairs, Treasure Hunt, etc. — Anish's "Game Activities" list.
// Confirmed consolidation (see plan doc): these stay a tip list shown
// alongside the existing "Games host" checklist item, not their own
// bookable rows — a games host runs whichever of these the host likes,
// nothing here needs its own vendor match.
export const GAME_ACTIVITY_TIPS = [
  'Musical Chairs', 'Treasure Hunt', 'Tug of War', 'Sack Race',
  'Passing the Parcel', 'Balloon Stomp', 'Dumb Charades', 'Freeze Dance',
  'Pin the Tail', 'Limbo Rock', 'Spoon & Lemon Race', 'Fancy Dress Contest',
];

export function getActivityCategories(eventTypeSlug) {
  return ACTIVITY_CATEGORIES[eventTypeSlug] || [];
}

// Flat lookup by slug — used when rendering an already-added
// event_extra_activities row (which only stores activity_slug + item_name)
// back against this catalog for its emoji/ages/note.
export function findActivityBySlug(eventTypeSlug, activitySlug) {
  for (const cat of getActivityCategories(eventTypeSlug)) {
    const item = cat.items.find(i => i.slug === activitySlug);
    if (item) return { ...item, categoryLabel: cat.label, categoryEmoji: cat.emoji };
  }
  return null;
}

// Every item across every category whose themeSlugs includes the given
// theme — powers the "Suggested for your theme" section.
export function getSuggestedActivities(eventTypeSlug, themeSlug) {
  if (!themeSlug) return [];
  const results = [];
  for (const cat of getActivityCategories(eventTypeSlug)) {
    for (const item of cat.items) {
      if (item.themeSlugs?.includes(themeSlug)) results.push({ ...item, categoryLabel: cat.label, categoryEmoji: cat.emoji });
    }
  }
  return results;
}
