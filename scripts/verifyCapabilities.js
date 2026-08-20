// Plain Node sanity check for the capability resolver — run with:
//   node scripts/verifyCapabilities.js
// Feeds hand-written fixture rule data (independently transcribed from
// supabase/migrations/capabilities.sql, as a double-entry check on that
// file, not read from it) through the real resolver in lib/capabilities.js
// and asserts specific event/provider fixtures resolve the way the spec
// requires. Prints PASS/FAIL per assertion, not just raw output.

const babel = require('@babel/core');
const Module = require('module');
const path = require('path');

function loadEsmAsCjs(filePath) {
  const { code } = babel.transformFileSync(filePath, { presets: ['babel-preset-expo'] });
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  m._compile(code, filePath);
  return m.exports;
}

const { resolveCapabilities, isEnabled, resolveProviderCapabilities, generatePassCode } =
  loadEsmAsCjs(path.resolve(__dirname, '..', 'lib', 'capabilities.js'));

let passCount = 0;
let failCount = 0;
function assert(label, cond) {
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${label}`);
  }
}

function rule(overrides) {
  return {
    capability_key: null, name: null, group_key: null, priority: 0, visibility: 'gated',
    venue_types: null, event_type_slugs: null, excluded_event_type_slugs: null,
    min_guest_count: null, max_guest_count: null, min_age: null, max_age: null,
    contextual_labels: {}, requires_budget: false, requires_sub_events: false,
    requires_booking: false, requires_completed_booking: false,
    suppressed_when_dry: false, suppressed_when_veg: false,
    ...overrides,
  };
}

// ── capability_rules fixture (transcribed from capabilities.sql) ──
const CAPABILITY_RULES = [
  // entry control
  rule({ capability_key: 'society_gate_pass', name: 'Society Gate Pass', group_key: 'entry_control', priority: 100, venue_types: ['society_flat', 'society_clubhouse'] }),
  rule({ capability_key: 'venue_attendance_qr', name: 'Venue Attendance QR', group_key: 'entry_control', priority: 90, venue_types: ['banquet_hall', 'farmhouse', 'hotel', 'outdoor'], min_guest_count: 30 }),
  rule({ capability_key: 'corporate_visitor_register', name: 'Corporate Visitor Register', group_key: 'entry_control', priority: 80, venue_types: ['office'] }),
  rule({ capability_key: 'no_entry_control', name: 'No Entry Control', group_key: 'entry_control', priority: 10, venue_types: ['independent_house', 'temple'] }),
  // guest management
  rule({ capability_key: 'guest_list', name: 'Guest List', visibility: 'always' }),
  rule({ capability_key: 'rsvp_tracking', name: 'RSVP Tracking', min_guest_count: 15 }),
  rule({ capability_key: 'digital_invites', name: 'Digital Invites', excluded_event_type_slugs: ['corporate-conference'] }),
  rule({ capability_key: 'family_groups', name: 'Family Groups', excluded_event_type_slugs: ['corporate-conference'] }),
  rule({ capability_key: 'seating_chart', name: 'Seating Chart', event_type_slugs: ['hindu-wedding', 'engagement', 'anniversary', 'corporate-conference'], min_guest_count: 50 }),
  rule({ capability_key: 'meal_preferences', name: 'Meal Preferences', min_guest_count: 30, contextual_labels: { 'religious-event': 'Satvik and Jain count', 'housewarming': 'Satvik and Jain count', 'mundan': 'Satvik and Jain count' } }),
  rule({ capability_key: 'vip_flagging', name: 'VIP Flagging', visibility: 'secondary', event_type_slugs: ['hindu-wedding', 'engagement', 'corporate-conference'] }),
  // gifts
  rule({ capability_key: 'gift_register', name: 'Gift Register', event_type_slugs: ['hindu-wedding', 'engagement', 'baby-shower', 'mundan', 'housewarming', 'anniversary'] }),
  rule({ capability_key: 'gift_qr_stickers', name: 'Gift QR Stickers', event_type_slugs: ['hindu-wedding', 'engagement', 'baby-shower', 'mundan', 'housewarming', 'anniversary'], min_guest_count: 50 }),
  rule({ capability_key: 'return_gifts', name: 'Return Gifts', event_type_slugs: ['kids-birthday', 'baby-shower', 'hindu-wedding', 'engagement', 'religious-event', 'housewarming', 'mundan'], contextual_labels: { 'religious-event': 'Prasad distribution', 'housewarming': 'Prasad distribution', 'mundan': 'Prasad distribution' } }),
  rule({ capability_key: 'reciprocity_ledger', name: 'Reciprocity Ledger', visibility: 'secondary', event_type_slugs: ['hindu-wedding', 'engagement'] }),
  // photos
  rule({ capability_key: 'photo_album', name: 'Photo Album', visibility: 'always' }),
  rule({ capability_key: 'face_recognition', name: 'Face Recognition Search', min_guest_count: 40 }),
  rule({ capability_key: 'album_share_link', name: 'Album Share Link', visibility: 'always' }),
  // planning
  rule({ capability_key: 'vendor_checklist', name: 'Vendor Checklist', visibility: 'always' }),
  rule({ capability_key: 'budget_planner', name: 'Budget Planner', requires_budget: true }),
  rule({ capability_key: 'sub_event_timeline', name: 'Sub-event Timeline', requires_sub_events: true }),
  rule({ capability_key: 'ai_planner', name: 'AI Planner', visibility: 'always' }),
  // vendor interaction
  rule({ capability_key: 'search_booking', name: 'Search & Booking', visibility: 'always' }),
  rule({ capability_key: 'chat', name: 'Chat with Vendor', requires_booking: true }),
  rule({ capability_key: 'write_review', name: 'Write a Review', requires_completed_booking: true }),
  rule({ capability_key: 'bar_vendors', name: 'Bar & Alcohol Vendors', excluded_event_type_slugs: ['religious-event', 'housewarming', 'mundan', 'kids-birthday'], suppressed_when_dry: true }),
];

// ── provider_capability_rules fixture ──
function pRule(overrides) {
  return {
    capability_key: null, name: null, categories: null, min_service_price: null,
    requires_verified: false, min_completed_bookings: null, config_value: null,
    ...overrides,
  };
}

const PROVIDER_RULES = [
  pRule({ capability_key: 'menu_builder', name: 'Menu Builder', categories: ['Caterers', 'Prasad Caterer'] }),
  pRule({ capability_key: 'dietary_certification', name: 'Dietary Certification', categories: ['Caterers', 'Prasad Caterer', 'Cake'] }),
  pRule({ capability_key: 'package_tiers', name: 'Package Tiers', categories: ['Photographers', 'Videography', 'Decorators', 'Makeup'] }),
  pRule({ capability_key: 'portfolio_video', name: 'Portfolio Video', categories: ['Photographers', 'Videography', 'Choreographer', 'DJ & Music', 'Dhol'] }),
  pRule({ capability_key: 'equipment_inventory', name: 'Equipment Inventory', categories: ['Sound System', 'Lighting', 'Tent House', 'Generator'] }),
  pRule({ capability_key: 'team_size', name: 'Team Size', categories: ['Caterers', 'Tent House', 'Decorators'] }),
  pRule({ capability_key: 'muhurat_availability', name: 'Muhurat Availability', categories: ['Pandit'] }),
  pRule({ capability_key: 'age_range_served', name: 'Age Range Served', categories: ['Mascot', 'Game Host', 'Magician', 'Face Painter', 'Puppet Show', 'Science Show'] }),
  pRule({ capability_key: 'travel_radius', name: 'Travel Radius', categories: ['Tent House', 'Sound System', 'Lighting', 'Generator', 'Bouncy Castle'] }),
  pRule({ capability_key: 'sub_event_tagging', name: 'Sub-event Tagging', categories: ['Decorators', 'Caterers', 'Photographers', 'DJ & Music', 'Makeup', 'Lighting'] }),
  pRule({ capability_key: 'advance_policy', name: 'Advance Payment Policy', min_service_price: 25000 }),
  pRule({ capability_key: 'featured_listing', name: 'Featured Listing', requires_verified: true, min_completed_bookings: 5 }),
  pRule({ capability_key: 'analytics_dashboard', name: 'Analytics Dashboard', min_completed_bookings: 10 }),
  pRule({ capability_key: 'portfolio_slots_extended', name: 'Extended Portfolio Slots', categories: ['Photographers', 'Videography', 'Decorators', 'Makeup', 'Mehendi'], config_value: 40 }),
];

console.log('=== Adversarial group-exclusion test (synthetic overlapping rules) ===');
{
  const GROUP_TEST = [
    rule({ capability_key: 'a', name: 'A', group_key: 'g', priority: 50, venue_types: ['x'] }),
    rule({ capability_key: 'b', name: 'B', group_key: 'g', priority: 90, venue_types: ['x'] }),
  ];
  const resolved = resolveCapabilities(GROUP_TEST, { venueType: 'x' });
  assert('both rules match the pre-group filter, but only 1 survives group exclusion', resolved.visible.length === 1);
  assert('higher-priority rule (b, priority 90) wins', isEnabled(resolved, 'b'));
  assert('lower-priority rule (a, priority 50) is dropped entirely, not just hidden', !isEnabled(resolved, 'a'));
}

console.log('\n=== Event fixture 1: small dry Hindu wedding at home, 25 guests ===');
{
  const ctx = { eventTypeSlug: 'hindu-wedding', venueType: 'independent_house', guestCount: 25, isDryEvent: true, isVegOnly: false, hasBudget: true, hasSubEvents: true, hasBooking: false, hasCompletedBooking: false };
  const r = resolveCapabilities(CAPABILITY_RULES, ctx);
  assert('entry_control resolves to no_entry_control only', isEnabled(r, 'no_entry_control') && !isEnabled(r, 'society_gate_pass') && !isEnabled(r, 'venue_attendance_qr') && !isEnabled(r, 'corporate_visitor_register'));
  assert('seating_chart hidden below 50-guest floor', !isEnabled(r, 'seating_chart'));
  assert('meal_preferences hidden below 30-guest floor', !isEnabled(r, 'meal_preferences'));
  assert('budget_planner shown (hasBudget)', isEnabled(r, 'budget_planner'));
  assert('sub_event_timeline shown (hasSubEvents)', isEnabled(r, 'sub_event_timeline'));
  assert('chat hidden (no booking yet)', !isEnabled(r, 'chat'));
  assert('bar_vendors hidden (dry event)', !isEnabled(r, 'bar_vendors'));
  assert('guest_list always visible', isEnabled(r, 'guest_list'));
}

console.log('\n=== Event fixture 2: large wet Hindu wedding at a banquet hall, 300 guests ===');
{
  const ctx = { eventTypeSlug: 'hindu-wedding', venueType: 'banquet_hall', guestCount: 300, isDryEvent: false, isVegOnly: false, hasBudget: true, hasSubEvents: true, hasBooking: true, hasCompletedBooking: true };
  const r = resolveCapabilities(CAPABILITY_RULES, ctx);
  assert('entry_control resolves to venue_attendance_qr only', isEnabled(r, 'venue_attendance_qr') && !isEnabled(r, 'society_gate_pass') && !isEnabled(r, 'no_entry_control'));
  assert('seating_chart shown at 300 guests', isEnabled(r, 'seating_chart'));
  assert('gift_qr_stickers shown at 300 guests', isEnabled(r, 'gift_qr_stickers'));
  assert('face_recognition shown at 300 guests', isEnabled(r, 'face_recognition'));
  assert('chat shown (has booking)', isEnabled(r, 'chat'));
  assert('write_review shown (completed booking)', isEnabled(r, 'write_review'));
  assert('bar_vendors shown (not dry, not excluded event type)', isEnabled(r, 'bar_vendors'));
  assert('meal_preferences uses default label (no contextual override for hindu-wedding)', r.byKey.meal_preferences.label === 'Meal Preferences');
}

console.log('\n=== Event fixture 3: a religious event at society clubhouse, veg-only, 40 guests ===');
{
  const ctx = { eventTypeSlug: 'religious-event', venueType: 'society_clubhouse', guestCount: 40, isDryEvent: true, isVegOnly: true, hasBudget: false, hasSubEvents: false, hasBooking: false, hasCompletedBooking: false };
  const r = resolveCapabilities(CAPABILITY_RULES, ctx);
  assert('entry_control resolves to society_gate_pass only', isEnabled(r, 'society_gate_pass') && !isEnabled(r, 'venue_attendance_qr'));
  assert('gift_register hidden (religious-event not in its event_type_slugs)', !isEnabled(r, 'gift_register'));
  assert('return_gifts shown with "Prasad distribution" contextual label', isEnabled(r, 'return_gifts') && r.byKey.return_gifts.label === 'Prasad distribution');
  assert('meal_preferences shown with "Satvik and Jain count" contextual label', isEnabled(r, 'meal_preferences') && r.byKey.meal_preferences.label === 'Satvik and Jain count');
  assert('bar_vendors hidden (explicitly excluded event type + dry)', !isEnabled(r, 'bar_vendors'));
  assert('budget_planner hidden (no budget set)', !isEnabled(r, 'budget_planner'));
}

console.log('\n=== Event fixture 4: corporate conference at an office, 150 guests ===');
{
  const ctx = { eventTypeSlug: 'corporate-conference', venueType: 'office', guestCount: 150, isDryEvent: false, isVegOnly: false, hasBudget: true, hasSubEvents: false, hasBooking: true, hasCompletedBooking: false };
  const r = resolveCapabilities(CAPABILITY_RULES, ctx);
  assert('entry_control resolves to corporate_visitor_register only', isEnabled(r, 'corporate_visitor_register') && !isEnabled(r, 'venue_attendance_qr'));
  assert('digital_invites hidden (excluded for corporate-conference)', !isEnabled(r, 'digital_invites'));
  assert('family_groups hidden (excluded for corporate-conference)', !isEnabled(r, 'family_groups'));
  assert('seating_chart shown (corporate-conference is a listed event type, 150>=50)', isEnabled(r, 'seating_chart'));
  assert('vip_flagging resolved into secondary bucket, not visible', r.secondary.some(x => x.capability_key === 'vip_flagging') && !r.visible.some(x => x.capability_key === 'vip_flagging'));
  assert('gift_register hidden (corporate-conference not a gifting event type)', !isEnabled(r, 'gift_register'));
}

console.log('\n=== Event fixture 5: kids birthday at a farmhouse, 60 guests, child age 7 ===');
{
  const ctx = { eventTypeSlug: 'kids-birthday', venueType: 'farmhouse', guestCount: 60, age: 7, isDryEvent: true, isVegOnly: false, hasBudget: false, hasSubEvents: false, hasBooking: false, hasCompletedBooking: false };
  const r = resolveCapabilities(CAPABILITY_RULES, ctx);
  assert('entry_control resolves to venue_attendance_qr only', isEnabled(r, 'venue_attendance_qr'));
  assert('return_gifts shown (kids-birthday is a listed event type)', isEnabled(r, 'return_gifts'));
  assert('gift_register hidden (kids-birthday not a listed event type)', !isEnabled(r, 'gift_register'));
  assert('bar_vendors hidden (explicitly excluded event type)', !isEnabled(r, 'bar_vendors'));
}

console.log('\n=== Provider fixture 1: Caterer, Rs 30000, verified, 8 completed bookings ===');
{
  const ctx = { category: 'Caterers', servicePrice: 30000, isVerified: true, completedBookings: 8 };
  const r = resolveProviderCapabilities(PROVIDER_RULES, ctx);
  const has = key => Boolean(r.byKey[key]);
  assert('menu_builder enabled (category match)', has('menu_builder'));
  assert('dietary_certification enabled (category match)', has('dietary_certification'));
  assert('advance_policy enabled (price >= 25000 floor)', has('advance_policy'));
  assert('featured_listing enabled (verified + 8>=5 completed bookings)', has('featured_listing'));
  assert('analytics_dashboard disabled (8 < 10 completed bookings floor)', !has('analytics_dashboard'));
  assert('portfolio_slots_extended disabled (Caterers not in its category list)', !has('portfolio_slots_extended'));
}

console.log('\n=== Provider fixture 2: Photographer, Rs 15000, unverified, 12 completed bookings ===');
{
  const ctx = { category: 'Photographers', servicePrice: 15000, isVerified: false, completedBookings: 12 };
  const r = resolveProviderCapabilities(PROVIDER_RULES, ctx);
  const has = key => Boolean(r.byKey[key]);
  assert('package_tiers enabled (category match)', has('package_tiers'));
  assert('portfolio_slots_extended enabled (category match)', has('portfolio_slots_extended'));
  assert('advance_policy disabled (price 15000 < 25000 floor)', !has('advance_policy'));
  assert('featured_listing disabled (unverified, even with enough bookings)', !has('featured_listing'));
  assert('analytics_dashboard enabled (12>=10 completed bookings, no category/verified gate)', has('analytics_dashboard'));
  assert('menu_builder disabled (wrong category)', !has('menu_builder'));
}

console.log('\n=== Provider fixture 3: Pandit, no price set, unverified, 0 completed bookings ===');
{
  const ctx = { category: 'Pandit', servicePrice: null, isVerified: false, completedBookings: 0 };
  const r = resolveProviderCapabilities(PROVIDER_RULES, ctx);
  assert('exactly one capability enabled', r.enabled.length === 1);
  assert('muhurat_availability is the one enabled capability', r.enabled[0]?.capability_key === 'muhurat_availability');
  assert('advance_policy disabled (null price never meets a price floor)', !r.byKey.advance_policy);
}

console.log('\n=== Gate pass: entryControl resolution ===');
{
  const fixtures = [
    { label: '300-guest wedding, banquet_hall', ctx: { eventTypeSlug: 'hindu-wedding', venueType: 'banquet_hall', guestCount: 300 }, expectKey: 'venue_attendance_qr' },
    { label: '60-guest wedding, society_flat', ctx: { eventTypeSlug: 'hindu-wedding', venueType: 'society_flat', guestCount: 60 }, expectKey: 'society_gate_pass' },
    { label: 'wedding, venueType null', ctx: { eventTypeSlug: 'hindu-wedding', venueType: null, guestCount: 200 }, expectKey: null },
    { label: '20-guest wedding, banquet_hall (below 30-guest floor)', ctx: { eventTypeSlug: 'hindu-wedding', venueType: 'banquet_hall', guestCount: 20 }, expectKey: null },
    { label: 'independent_house', ctx: { eventTypeSlug: 'hindu-wedding', venueType: 'independent_house', guestCount: 50 }, expectKey: 'no_entry_control' },
    { label: 'temple', ctx: { eventTypeSlug: 'religious-event', venueType: 'temple', guestCount: 50 }, expectKey: 'no_entry_control' },
    { label: 'corporate conference, office', ctx: { eventTypeSlug: 'corporate-conference', venueType: 'office', guestCount: 100 }, expectKey: 'corporate_visitor_register' },
  ];
  for (const f of fixtures) {
    const r = resolveCapabilities(CAPABILITY_RULES, f.ctx);
    if (f.expectKey === null) {
      assert(`${f.label}: entryControl is null`, r.entryControl === null);
    } else {
      assert(`${f.label}: entryControl is ${f.expectKey}`, r.entryControl?.capability_key === f.expectKey);
    }
  }

  console.log('\n=== Gate pass: at most one entry capability across every fixture above + all 5 event fixtures ===');
  const allContexts = [
    ...fixtures.map(f => f.ctx),
    { eventTypeSlug: 'hindu-wedding', venueType: 'independent_house', guestCount: 25, isDryEvent: true },
    { eventTypeSlug: 'hindu-wedding', venueType: 'banquet_hall', guestCount: 300 },
    { eventTypeSlug: 'religious-event', venueType: 'society_clubhouse', guestCount: 40 },
    { eventTypeSlug: 'corporate-conference', venueType: 'office', guestCount: 150 },
    { eventTypeSlug: 'kids-birthday', venueType: 'farmhouse', guestCount: 60, age: 7 },
  ];
  const atMostOne = allContexts.every(ctx => {
    const r = resolveCapabilities(CAPABILITY_RULES, ctx);
    const entryControlCount = r.visible.filter(c => c.group_key === 'entry_control').length
      + r.secondary.filter(c => c.group_key === 'entry_control').length;
    return entryControlCount <= 1;
  });
  assert('every fixture resolves at most one entry_control capability', atMostOne);
}

console.log('\n=== generatePassCode ===');
{
  const codes = new Set();
  let hasBannedChar = false;
  for (let i = 0; i < 1000; i++) {
    const code = generatePassCode([...codes]);
    if (/[IO01]/.test(code)) hasBannedChar = true;
    codes.add(code);
  }
  assert('1000 codes generated, no duplicates', codes.size === 1000);
  assert('no code contains I, O, 0, or 1', !hasBannedChar);
  assert('every code is 6 characters', [...codes].every(c => c.length === 6));
}

console.log(`\n=== Summary: ${passCount} passed, ${failCount} failed ===`);
if (failCount > 0) process.exit(1);
