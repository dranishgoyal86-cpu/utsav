// Bridges two category systems that were built independently and never
// reconciled: vendorTaxonomy.js's ~25 parent categories / ~300 subcategories
// (what providers.category/services.category actually store — confirmed live:
// "Caterers", "Event Photography", "Wedding Photography", etc.) and the new
// vendor_categories.slug system (54 coarse slugs like 'catering', 'photography',
// 'videography' — what event_requirements.category_slug and this plan engine's
// pricing/progress logic key off of).
//
// getParentCategory()/resolveParentCategory() (vendorTaxonomy.js) collapse a
// subcategory string down to its ~25-value parent name; PARENT_TO_SLUG below
// then maps that parent name to the closest vendor_categories.slug. This is a
// best-effort, hand-curated bridge, not a verified 1:1 mapping — several
// parents split across multiple real slugs (Photography & Videography ->
// photography/videography) or have no clean vendor_categories match at all
// (Licensing & Compliance, Sustainable Event Services, Miscellaneous). Those
// resolve to null rather than guessing, same call made for lib/eventTypeSlug.js.
import { getParentCategory, resolveParentCategory } from '../vendorTaxonomy';

// Checked before the parent-level map for the handful of subcategories whose
// real vendor_categories.slug doesn't match their parent's default slug.
const SUBCATEGORY_OVERRIDES = {
  'Cinematic Videography': 'videography',
  'Video Editing': 'videography',
  'Live Streaming': 'live-streaming',
  'Pandits/Priests': 'priests-officiants',
  'Pandits': 'priests-officiants',
  'Mehendi Artists': 'mehendi',
  'Return Gifts': 'return-gifts',
  'Wedding Invitations': 'invitations',
  'Wedding Cards': 'invitations',
  'Lighting Systems': 'lighting',
  'Lighting Decor': 'lighting',
  'LED Screens': 'led-screens',
  'Trussing': 'stage-trussing',
  'Tent & Shamiana': 'tent-mandap',
  'Mandap Designers': 'tent-mandap',
  'Valet Parking': 'valet-parking',
  'Magicians': 'magician',
  'Kids Entertainment': 'kids-entertainment',
  'Bouncy Castles': 'kids-entertainment',
  'Ticketing Platforms': 'ticketing',
  'Security Guards': 'security',
  'Ambulance Services': 'medical-support',
  'Medical Team': 'medical-support',
  'Anchors': 'anchors-emcees',
  'Emcees (Anchors)': 'anchors-emcees',
};

const PARENT_TO_SLUG = {
  'Venues': 'venues',
  'Food & Beverages': 'catering',
  'Decoration & Styling': 'decor',
  'Photography & Videography': 'photography',
  'Entertainment': 'dj-music',
  'Wedding Services': 'event-planning',
  'Beauty & Wellness': 'makeup-styling',
  'Audio Visual & Production': 'sound-av',
  'Event Rentals': 'furniture-seating',
  'Invitations & Printing': 'invitations',
  'Logistics & Transport': 'transportation',
  'Accommodation': 'guest-accommodation',
  'Event Planning & Management': 'event-planning',
  'Corporate Event Services': 'booth-exhibition',
  'Kids Party Services': 'kids-entertainment',
  'Event Technology': 'registration-guest-tech',
  'Gifts & Favours': 'return-gifts',
  'Security & Safety': 'security',
  'Licensing & Compliance': null,
  'Artists & Performers': 'celebrity-talent',
  'Religious & Cultural Services': 'priests-officiants',
  'Decor Rentals': 'decor',
  'Florists': 'floral-decor',
  'Printing & Branding': 'branding-print',
  'Event Staffing': 'hospitality-staff',
  'Rentals & Utilities': 'power-utilities',
  'Destination Wedding Services': null,
  'Sustainable Event Services': null,
  'Miscellaneous': null,
  'Post Event Services': 'housekeeping',
};

// value: a providers.category or services.category string (subcategory- or
// parent-level, either format may exist per the resolveParentCategory
// comment in vendorTaxonomy.js). Returns a vendor_categories.slug or null.
export function resolveVendorCategorySlug(value) {
  if (!value) return null;
  if (SUBCATEGORY_OVERRIDES[value]) return SUBCATEGORY_OVERRIDES[value];

  const parent = getParentCategory(value) || resolveParentCategory(value);
  if (!parent) return null;
  return PARENT_TO_SLUG[parent] ?? null;
}
