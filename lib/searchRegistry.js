// Static, curated list of navigable destinations for GlobalSearch —
// deliberately NOT exhaustive (69 screens exist; this covers the meaningful
// entry points a user would actually type-to-find). Customer-facing
// features built this session are the primary focus per the task brief;
// provider/admin entries are a small illustrative set proving role-scoping
// works, not a curated pass over those two role branches — expect this list
// to grow/change on review, it's a first draft.
//
// Shape:
//   id: stable string, unique
//   label: shown in results
//   keywords: extra match terms beyond the label itself (aliases, related
//     words) — matched the same way label is (see GlobalSearch.js)
//   role: 'customer' | 'provider' | 'admin' — which session role sees this
//     entry (no 'any' cases exist yet in this draft; every current entry
//     genuinely only applies to one role's navigator branch)
//   screen: the real react-navigation screen name from App.js
//   tab: true if `screen` is a CustomerTabs tab route (Plan/Discover/
//     Bookings/Albums/Profile) rather than a plain top-level Stack.Screen —
//     these two need different navigation.navigate() call shapes
//   needsEvent: true if the destination screen requires an eventId/event
//     param to render anything meaningful — GlobalSearch routes these
//     through the existing event-picker pattern first if no event is
//     already known in context
//   note: (optional) an honest caveat about what tapping this result
//     actually lands you on, when it's not a perfect 1:1 (e.g. a feature
//     that's really a modal inside another screen, not its own screen)

export const SEARCH_REGISTRY = [
  // ── Guest-list-adjacent features (this session's biggest build area) ──
  { id: 'gate-passes', label: 'Gate Passes', keywords: ['qr', 'entry', 'check-in', 'scan'], role: 'customer', screen: 'GatePass', needsEvent: true },
  { id: 'seating-chart', label: 'Seating Chart', keywords: ['tables', 'seat', 'arrange'], role: 'customer', screen: 'SeatingChart', needsEvent: true },
  { id: 'guest-list', label: 'Guest List', keywords: ['guests', 'add guest', 'rsvp'], role: 'customer', screen: 'GuestList', needsEvent: true },
  {
    id: 'functions', label: 'Functions', keywords: ['haldi', 'sangeet', 'mehendi', 'reception', 'multi-function', 'sub-event'],
    role: 'customer', screen: 'GuestList', needsEvent: true, params: { openModal: 'functions' },
  },
  {
    id: 'invites', label: 'Invites', keywords: ['invitation', 'invite designer', 'share invite'],
    role: 'customer', screen: 'GuestList', needsEvent: true, params: { openModal: 'invite' },
  },
  { id: 'rsvp-tracking', label: 'RSVP Tracking', keywords: ['who\'s coming', 'responses'], role: 'customer', screen: 'GuestList', needsEvent: true },
  { id: 'gift-stickers', label: 'Gift Register', keywords: ['gifts', 'stickers', 'who gave what'], role: 'customer', screen: 'GiftStickers', needsEvent: true },
  { id: 'return-gifts', label: 'Return Gifts', keywords: ['favors', 'thank you gifts'], role: 'customer', screen: 'ReturnGifts', needsEvent: true },
  { id: 'checklist', label: 'Checklist', keywords: ['to-do', 'todos', 'tasks'], role: 'customer', screen: 'EventTodo', needsEvent: true },
  { id: 'visitor-list', label: 'Gate List', keywords: ['visitor list', 'security'], role: 'customer', screen: 'VisitorList', needsEvent: true },
  { id: 'reciprocity-ledger', label: 'Reciprocity Ledger', keywords: ['who gave', 'gift tracking', 'lena dena'], role: 'customer', screen: 'ReciprocityLedger', needsEvent: true },
  {
    id: 'travel', label: 'Travel & Accommodation', keywords: ['outstation', 'pickup', 'hotel', 'stay'],
    role: 'customer', screen: 'GuestList', needsEvent: true, params: { openModal: 'travel' },
  },
  {
    id: 'delegate-access', label: 'Manage Access', keywords: ['delegate', 'co-host', 'invite a helper'],
    role: 'customer', screen: 'GuestList', needsEvent: true, params: { openModal: 'manageAccess' },
  },

  // ── Planning / vendors ──
  { id: 'event-planner', label: 'Plan an Event', keywords: ['new event', 'event planner'], role: 'customer', screen: 'EventPlanner', needsEvent: false },
  { id: 'plan-view', label: 'Event Plan', keywords: ['budget', 'checklist ladder', 'p1 must-book'], role: 'customer', screen: 'PlanView', needsEvent: true },
  { id: 'discover', label: 'Discover', keywords: ['browse vendors', 'find providers'], role: 'customer', screen: 'Discover', tab: true, needsEvent: false },
  { id: 'saved-providers', label: 'Saved Providers', keywords: ['wishlist', 'favorites'], role: 'customer', screen: 'SavedProviders', needsEvent: false },
  { id: 'blocked-providers', label: 'Blocked Providers', keywords: ['hidden vendors'], role: 'customer', screen: 'BlockedProviders', needsEvent: false },
  { id: 'personal-vendors', label: 'Chat with Vendors', keywords: ['my vendors', 'contacts'], role: 'customer', screen: 'PersonalVendors', needsEvent: false },
  { id: 'list-business', label: 'Claim Your Business', keywords: ['vendor signup', 'claim listing'], role: 'customer', screen: 'ClaimBusiness', needsEvent: false },

  // ── Bookings / account ──
  { id: 'bookings', label: 'Bookings', keywords: ['my bookings', 'payments'], role: 'customer', screen: 'Bookings', tab: true, needsEvent: false },
  { id: 'plan-tab', label: 'Plan', keywords: ['my plans', 'saved plans'], role: 'customer', screen: 'Plan', tab: true, needsEvent: false },
  { id: 'albums', label: 'Albums', keywords: ['photos', 'event photos'], role: 'customer', screen: 'Albums', tab: true, needsEvent: false },
  { id: 'profile', label: 'Profile', keywords: ['account', 'settings'], role: 'customer', screen: 'Profile', tab: true, needsEvent: false },
  { id: 'notifications-customer', label: 'Notifications', keywords: ['alerts'], role: 'customer', screen: 'Notifications', needsEvent: false },
  { id: 'inbox-customer', label: 'Inbox', keywords: ['messages', 'chat'], role: 'customer', screen: 'Inbox', needsEvent: false },

  // ── Provider (small illustrative set — not a curated pass, see file header) ──
  { id: 'provider-dashboard', label: 'Provider Dashboard', keywords: ['erp', 'my business'], role: 'provider', screen: 'ProviderDashboard', needsEvent: false },
  { id: 'provider-availability', label: 'Availability', keywords: ['calendar', 'booked dates'], role: 'provider', screen: 'Availability', needsEvent: false },
  { id: 'provider-portfolio', label: 'Portfolio', keywords: ['work samples', 'gallery'], role: 'provider', screen: 'Portfolio', needsEvent: false },
  { id: 'provider-invoices', label: 'Invoices', keywords: ['billing', 'payments'], role: 'provider', screen: 'InvoicesList', needsEvent: false },
  { id: 'provider-notifications', label: 'Notifications', keywords: ['alerts'], role: 'provider', screen: 'Notifications', needsEvent: false },

  // ── Admin (small illustrative set) ──
  { id: 'admin-panel', label: 'Admin Panel', keywords: ['dashboard'], role: 'admin', screen: 'AdminPanel', needsEvent: false },
  { id: 'admin-manage-users', label: 'Manage Users', keywords: ['suspend', 'ban', 'accounts'], role: 'admin', screen: 'ManageUsers', needsEvent: false },
  { id: 'admin-claim-requests', label: 'Claim Requests', keywords: ['vendor claims'], role: 'admin', screen: 'ClaimRequests', needsEvent: false },
];
