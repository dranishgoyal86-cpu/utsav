// eventTaxonomy.js
// Single source of truth for event categories across Utsav —
// the event-type picker, provider onboarding tags, the agent, and the website.
//
// Each category has a stable `id` (never change these — they're stored in the DB),
// a display `label`, an `icon` hint, a `demand` tier (how much self-serve marketplace
// booking to expect: high | medium | low), and `subs` (the specific events).
// `subs` ids are also stable slugs.

export const EVENT_CATEGORIES = [
  {
    id: 'wedding',
    label: 'Weddings & Matrimonial',
    icon: 'rings',
    demand: 'high',
    subs: [
      { id: 'roka', label: 'Roka' },
      { id: 'engagement', label: 'Engagement / Sagai' },
      { id: 'tilak', label: 'Tilak' },
      { id: 'mehendi', label: 'Mehendi' },
      { id: 'sangeet', label: 'Sangeet' },
      { id: 'haldi', label: 'Haldi' },
      { id: 'cocktail', label: 'Cocktail night' },
      { id: 'baraat', label: 'Baraat' },
      { id: 'hindu_wedding', label: 'Hindu wedding (pheras)' },
      { id: 'nikah', label: 'Nikah' },
      { id: 'anand_karaj', label: 'Anand Karaj (Sikh)' },
      { id: 'christian_wedding', label: 'Christian wedding' },
      { id: 'court_marriage', label: 'Court / registered marriage' },
      { id: 'reception', label: 'Reception' },
      { id: 'valima', label: 'Valima' },
      { id: 'grihapravesh_wed', label: 'Grihapravesh / Mooh dikhai' },
      { id: 'destination_wedding', label: 'Destination wedding' },
      { id: 'micro_wedding', label: 'Intimate / micro wedding' },
    ],
  },
  {
    id: 'religious',
    label: 'Religious & Ceremonial',
    icon: 'diya',
    demand: 'high',
    subs: [
      { id: 'satyanarayan_puja', label: 'Satyanarayan Puja' },
      { id: 'griha_pravesh', label: 'Griha Pravesh' },
      { id: 'vastu_puja', label: 'Vastu / Havan' },
      { id: 'jagran', label: 'Jagran / Mata ki Chowki' },
      { id: 'kirtan', label: 'Kirtan / Bhajan Sandhya' },
      { id: 'langar', label: 'Langar / Bhandara' },
      { id: 'naamkaran', label: 'Naamkaran' },
      { id: 'mundan', label: 'Mundan' },
      { id: 'annaprashan', label: 'Annaprashan' },
      { id: 'janeu', label: 'Janeu / Upanayan' },
      { id: 'festival_puja', label: 'Festival puja / pandal' },
      { id: 'last_rites', label: 'Last Rites / Antim Sanskar' },
    ],
  },
  {
    id: 'personal',
    label: 'Personal & Family Milestones',
    icon: 'cake',
    demand: 'high',
    subs: [
      { id: 'birthday_kids', label: "Kids' birthday" },
      { id: 'first_birthday', label: 'First birthday' },
      { id: 'birthday_milestone', label: 'Milestone birthday (18/50/60)' },
      { id: 'anniversary', label: 'Anniversary' },
      { id: 'anniversary_milestone', label: 'Milestone anniversary (25/50)' },
      { id: 'baby_shower', label: 'Baby shower / Godh Bharai' },
      { id: 'housewarming', label: 'Housewarming' },
      { id: 'retirement', label: 'Retirement party' },
      { id: 'farewell', label: 'Farewell party' },
      { id: 'reunion', label: 'Reunion / Get-together' },
      { id: 'kitty_party', label: 'Kitty party' },
    ],
  },
  {
    id: 'corporate',
    label: 'Corporate & Business',
    icon: 'briefcase',
    demand: 'medium',
    subs: [
      { id: 'conference', label: 'Conference / Seminar / Summit' },
      { id: 'product_launch', label: 'Product launch' },
      { id: 'agm', label: 'AGM / Townhall' },
      { id: 'dealer_meet', label: 'Dealer / Channel-partner meet' },
      { id: 'sales_kickoff', label: 'Sales kick-off' },
      { id: 'offsite', label: 'Offsite / Team outing' },
      { id: 'annual_day', label: 'Annual day / Family day' },
      { id: 'rewards_night', label: 'Rewards & Recognition night' },
      { id: 'corp_festive', label: 'Corporate festive celebration' },
      { id: 'mice', label: 'MICE / Incentive event' },
      { id: 'press_conference', label: 'Press conference' },
      { id: 'csr_event', label: 'CSR event' },
    ],
  },
  {
    id: 'social',
    label: 'Social & Community',
    icon: 'people',
    demand: 'medium',
    subs: [
      { id: 'charity_gala', label: 'Charity gala / Fundraiser' },
      { id: 'award_ceremony', label: 'Award ceremony' },
      { id: 'club_event', label: 'Club / Society event' },
      { id: 'rwa_event', label: 'RWA / Community function' },
      { id: 'political_rally', label: 'Political rally / Public gathering' },
      { id: 'cultural_assoc', label: 'Cultural association event' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entertainment & Cultural',
    icon: 'music',
    demand: 'medium',
    subs: [
      { id: 'concert', label: 'Concert / Live music' },
      { id: 'dj_night', label: 'DJ night' },
      { id: 'comedy_show', label: 'Comedy show' },
      { id: 'theatre', label: 'Theatre / Drama' },
      { id: 'recital', label: 'Dance / Music recital' },
      { id: 'film_premiere', label: 'Film premiere / Screening' },
      { id: 'fashion_show', label: 'Fashion show' },
      { id: 'celebrity_appearance', label: 'Celebrity appearance' },
    ],
  },
  {
    id: 'educational',
    label: 'Educational & Institutional',
    icon: 'grad',
    demand: 'low',
    subs: [
      { id: 'college_fest', label: 'College fest / Cultural night' },
      { id: 'convocation', label: 'Convocation / Graduation' },
      { id: 'annual_function', label: 'School annual function' },
      { id: 'sports_day', label: 'Sports day' },
      { id: 'alumni_meet', label: 'Alumni meet' },
      { id: 'freshers_farewell', label: "Freshers' / Farewell party" },
      { id: 'competition', label: 'Quiz / Debate competition' },
    ],
  },
  {
    id: 'sports',
    label: 'Sports & Recreational',
    icon: 'trophy',
    demand: 'low',
    subs: [
      { id: 'tournament', label: 'Tournament / Match' },
      { id: 'marathon', label: 'Marathon / Run' },
      { id: 'corp_league', label: 'Corporate sports league' },
      { id: 'team_building', label: 'Adventure / Team-building' },
      { id: 'esports', label: 'E-sports event' },
    ],
  },
  {
    id: 'exhibition',
    label: 'Exhibitions & Trade',
    icon: 'stall',
    demand: 'low',
    subs: [
      { id: 'wedding_expo', label: 'Wedding / Lifestyle exhibition' },
      { id: 'art_exhibition', label: 'Art exhibition' },
      { id: 'book_fair', label: 'Book fair' },
      { id: 'trade_expo', label: 'Auto / Real-estate / Trade expo' },
      { id: 'food_festival', label: 'Food festival' },
      { id: 'flea_popup', label: 'Flea market / Pop-up' },
    ],
  },
  {
    id: 'government',
    label: 'Government & Public',
    icon: 'flag',
    demand: 'low',
    subs: [
      { id: 'inauguration', label: 'Inauguration / Foundation-laying' },
      { id: 'national_function', label: 'National day function' },
      { id: 'state_function', label: 'Official state function' },
      { id: 'awareness_campaign', label: 'Public awareness campaign' },
      { id: 'felicitation', label: 'Felicitation ceremony' },
    ],
  },
];

// ---- helpers ----

// Flat list of every sub-event, each carrying its parent category id/label.
export const ALL_SUBEVENTS = EVENT_CATEGORIES.flatMap((c) =>
  c.subs.map((s) => ({ ...s, categoryId: c.id, categoryLabel: c.label }))
);

// Quick lookup: subId -> { ...sub, categoryId, categoryLabel }
export const SUBEVENT_BY_ID = Object.fromEntries(
  ALL_SUBEVENTS.map((s) => [s.id, s])
);

// Category lookup: catId -> category
export const CATEGORY_BY_ID = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.id, c])
);

// Categories most relevant to marketplace self-serve booking (for surfacing first).
// Label for any sub or category id, e.g. labelFor('haldi') -> 'Haldi'
export function labelFor(id) {
  return SUBEVENT_BY_ID[id]?.label || CATEGORY_BY_ID[id]?.label || id;
}
