// Shared everywhere a provider's "Major Head" (primary service category) is
// picked or displayed — claiming a profile, adding a service, admin review.
// A provider whose services span more than one Category (see vendorTaxonomy.js)
// needs to register as EVENT_PLANNER instead of staying under one subcategory.
import { SERVICE_CATEGORIES } from './vendorTaxonomy';
export { SERVICE_CATEGORIES, CATEGORY_NAMES, VENDOR_TAXONOMY, getParentCategory, resolveParentCategory, getSubcategories, getCategoryIcon, guessSubcategory, searchCategories, autoDescription } from './vendorTaxonomy';
export const EVENT_PLANNER = 'Event Planner';

// Category-specific "fill in the blanks" package fields — instead of a host
// re-typing the same paragraph every provider writes, they answer a few
// structured questions and get a real, comparable package listing.
//
// Field shape: { key, label, type: 'select' | 'multiselect' | 'number', options?,
// placeholder?, prefix?, suffix? }. prefix/suffix only apply to 'number' fields
// and are cosmetic (e.g. prefix '₹', suffix '/plate') — composeDescription and
// packageHighlights both read this same metadata, so a new bespoke template
// never needs its own formatting code.
//
// To give a subcategory its own tailored fields, add a `<NAME>_FIELDS` array
// below and register it in BESPOKE_TEMPLATES with the exact subcategory string
// from vendorTaxonomy.js. Anything not in BESPOKE_TEMPLATES automatically gets
// GENERIC_FIELDS instead — see SERVICE_TEMPLATES below.
const CATERERS_FIELDS = [
  {
    key: 'cuisines', label: 'Cuisines offered', type: 'multiselect',
    options: ['North Indian', 'South Indian', 'Chinese', 'Continental', 'Italian', 'Mughlai', 'Multi-Cuisine'],
  },
  {
    key: 'mealType', label: 'Meal type', type: 'select',
    options: ['Veg only', 'Non-veg available', 'Both available'],
  },
  {
    key: 'serviceStyle', label: 'Service style', type: 'multiselect',
    options: ['Buffet', 'Plated / sit-down', 'Live counters', 'Family style'],
  },
  { key: 'pricePerPlate', label: 'Price per plate (₹)', type: 'number', placeholder: 'e.g. 450', prefix: '₹', suffix: '/plate' },
  { key: 'minGuests', label: 'Minimum guest count', type: 'number', placeholder: 'e.g. 50', prefix: 'Min ', suffix: ' guests' },
  {
    key: 'included', label: "What's included", type: 'multiselect',
    options: ['Starters', 'Main course', 'Desserts', 'Beverages', 'Live counters', 'Waiter service', 'Crockery & cutlery'],
  },
];

const WEDDING_PHOTOGRAPHY_FIELDS = [
  {
    key: 'style', label: 'Photography style', type: 'multiselect',
    options: ['Candid', 'Traditional', 'Documentary', 'Fine Art', 'Cinematic'],
  },
  { key: 'hoursCovered', label: 'Hours of coverage', type: 'number', placeholder: 'e.g. 8', suffix: ' hrs coverage' },
  {
    key: 'deliverables', label: 'Deliverables', type: 'multiselect',
    options: ['Edited photos', 'Raw files', 'Printed album', 'Online gallery', 'Same-day teaser'],
  },
  { key: 'teamSize', label: 'Number of photographers', type: 'number', placeholder: 'e.g. 2', prefix: 'Team of ' },
];

const CINEMATIC_VIDEOGRAPHY_FIELDS = [
  {
    key: 'style', label: 'Videography style', type: 'multiselect',
    options: ['Cinematic', 'Documentary', 'Traditional', 'Highlight reel', 'Full-length film'],
  },
  {
    key: 'deliverables', label: 'Deliverables', type: 'multiselect',
    options: ['Highlight reel', 'Full ceremony video', 'Drone footage', 'Same-day edit', 'Raw footage'],
  },
  { key: 'hoursCovered', label: 'Hours of coverage', type: 'number', placeholder: 'e.g. 8', suffix: ' hrs coverage' },
  {
    key: 'drone', label: 'Drone coverage', type: 'select',
    options: ['Drone included', 'Drone available (extra)', 'No drone'],
  },
];

const DJS_FIELDS = [
  {
    key: 'genres', label: 'Genres', type: 'multiselect',
    options: ['Bollywood', 'Punjabi', 'EDM', 'Hip-Hop', 'Retro', 'Regional/Folk', 'Western'],
  },
  {
    key: 'equipment', label: 'Equipment included', type: 'multiselect',
    options: ['Sound system included', 'Lighting included', 'MC/Anchor included', 'Fog/smoke effects'],
  },
  { key: 'hoursIncluded', label: 'Hours included', type: 'number', placeholder: 'e.g. 4', suffix: ' hrs included' },
  {
    key: 'setupTime', label: 'Setup time needed', type: 'select',
    options: ['Under 1 hr', '1-2 hrs', '2+ hrs'],
  },
];

const LIVE_BANDS_FIELDS = [
  {
    key: 'genres', label: 'Genres', type: 'multiselect',
    options: ['Bollywood', 'Classical', 'Rock', 'Jazz', 'Folk', 'Fusion', 'Sufi'],
  },
  { key: 'bandSize', label: 'Band size', type: 'number', placeholder: 'e.g. 5', suffix: '-piece band' },
  { key: 'setDuration', label: 'Set duration (minutes)', type: 'number', placeholder: 'e.g. 45', suffix: ' min sets' },
  {
    key: 'equipmentIncluded', label: 'Equipment', type: 'select',
    options: ['Full sound & lighting included', 'Sound only', 'Bring your own setup'],
  },
];

const EVENT_DECORATORS_FIELDS = [
  {
    key: 'themes', label: 'Themes offered', type: 'multiselect',
    options: ['Traditional', 'Modern/Minimal', 'Floral', 'Royal/Regal', 'Rustic', 'Boho', 'Fairy-lit'],
  },
  {
    key: 'includes', label: "What's included", type: 'multiselect',
    options: ['Stage decor', 'Entrance decor', 'Table centerpieces', 'Lighting', 'Backdrop', 'Flowers'],
  },
  {
    key: 'setupTime', label: 'Setup timing', type: 'select',
    options: ['Same day', 'Day before', '2+ days before'],
  },
  { key: 'teamSize', label: 'Team size', type: 'number', placeholder: 'e.g. 6', prefix: 'Team of ' },
];

const MEHENDI_ARTISTS_FIELDS = [
  {
    key: 'styles', label: 'Styles offered', type: 'multiselect',
    options: ['Arabic', 'Indian/Traditional', 'Indo-Arabic', 'Rajasthani', 'Minimalist', 'Bridal Portrait'],
  },
  { key: 'artistsAvailable', label: 'Artists available', type: 'number', placeholder: 'e.g. 3', suffix: ' artists available' },
  {
    key: 'henna', label: 'Henna type', type: 'select',
    options: ['Natural henna', 'Chemical-free', 'Both available'],
  },
  { key: 'hoursPerBride', label: 'Hours per bride', type: 'number', placeholder: 'e.g. 3', suffix: ' hrs per bride' },
];

const BRIDAL_MAKEUP_ARTISTS_FIELDS = [
  {
    key: 'products', label: 'Makeup type', type: 'select',
    options: ['HD makeup', 'Airbrush makeup', 'Both available'],
  },
  {
    key: 'trial', label: 'Trial session', type: 'select',
    options: ['Trial included', 'Trial available (extra)', 'No trial'],
  },
  {
    key: 'lookStyles', label: 'Look styles', type: 'multiselect',
    options: ['Traditional', 'Modern/Glam', 'Natural/No-makeup', 'Bold/Dramatic'],
  },
  {
    key: 'travel', label: 'Location', type: 'select',
    options: ['Travels to venue', 'Studio only', 'Both options'],
  },
];

const BANQUET_HALLS_FIELDS = [
  { key: 'capacity', label: 'Guest capacity', type: 'number', placeholder: 'e.g. 300', suffix: ' guest capacity' },
  {
    key: 'spaceType', label: 'Space type', type: 'select',
    options: ['Indoor', 'Outdoor', 'Both indoor & outdoor'],
  },
  {
    key: 'cateringPolicy', label: 'Catering policy', type: 'select',
    options: ['In-house catering only', 'Outside catering allowed', 'Both options'],
  },
  {
    key: 'amenities', label: 'Amenities', type: 'multiselect',
    options: ['AC', 'Bridal room', 'Stage included', 'Sound system included', 'Power backup', 'Parking'],
  },
];

const WEDDING_PLANNERS_FIELDS = [
  {
    key: 'planningType', label: 'Planning type', type: 'select',
    options: ['Full wedding planning', 'Partial planning', 'Day-of coordination'],
  },
  { key: 'experienceYears', label: 'Years of experience', type: 'number', placeholder: 'e.g. 5', suffix: ' yrs experience' },
  {
    key: 'vendorNetwork', label: 'Vendor sourcing', type: 'select',
    options: ['Own vendor network', 'Works with your vendors', 'Both'],
  },
  { key: 'teamSize', label: 'Team size', type: 'number', placeholder: 'e.g. 4', prefix: 'Team of ' },
];

const SOUND_SYSTEMS_FIELDS = [
  {
    key: 'capacity', label: 'Suitable event size', type: 'select',
    options: ['Small (up to 100 guests)', 'Medium (100-300 guests)', 'Large (300+ guests)'],
  },
  {
    key: 'includes', label: "What's included", type: 'multiselect',
    options: ['Speakers', 'Mixer', 'Wireless mics', 'DJ console', 'Stage monitors'],
  },
  {
    key: 'technician', label: 'Technician', type: 'select',
    options: ['Technician included', 'Self-operated', 'Technician available (extra)'],
  },
];

const TENT_SHAMIANA_FIELDS = [
  { key: 'capacity', label: 'Guest capacity', type: 'number', placeholder: 'e.g. 200', suffix: ' guest capacity' },
  {
    key: 'tentType', label: 'Tent type', type: 'multiselect',
    options: ['German hangar', 'Traditional shamiana', 'Frame tent', 'Peak/pole tent'],
  },
  {
    key: 'includes', label: "What's included", type: 'multiselect',
    options: ['Flooring', 'AC/cooling', 'Lighting', 'Side walls'],
  },
  {
    key: 'setupIncluded', label: 'Setup', type: 'select',
    options: ['Setup & teardown included', 'Setup only', 'Rental only'],
  },
];

const BESPOKE_TEMPLATES = {
  Caterers: {
    intro: "Answer a few questions about this package — customers can compare caterers at a glance instead of reading paragraphs.",
    fields: CATERERS_FIELDS,
  },
  'Wedding Photography': { intro: "Answer a few questions so couples can compare photographers at a glance.", fields: WEDDING_PHOTOGRAPHY_FIELDS },
  'Cinematic Videography': { intro: "Answer a few questions so couples can compare videographers at a glance.", fields: CINEMATIC_VIDEOGRAPHY_FIELDS },
  'DJs': { intro: "Answer a few questions so hosts can compare DJs at a glance.", fields: DJS_FIELDS },
  'Live Bands': { intro: "Answer a few questions so hosts can compare bands at a glance.", fields: LIVE_BANDS_FIELDS },
  'Event Decorators': { intro: "Answer a few questions so hosts can compare decorators at a glance.", fields: EVENT_DECORATORS_FIELDS },
  'Mehendi Artists': { intro: "Answer a few questions so brides can compare mehendi artists at a glance.", fields: MEHENDI_ARTISTS_FIELDS },
  'Bridal Makeup Artists': { intro: "Answer a few questions so brides can compare makeup artists at a glance.", fields: BRIDAL_MAKEUP_ARTISTS_FIELDS },
  'Banquet Halls': { intro: "Answer a few questions so hosts can compare venues at a glance.", fields: BANQUET_HALLS_FIELDS },
  'Wedding Planners': { intro: "Answer a few questions so couples can compare planners at a glance.", fields: WEDDING_PLANNERS_FIELDS },
  'Sound Systems': { intro: "Answer a few questions so hosts can compare sound setups at a glance.", fields: SOUND_SYSTEMS_FIELDS },
  'Tent & Shamiana': { intro: "Answer a few questions so hosts can compare tent setups at a glance.", fields: TENT_SHAMIANA_FIELDS },
};

// Generic fields used by every subcategory without a bespoke template above —
// with ~300 subcategories in vendorTaxonomy.js, hand-built per-category fields
// aren't practical for all of them, but a shared comparable field set beats
// every listing falling back to a plain paragraph. Deliberately category
// -agnostic: applies to a florist, a bouncer service, a fire-NOC consultant.
const GENERIC_FIELDS = [
  {
    key: 'tier', label: 'Package tier', type: 'select',
    options: ['Budget-friendly', 'Standard', 'Premium', 'Luxury'],
  },
  {
    key: 'pricingModel', label: 'Pricing model', type: 'select',
    options: ['Fixed package', 'Per hour', 'Per day', 'Per person / guest', 'Custom quote'],
  },
  {
    key: 'included', label: "What's included", type: 'multiselect',
    options: ['Setup & breakdown', 'Materials & equipment', 'Staff/team included', 'Travel to venue included', 'Customization available', 'Consultation included'],
  },
  { key: 'teamSize', label: 'Team size', type: 'number', placeholder: 'e.g. 4', prefix: 'Team of ' },
  {
    key: 'bookingNotice', label: 'Advance booking notice needed', type: 'select',
    options: ['Same day', '1-3 days', '1 week', '2+ weeks'],
    prefix: 'Book ',
  },
];

const GENERIC_INTRO = "Answer a few questions about this package — customers can compare listings at a glance instead of reading paragraphs.";

// Every subcategory in the taxonomy gets a template — bespoke fields where
// defined above, the shared generic set otherwise. Auto-derived from
// SERVICE_CATEGORIES so it stays in sync if vendorTaxonomy.js changes.
export const SERVICE_TEMPLATES = SERVICE_CATEGORIES.reduce((acc, cat) => {
  acc[cat] = BESPOKE_TEMPLATES[cat] || { intro: GENERIC_INTRO, fields: GENERIC_FIELDS };
  return acc;
}, {});

// Formats one field's answer using its own metadata — select/multiselect
// values are already human-readable, number fields get their prefix/suffix
// (e.g. "₹450/plate", "Team of 6"). Returns null for unanswered fields, or an
// array for multiselect (each option becomes its own chip).
function formatFieldValue(field, value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.length ? value : null;
  if (field.type === 'number') return `${field.prefix || ''}${value}${field.suffix || ''}`;
  return field.prefix || field.suffix ? `${field.prefix || ''}${value}${field.suffix || ''}` : value;
}

// Short, scannable chips for the public profile's service card — customers
// comparing five listings shouldn't have to read five paragraphs to find the
// price and what's included. Driven entirely by the category's field
// metadata, so a new bespoke template never needs its own chip logic.
export function packageHighlights(category, details) {
  if (!details) return [];
  const fields = SERVICE_TEMPLATES[category]?.fields || [];
  const chips = [];
  for (const field of fields) {
    const formatted = formatFieldValue(field, details[field.key]);
    if (formatted === null) continue;
    if (Array.isArray(formatted)) chips.push(...formatted);
    else chips.push(formatted);
  }
  return chips;
}

// Turns filled-in package answers into a readable line — used to prefill the
// free-text description so every existing screen that just renders
// `service.description` keeps working without changes.
export function composeDescription(category, details) {
  return packageHighlights(category, details).join(' · ');
}
