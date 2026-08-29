// Target field set for the bulk-import column-mapping step
// (screens/provider/BulkImportServices.js) -- one entry per real
// `services` column a spreadsheet row can fill, per the investigation's
// confirmed field shape (screens/provider/AddServiceScreen.js). Deliberately
// excludes photos/videos (no upload-from-spreadsheet path exists) and the
// per-category package_details/BESPOKE_TEMPLATES fields (those vary by
// category and don't have a stable column identity across an arbitrary
// provider's spreadsheet -- left for manual fill-in after import, same as
// any other service).
//
// `aliases` are normalized (lowercased, punctuation stripped) header texts
// this field's auto-guess will match against -- see guessMapping() below.
// The provider always confirms/adjusts before import; this only pre-fills
// a starting guess, never a silent assumption.
export const TARGET_FIELDS = [
  { key: 'title', label: 'Service title', required: true, aliases: ['title', 'name', 'service', 'service name', 'servicetitle', 'itemname', 'product'] },
  { key: 'category', label: 'Category', required: true, aliases: ['category', 'subcategory', 'servicetype', 'type', 'businesstype'] },
  { key: 'price_from', label: 'Starting price', required: true, aliases: ['price', 'pricefrom', 'startingprice', 'minprice', 'price from', 'rate', 'cost'] },
  { key: 'price_to', label: 'Max price', required: false, aliases: ['priceto', 'maxprice', 'price to', 'upto'] },
  { key: 'description', label: 'Description', required: false, aliases: ['description', 'details', 'about', 'notes'] },
  { key: 'event_types', label: 'Event types (comma-separated)', required: false, aliases: ['eventtypes', 'eventtype', 'suitablefor', 'occasions'] },
  { key: 'pricing_model', label: 'Pricing model (flat/per_guest/per_hour/per_day)', required: false, aliases: ['pricingmodel', 'pricetype', 'billingmodel'] },
  { key: 'price_per_guest', label: 'Rate per guest', required: false, aliases: ['priceperguest', 'perguest', 'rateperguest', 'perplate', 'priceperplate'] },
  { key: 'price_per_hour', label: 'Rate per hour', required: false, aliases: ['priceperhour', 'perhour', 'ratehour', 'hourlyrate'] },
  { key: 'price_per_day', label: 'Rate per day', required: false, aliases: ['priceperday', 'perday', 'dailyrate'] },
  { key: 'travel_surcharge_per_km', label: 'Travel surcharge / km', required: false, aliases: ['travelsurcharge', 'perkm', 'travelcharge'] },
  { key: 'travel_free_radius_km', label: 'Free travel radius (km)', required: false, aliases: ['freeradius', 'travelradius', 'radiuskm'] },
  { key: 'discount_label', label: 'Discount label', required: false, aliases: ['discountlabel', 'offer', 'discountname'] },
  { key: 'discount_percent', label: 'Discount %', required: false, aliases: ['discountpercent', 'discount', 'offpercent'] },
  { key: 'rush_fee_percent', label: 'Rush fee %', required: false, aliases: ['rushfee', 'rushfeepercent', 'urgentfee'] },
];

function normalizeHeader(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Best-effort starting guess per target field -- exact normalized-alias
// match only (deliberately not fuzzy here; a wrong silent guess on a
// structural mapping like "which column is the price" is a much worse
// failure than a wrong guess on a free-text category, since the provider
// may not scrutinize every row before confirming). Returns
// { [targetKey]: headerIndex | null }; the provider adjusts from here,
// nothing is ever auto-applied without this step being shown.
export function guessMapping(headers) {
  const normalized = headers.map(normalizeHeader);
  const mapping = {};
  for (const field of TARGET_FIELDS) {
    const idx = normalized.findIndex(h => field.aliases.includes(h));
    mapping[field.key] = idx >= 0 ? idx : null;
  }
  return mapping;
}
