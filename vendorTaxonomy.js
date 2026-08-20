// Single source of truth for the vendor Category -> Subcategory hierarchy.
// The `category` column on `providers`/`services` always stores a SUBCATEGORY
// string exactly as listed here (e.g. "Caterers") - the parent Category is a
// derived UI/lookup concept only, not a stored field.

export const VENDOR_TAXONOMY = {
  'Venues': {
    icon: '🏛️',
    subcategories: ['Banquet Halls', 'Hotels & Resorts', 'Farmhouses', 'Lawns & Gardens', 'Convention Centres', 'Destination Venues', 'Clubs', 'Rooftop Venues', 'Villas', 'Beach Venues', 'Heritage Properties', 'Community Halls', 'Conference Rooms', 'Religious Venues'],
  },
  'Food & Beverages': {
    icon: '🍽️',
    subcategories: ['Caterers', 'Live Food Counters', 'Bartending Services', 'Mocktail Bars', 'Coffee Stations', 'Dessert Counters', 'Ice Cream Vendors', 'Bakery & Cakes', 'Chocolatiers', 'Beverage Suppliers', 'Food Trucks'],
  },
  'Decoration & Styling': {
    icon: '🎊',
    subcategories: ['Event Decorators', 'Floral Decor', 'Balloon Decor', 'Stage Decor', 'Mandap Designers', 'Theme Decor', 'Entrance Decor', 'Ceiling Decor', 'Table Styling', 'Wedding Styling', 'Lighting Decor', 'Prop Rentals'],
  },
  'Photography & Videography': {
    icon: '📸',
    subcategories: ['Wedding Photography', 'Event Photography', 'Candid Photography', 'Traditional Photography', 'Cinematic Videography', 'Drone Photography', 'Pre-wedding Shoots', 'Live Streaming', 'Instant Photo Booths', '360° Video Booths', 'Photo Albums', 'Video Editing'],
  },
  'Entertainment': {
    icon: '🎤',
    subcategories: ['DJs', 'Live Bands', 'Singers', 'Classical Musicians', 'Instrumentalists', 'Celebrity Performers', 'Stand-up Comedians', 'Emcees (Anchors)', 'Dancers', 'Dance Troupes', 'Magicians', 'Puppeteers', 'Kids Entertainment', 'Fire Shows', 'LED Dance Shows', 'Belly Dancers', 'Folk Artists', 'Orchestra', 'Mimicry Artists'],
  },
  'Wedding Services': {
    icon: '💍',
    subcategories: ['Wedding Planners', 'Bridal Makeup Artists', 'Groom Styling', 'Mehendi Artists', 'Haldi Setup', 'Pandits/Priests', 'Wedding Invitations', 'Wedding Websites', 'Gift Packaging', 'Return Gifts', 'Bridal Wear', 'Groom Wear', 'Jewellery Rentals'],
  },
  'Beauty & Wellness': {
    icon: '💄',
    subcategories: ['Makeup Artists', 'Hair Stylists', 'Nail Artists', 'Spa Services', 'Salon at Venue', 'Grooming Experts', 'Massage Services'],
  },
  'Audio Visual & Production': {
    icon: '🔊',
    subcategories: ['Sound Systems', 'LED Screens', 'Projectors', 'Lighting Systems', 'Stage Setup', 'Trussing', 'Special Effects', 'Laser Shows', 'Smoke Machines', 'Pyrotechnics', 'AV Production', 'Live Broadcasting'],
  },
  'Event Rentals': {
    icon: '🪑',
    subcategories: ['Furniture Rental', 'Sofa Sets', 'Chairs', 'Tables', 'Lounges', 'Tent & Shamiana', 'Air Coolers', 'Air Conditioners', 'Heaters', 'Portable Toilets', 'Crockery Rental', 'Linen Rental'],
  },
  'Invitations & Printing': {
    icon: '💌',
    subcategories: ['Wedding Cards', 'Digital Invitations', 'E-Invites', 'RSVP Management', 'Flex Printing', 'Signages', 'Banners', 'Standees', 'Welcome Boards', 'Name Cards'],
  },
  'Logistics & Transport': {
    icon: '🚗',
    subcategories: ['Luxury Cars', 'Wedding Cars', 'Bus Rentals', 'Tempo Travellers', 'Chauffeur Services', 'Airport Transfers', 'Valet Parking', 'Guest Transport', 'Logistics Companies'],
  },
  'Accommodation': {
    icon: '🏨',
    subcategories: ['Hotels', 'Homestays', 'Service Apartments', 'Guest House Management', 'Hospitality Desk'],
  },
  'Event Planning & Management': {
    icon: '📋',
    subcategories: ['Wedding Planner', 'Corporate Event Planner', 'Birthday Planner', 'Conference Planner', 'Destination Wedding Planner', 'Exhibition Organizer', 'Event Coordinator', 'RSVP Team', 'Guest Management'],
  },
  'Corporate Event Services': {
    icon: '💼',
    subcategories: ['Team Building Activities', 'Conference Management', 'Product Launch', 'Trade Shows', 'Exhibition Booths', 'Brand Activation', 'Promotional Staffing'],
  },
  'Kids Party Services': {
    icon: '🎈',
    subcategories: ['Bouncy Castles', 'Cartoon Characters', 'Puppet Shows', 'Magicians', 'Face Painting', 'Tattoo Artists', 'Kids Games', 'Clowns'],
  },
  'Event Technology': {
    icon: '📱',
    subcategories: ['Ticketing Platforms', 'QR Check-in', 'Event Apps', 'Registration Software', 'RFID Solutions', 'Voting Systems', 'Audience Engagement', 'Virtual Events', 'Hybrid Event Solutions'],
  },
  'Gifts & Favours': {
    icon: '🎁',
    subcategories: ['Return Gifts', 'Customized Gifts', 'Hampers', 'Corporate Gifts', 'Personalised Merchandise', 'Trophy Makers', 'Award Manufacturers'],
  },
  'Security & Safety': {
    icon: '🛡️',
    subcategories: ['Security Guards', 'Bouncers', 'Fire Safety', 'Ambulance Services', 'Medical Team', 'Crowd Management', 'CCTV Monitoring'],
  },
  'Licensing & Compliance': {
    icon: '📜',
    subcategories: ['Event Permissions', 'Police Permissions', 'Fire NOC', 'Music Licenses', 'Liquor Licenses', 'Municipal Permissions', 'Environmental Clearances'],
  },
  'Artists & Performers': {
    icon: '🌟',
    subcategories: ['Celebrity Appearances', 'Influencers', 'Motivational Speakers', 'Hosts', 'Fashion Models', 'Anchors', 'Voice-over Artists'],
  },
  'Religious & Cultural Services': {
    icon: '🙏',
    subcategories: ['Pandits', 'Granthis', 'Maulvis', 'Priests', 'Astrologers', 'Vastu Consultants', 'Bhajan Mandali', 'Kirtan Groups'],
  },
  'Decor Rentals': {
    icon: '🕯️',
    subcategories: ['Artificial Flowers', 'Chandeliers', 'Vintage Furniture', 'Wedding Props', 'Selfie Booths', 'Floral Walls', 'LED Letters', 'Neon Signs'],
  },
  'Florists': {
    icon: '🌸',
    subcategories: ['Fresh Flowers', 'Garlands', 'Bridal Bouquets', 'Floral Jewellery', 'Exotic Flowers'],
  },
  'Printing & Branding': {
    icon: '🖨️',
    subcategories: ['Corporate Branding', 'Backdrops', 'Exhibition Panels', 'Vinyl Printing', 'Event Merchandise', 'Promotional Material'],
  },
  'Event Staffing': {
    icon: '🧑‍💼',
    subcategories: ['Hosts & Hostesses', 'Registration Staff', 'Ushers', 'Volunteers', 'Promoters', 'Hospitality Staff', 'Coordinators'],
  },
  'Rentals & Utilities': {
    icon: '🔌',
    subcategories: ['Generator Rental', 'Power Backup', 'Water Supply', 'Internet/Wi-Fi', 'Portable Lighting', 'Walkie-Talkies'],
  },
  'Destination Wedding Services': {
    icon: '✈️',
    subcategories: ['Travel Planning', 'Visa Assistance', 'Local Vendors', 'Destination Logistics', 'Guest Concierge', 'Tour Packages'],
  },
  'Sustainable Event Services': {
    icon: '♻️',
    subcategories: ['Eco-friendly Decor', 'Waste Management', 'Composting', 'Recyclable Cutlery', 'Carbon Offset Services'],
  },
  'Miscellaneous': {
    icon: '🎭',
    subcategories: ['Astrologers', 'Tattoo Artists', 'Caricature Artists', 'Fortune Tellers', 'Live Painters', 'Calligraphers', 'Cigar Rollers', 'Perfume Bars'],
  },
  'Post Event Services': {
    icon: '🧹',
    subcategories: ['Cleaning Services', 'Equipment Dismantling', 'Photo Album Delivery', 'Video Editing', 'Thank-you Gifts', 'Feedback Collection'],
  },
};

export const CATEGORY_NAMES = Object.keys(VENDOR_TAXONOMY);

export const SERVICE_CATEGORIES = Object.values(VENDOR_TAXONOMY).flatMap(c => c.subcategories);

// Reverse lookup, built once. A few subcategory names repeat across categories
// in the source taxonomy (e.g. "Return Gifts", "Magicians") - first match wins.
const PARENT_BY_SUBCATEGORY = {};
for (const [parent, { subcategories }] of Object.entries(VENDOR_TAXONOMY)) {
  for (const sub of subcategories) {
    if (!(sub in PARENT_BY_SUBCATEGORY)) PARENT_BY_SUBCATEGORY[sub] = parent;
  }
}

export function getParentCategory(subcategory) {
  return PARENT_BY_SUBCATEGORY[subcategory] || null;
}

// providers.category moved from storing a subcategory to storing the parent
// category directly — but there's no bulk historical migration, so real
// providers approved before that change still have a subcategory-level
// value today. Every read site that needs "this provider's parent category"
// has to handle both formats; this is the one place that logic lives.
export function resolveParentCategory(value) {
  if (!value) return null;
  return getParentCategory(value) || (CATEGORY_NAMES.includes(value) ? value : null);
}

export function getSubcategories(category) {
  return VENDOR_TAXONOMY[category]?.subcategories || [];
}

export function getCategoryIcon(category) {
  return VENDOR_TAXONOMY[category]?.icon || '📌';
}

// Seed text for a service auto-created from a subcategory pick at claim time
// — deliberately generic (no fabricated specifics) since there's no package-
// details Q&A to draw from yet. Always editable afterward via AddServiceScreen.
export function autoDescription(subcategory, city) {
  return `Professional ${subcategory} services${city ? ` in ${city}` : ''}.`;
}

// Type-to-find category lookup — matches against SUBCATEGORY strings (not
// just the 30 top-level names) so a keyword like "wedding photo" surfaces
// "Wedding Photography" even though its parent is "Photography & Videography".
// Each result carries both, so a single tap sets category + parent together.
export function searchCategories(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const results = [];
  for (const [parent, { subcategories }] of Object.entries(VENDOR_TAXONOMY)) {
    if (parent.toLowerCase().includes(q) && !subcategories.some(sub => results.some(r => r.subcategory === sub))) {
      // Parent name itself matched — surface all its subcategories too, so
      // typing a broad term like "photography" still yields tappable results.
      for (const sub of subcategories) {
        results.push({ subcategory: sub, parent });
      }
      continue;
    }
    for (const sub of subcategories) {
      if (sub.toLowerCase().includes(q)) results.push({ subcategory: sub, parent });
    }
  }
  // De-dupe (a subcategory can appear once via parent-match and once via its
  // own match) while preserving first-seen order, cap to a reasonable list.
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.subcategory)) return false;
    seen.add(r.subcategory);
    return true;
  }).slice(0, 25);
}

// Maps every category string used by the OLD flat 12-category system and by
// both seeder scripts to its closest subcategory in the new taxonomy, so
// existing providers/services (and the claim/upgrade flows) keep working.
const LEGACY_CATEGORY_MAP = {
  // old flat SERVICE_CATEGORIES (serviceTemplates.js, pre-restructure)
  'Decorators': 'Event Decorators',
  'Caterers': 'Caterers',
  'Photographers': 'Event Photography',
  'DJ & Music': 'DJs',
  'Mehendi': 'Mehendi Artists',
  'Makeup': 'Makeup Artists',
  'Tent House': 'Tent & Shamiana',
  'Sound System': 'Sound Systems',
  'Choreographer': 'Dance Troupes',
  'Florist': 'Fresh Flowers',
  'Lighting': 'Lighting Systems',
  'Videography': 'Cinematic Videography',
  // seed-providers.js / seed-osm.js vocabulary
  'Decorator': 'Event Decorators',
  'Caterer': 'Caterers',
  'Photographer': 'Event Photography',
  'Videographer': 'Cinematic Videography',
  'Mehndi Artist': 'Mehendi Artists',
  'Makeup Artist': 'Makeup Artists',
  'DJ': 'DJs',
  'Live Music': 'Live Bands',
  'Pandit/Priest': 'Pandits/Priests',
  'Venue': 'Banquet Halls',
  'Invitation Cards': 'Wedding Cards',
  'Cake & Bakery': 'Bakery & Cakes',
  'Balloon Decorator': 'Balloon Decor',
  // 'Baraat & Doli' and 'Other' have no reasonable match - left unmapped,
  // same as today's behavior when a category can't be guessed.
};

export function guessSubcategory(oldCategory) {
  return LEGACY_CATEGORY_MAP[oldCategory] || null;
}

// Admin-approved categories that didn't exist in the static list above,
// merged in once at app startup (see App.js) from the `custom_categories`
// table. Mutates the same objects/arrays every export above is built from —
// CATEGORY_NAMES/SERVICE_CATEGORIES are pushed onto in place (not
// reassigned) and VENDOR_TAXONOMY/PARENT_BY_SUBCATEGORY gain new keys
// directly, so every existing consumer (including files that import these
// via serviceTemplates.js's re-export, which is a live binding, not a copy)
// picks them up automatically with zero changes on their end — no code
// deploy needed for a newly-approved category to become selectable.
export function registerCustomCategories(list) {
  for (const cat of list || []) {
    if (!cat?.name || VENDOR_TAXONOMY[cat.name]) continue; // already known — skip
    const subcategories = cat.subcategories || [];
    VENDOR_TAXONOMY[cat.name] = { icon: cat.icon || '📌', subcategories };
    CATEGORY_NAMES.push(cat.name);
    SERVICE_CATEGORIES.push(...subcategories);
    for (const sub of subcategories) {
      if (!(sub in PARENT_BY_SUBCATEGORY)) PARENT_BY_SUBCATEGORY[sub] = cat.name;
    }
  }
}
