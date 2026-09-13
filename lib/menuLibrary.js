// Menu Library — Birthday Event Improvement plan, Piece 5 (rebuilt).
// Replaces the earlier course-size (3/4/5-course) model with the fuller
// Food Type -> Cuisine -> Category -> Dish structure Anish specified, plus
// per-pick Price/Quantity/Notes. This file stays a static catalog + pure
// helpers only (no Supabase, no React) — same convention as
// lib/activityIdeas.js.
//
// Real, honest scope limits (flagged rather than silently glossed over):
// - `foodTypes` on each dish reflects what the source list actually said
//   (veg vs egg vs non-veg, plus kids/live-counter/beverage/dessert
//   groupings) — it does NOT mean every "pure-veg" dish is verified vegan
//   or onion-garlic-free. Jain and Vegan are offered as filter chips
//   because Anish asked for them, but no dish here is individually
//   verified against either — a host should still confirm with their
//   caterer for those two specifically.
// - Spicy level, dairy/nut content, gluten-free, prep style and meal time
//   (also in Anish's list) are NOT pre-tagged per dish — reliably tagging
//   ~150 dishes with those would mean guessing, not real data. They're
//   left as free-text `notes` the host can add per pick instead
//   (components/MenuLibrary.js), which is honest rather than fabricated.
// - Two named categories (Accompaniments, Packaged Items) had no dishes
//   listed in Anish's spec — a small, clearly-fillable starter set is
//   included for each so the category isn't empty, not because these were
//   given explicitly.
// - No catalog dish can cover every real menu, so every category also
//   supports adding a free-text custom dish (see `onAddCustom` in
//   components/MenuLibrary.js) — this was Anish's own explicit ask.
export const FOOD_TYPES = [
  { slug: 'pure-veg', label: 'Pure Veg' },
  { slug: 'veg-egg', label: 'Veg + Egg' },
  { slug: 'non-veg', label: 'Non-Veg' },
  { slug: 'jain', label: 'Jain Food' },
  { slug: 'vegan', label: 'Vegan' },
  { slug: 'kids-special', label: 'Kids Special' },
  { slug: 'live-counters', label: 'Live Counters' },
  { slug: 'beverages', label: 'Beverages' },
  { slug: 'desserts', label: 'Desserts' },
];

export const CUISINES = [
  { slug: 'north-indian', label: 'North Indian' },
  { slug: 'south-indian', label: 'South Indian' },
  { slug: 'punjabi', label: 'Punjabi' },
  { slug: 'gujarati', label: 'Gujarati' },
  { slug: 'rajasthani', label: 'Rajasthani' },
  { slug: 'maharashtrian', label: 'Maharashtrian' },
  { slug: 'bengali', label: 'Bengali' },
  { slug: 'coastal', label: 'Coastal / Goan / Mangalorean' },
  { slug: 'hyderabadi-mughlai', label: 'Hyderabadi / Mughlai' },
  { slug: 'chinese', label: 'Chinese / Indo-Chinese' },
  { slug: 'italian', label: 'Italian' },
  { slug: 'continental', label: 'Continental' },
  { slug: 'mexican', label: 'Mexican' },
  { slug: 'thai-asian', label: 'Thai / Asian' },
  { slug: 'street-food', label: 'Street Food / Chaat' },
  { slug: 'fast-food', label: 'Fast Food' },
  { slug: 'kids-party', label: 'Kids Party Menu' },
  { slug: 'bakery-desserts', label: 'Bakery / Desserts' },
];

export const MENU_CATEGORIES = [
  { slug: 'welcome-drinks', label: 'Welcome Drinks' },
  { slug: 'starters', label: 'Starters' },
  { slug: 'chaat-street-food', label: 'Chaat / Street Food' },
  { slug: 'main-course', label: 'Main Course' },
  { slug: 'breads', label: 'Breads' },
  { slug: 'rice-biryani', label: 'Rice / Biryani' },
  { slug: 'dal-curry', label: 'Dal / Curry' },
  { slug: 'accompaniments', label: 'Accompaniments' },
  { slug: 'kids-menu', label: 'Kids Menu' },
  { slug: 'live-counters', label: 'Live Counters' },
  { slug: 'desserts', label: 'Desserts' },
  { slug: 'tea-coffee', label: 'Tea / Coffee' },
  { slug: 'packaged-items', label: 'Packaged Items' },
];

// [name, category, foodTypes[], cuisine|null] — kept compact since this is
// ~150 rows; mapped into full objects just below.
const RAW_DISHES = [
  // Welcome Drinks
  ['Jaljeera', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Aam Panna', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Nimbu Pani', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Fresh Lime Soda', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Rose Sherbet', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Kokum Sharbat', 'welcome-drinks', ['pure-veg', 'beverages'], 'coastal'],
  ['Buttermilk / Chaas', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Lassi', 'welcome-drinks', ['pure-veg', 'beverages'], 'punjabi'],
  ['Cold Coffee', 'welcome-drinks', ['pure-veg', 'beverages'], null],
  ['Mocktails', 'welcome-drinks', ['pure-veg', 'beverages'], null],

  // Veg Starters
  ['Paneer Tikka', 'starters', ['pure-veg'], 'north-indian'],
  ['Hara Bhara Kebab', 'starters', ['pure-veg'], 'north-indian'],
  ['Veg Seekh Kebab', 'starters', ['pure-veg'], 'north-indian'],
  ['Cheese Corn Balls', 'starters', ['pure-veg'], 'continental'],
  ['Veg Spring Rolls', 'starters', ['pure-veg'], 'chinese'],
  ['Veg Manchurian (Dry)', 'starters', ['pure-veg'], 'chinese'],
  ['Chilli Paneer', 'starters', ['pure-veg'], 'chinese'],
  ['Crispy Corn', 'starters', ['pure-veg'], null],
  ['French Fries', 'starters', ['pure-veg'], 'fast-food'],
  ['Potato Wedges', 'starters', ['pure-veg'], 'fast-food'],
  ['Mini Samosa', 'starters', ['pure-veg'], 'north-indian'],
  ['Dhokla', 'starters', ['pure-veg'], 'gujarati'],
  ['Khandvi', 'starters', ['pure-veg'], 'gujarati'],
  ['Kothimbir Vadi', 'starters', ['pure-veg'], 'maharashtrian'],
  ['Crispy Chilli Potato', 'starters', ['pure-veg'], 'chinese'],
  ['Nachos', 'starters', ['pure-veg'], 'mexican'],
  ['Sandwiches', 'starters', ['pure-veg'], 'fast-food'],
  ['Chicken Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Malai Chicken Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Tandoori Chicken', 'starters', ['non-veg'], 'punjabi'],
  ['Chicken Seekh Kebab', 'starters', ['non-veg'], 'north-indian'],
  ['Chicken Lollypop', 'starters', ['non-veg'], 'chinese'],
  ['Chilli Chicken', 'starters', ['non-veg'], 'chinese'],
  ['Chicken 65', 'starters', ['non-veg'], 'south-indian'],
  ['Fish Fingers', 'starters', ['non-veg'], 'continental'],
  ['Fish Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Prawns Koliwada', 'starters', ['non-veg'], 'coastal'],
  ['Mutton Seekh Kebab', 'starters', ['non-veg'], 'hyderabadi-mughlai'],
  ['Egg Pakora', 'starters', ['veg-egg'], null],
  ['Chicken Momos', 'starters', ['non-veg'], 'chinese'],
  ['Chicken Nuggets', 'starters', ['non-veg'], 'fast-food'],
  ['Chicken Popcorn', 'starters', ['non-veg'], 'fast-food'],
  ['Chicken Sandwich', 'starters', ['non-veg'], 'fast-food'],

  // Chaat / Street Food
  ['Pani Puri', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Sev Puri', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Dahi Puri', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Bhel Puri', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Papdi Chaat', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Aloo Tikki Chaat', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Raj Kachori', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Dahi Bhalla', 'chaat-street-food', ['pure-veg'], 'street-food'],
  ['Pav Bhaji', 'chaat-street-food', ['pure-veg'], 'maharashtrian'],
  ['Vada Pav', 'chaat-street-food', ['pure-veg'], 'maharashtrian'],
  ['Misal Pav', 'chaat-street-food', ['pure-veg'], 'maharashtrian'],
  ['Chole Kulche', 'chaat-street-food', ['pure-veg'], 'punjabi'],
  ['Chole Bhature', 'chaat-street-food', ['pure-veg'], 'punjabi'],

  // Main Course — veg
  ['Paneer Butter Masala', 'main-course', ['pure-veg'], 'punjabi'],
  ['Shahi Paneer', 'main-course', ['pure-veg'], 'north-indian'],
  ['Kadai Paneer', 'main-course', ['pure-veg'], 'punjabi'],
  ['Palak Paneer', 'main-course', ['pure-veg'], 'punjabi'],
  ['Malai Kofta', 'main-course', ['pure-veg'], 'north-indian'],
  ['Veg Kolhapuri', 'main-course', ['pure-veg'], 'north-indian'],
  ['Mix Veg Curry', 'main-course', ['pure-veg'], 'north-indian'],
  ['Dum Aloo', 'main-course', ['pure-veg'], 'north-indian'],
  ['Idli', 'main-course', ['pure-veg'], 'south-indian'],
  ['Medu Vada', 'main-course', ['pure-veg'], 'south-indian'],
  ['Masala Dosa', 'main-course', ['pure-veg'], 'south-indian'],
  ['Plain Dosa', 'main-course', ['pure-veg'], 'south-indian'],
  ['Uttapam', 'main-course', ['pure-veg'], 'south-indian'],
  ['Appam with Stew', 'main-course', ['pure-veg'], 'coastal'],
  ['Pongal', 'main-course', ['pure-veg'], 'south-indian'],
  ['Undhiyu', 'main-course', ['pure-veg'], 'gujarati'],
  ['Sev Tameta', 'main-course', ['pure-veg'], 'gujarati'],
  ['Gatte ki Sabzi', 'main-course', ['pure-veg'], 'rajasthani'],
  ['Ker Sangri', 'main-course', ['pure-veg'], 'rajasthani'],
  ['Dal Baati Churma', 'main-course', ['pure-veg'], 'rajasthani'],
  ['Sabudana Khichdi', 'main-course', ['pure-veg'], 'maharashtrian'],
  ['Puran Poli', 'main-course', ['pure-veg'], 'maharashtrian'],
  ['Bharli Vangi', 'main-course', ['pure-veg'], 'maharashtrian'],
  ['Batata Bhaji', 'main-course', ['pure-veg'], 'maharashtrian'],
  ['Veg Manchurian (Gravy)', 'main-course', ['pure-veg'], 'chinese'],
  ['Chilli Paneer (Gravy)', 'main-course', ['pure-veg'], 'chinese'],
  ['Veg Pizza', 'main-course', ['pure-veg'], 'italian'],
  ['Margherita Pizza', 'main-course', ['pure-veg'], 'italian'],
  ['White Sauce Pasta', 'main-course', ['pure-veg'], 'italian'],
  ['Red Sauce Pasta', 'main-course', ['pure-veg'], 'italian'],
  ['Mac and Cheese', 'main-course', ['pure-veg'], 'continental'],
  ['Veg Burger', 'main-course', ['pure-veg'], 'fast-food'],
  ['Veg Lasagna', 'main-course', ['pure-veg'], 'italian'],
  // Main Course — non-veg
  ['Butter Chicken', 'main-course', ['non-veg'], 'punjabi'],
  ['Chicken Curry', 'main-course', ['non-veg'], 'north-indian'],
  ['Kadai Chicken', 'main-course', ['non-veg'], 'punjabi'],
  ['Chicken Tikka Masala', 'main-course', ['non-veg'], 'north-indian'],
  ['Chicken Korma', 'main-course', ['non-veg'], 'hyderabadi-mughlai'],
  ['Chicken Chettinad', 'main-course', ['non-veg'], 'south-indian'],
  ['Chicken Stew', 'main-course', ['non-veg'], 'coastal'],
  ['Mutton Curry', 'main-course', ['non-veg'], 'north-indian'],
  ['Rogan Josh', 'main-course', ['non-veg'], 'north-indian'],
  ['Mutton Korma', 'main-course', ['non-veg'], 'hyderabadi-mughlai'],
  ['Fish Curry', 'main-course', ['non-veg'], 'coastal'],
  ['Goan Fish Curry', 'main-course', ['non-veg'], 'coastal'],
  ['Prawn Curry', 'main-course', ['non-veg'], 'coastal'],
  ['Egg Curry', 'main-course', ['veg-egg'], null],
  ['Chilli Chicken (Gravy)', 'main-course', ['non-veg'], 'chinese'],
  ['Chicken Manchurian', 'main-course', ['non-veg'], 'chinese'],
  ['Schezwan Chicken', 'main-course', ['non-veg'], 'chinese'],
  ['Chicken Pizza', 'main-course', ['non-veg'], 'italian'],
  ['Chicken Burger', 'main-course', ['non-veg'], 'fast-food'],
  ['Fish and Chips', 'main-course', ['non-veg'], 'continental'],
  ['Grilled Chicken', 'main-course', ['non-veg'], 'continental'],
  ['Chicken Pasta', 'main-course', ['non-veg'], 'italian'],

  // Dal / Curry
  ['Chole', 'dal-curry', ['pure-veg'], 'punjabi'],
  ['Rajma', 'dal-curry', ['pure-veg'], 'punjabi'],
  ['Dal Makhani', 'dal-curry', ['pure-veg'], 'punjabi'],
  ['Dal Tadka', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Gujarati Kadhi', 'dal-curry', ['pure-veg'], 'gujarati'],
  ['Dal Dhokli', 'dal-curry', ['pure-veg'], 'gujarati'],
  ['Rajasthani Kadhi', 'dal-curry', ['pure-veg'], 'rajasthani'],

  // Breads
  ['Roti', 'breads', ['pure-veg'], 'north-indian'],
  ['Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Butter Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Garlic Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Paratha', 'breads', ['pure-veg'], 'north-indian'],
  ['Kulcha', 'breads', ['pure-veg'], 'punjabi'],
  ['Missi Roti', 'breads', ['pure-veg'], 'rajasthani'],
  ['Poori', 'breads', ['pure-veg'], 'north-indian'],
  ['Bhature', 'breads', ['pure-veg'], 'punjabi'],
  ['Thepla', 'breads', ['pure-veg'], 'gujarati'],
  ['Garlic Bread', 'breads', ['pure-veg'], 'italian'],

  // Rice / Biryani
  ['Jeera Rice', 'rice-biryani', ['pure-veg'], null],
  ['Steamed Rice', 'rice-biryani', ['pure-veg'], null],
  ['Veg Pulao', 'rice-biryani', ['pure-veg'], null],
  ['Peas Pulao', 'rice-biryani', ['pure-veg'], null],
  ['Veg Biryani', 'rice-biryani', ['pure-veg'], 'hyderabadi-mughlai'],
  ['Paneer Biryani', 'rice-biryani', ['pure-veg'], 'hyderabadi-mughlai'],
  ['Curd Rice', 'rice-biryani', ['pure-veg'], 'south-indian'],
  ['Lemon Rice', 'rice-biryani', ['pure-veg'], 'south-indian'],
  ['Coconut Rice', 'rice-biryani', ['pure-veg'], 'south-indian'],
  ['Veg Hakka Noodles', 'rice-biryani', ['pure-veg'], 'chinese'],
  ['Veg Fried Rice', 'rice-biryani', ['pure-veg'], 'chinese'],
  ['Schezwan Noodles', 'rice-biryani', ['pure-veg'], 'chinese'],
  ['Chicken Biryani', 'rice-biryani', ['non-veg'], 'hyderabadi-mughlai'],
  ['Mutton Biryani', 'rice-biryani', ['non-veg'], 'hyderabadi-mughlai'],
  ['Egg Biryani', 'rice-biryani', ['veg-egg'], 'hyderabadi-mughlai'],
  ['Fish Biryani', 'rice-biryani', ['non-veg'], 'coastal'],
  ['Prawn Biryani', 'rice-biryani', ['non-veg'], 'coastal'],
  ['Chicken Fried Rice', 'rice-biryani', ['non-veg'], 'chinese'],
  ['Egg Fried Rice', 'rice-biryani', ['veg-egg'], 'chinese'],
  ['Mixed Non-Veg Fried Rice', 'rice-biryani', ['non-veg'], 'chinese'],
  ['Chicken Hakka Noodles', 'rice-biryani', ['non-veg'], 'chinese'],
  ['Egg Noodles', 'rice-biryani', ['veg-egg'], 'chinese'],

  // Accompaniments (Anish named this category with no dishes — small
  // starter set, see file header)
  ['Raita', 'accompaniments', ['pure-veg'], null],
  ['Papad', 'accompaniments', ['pure-veg'], null],
  ['Green Salad', 'accompaniments', ['pure-veg'], null],
  ['Pickle', 'accompaniments', ['pure-veg'], null],
  ['Curd', 'accompaniments', ['pure-veg'], null],

  // Kids Menu
  ['Mini Pizza', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Smileys', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Cheese Balls', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Burgers', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Kids Pasta', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Maggi / Noodles', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Corn Cups', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Kids Sandwiches', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Popcorn', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Cotton Candy', 'kids-menu', ['pure-veg', 'kids-special', 'desserts'], 'kids-party'],
  ['Kids Cupcakes', 'kids-menu', ['pure-veg', 'kids-special', 'desserts'], 'kids-party'],
  ['Donuts', 'kids-menu', ['pure-veg', 'kids-special', 'desserts'], 'kids-party'],
  ['Kids Ice Cream', 'kids-menu', ['pure-veg', 'kids-special', 'desserts'], 'kids-party'],
  ['Chocolate Fountain', 'kids-menu', ['pure-veg', 'kids-special', 'desserts'], 'kids-party'],
  ['Mini Chicken Burgers', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Chicken Nuggets', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Chicken Popcorn', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Chicken Pizza', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Chicken Sandwich', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Chicken Pasta', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Kids Fish Fingers', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],

  // Live Counters
  ['Chaat Counter', 'live-counters', ['pure-veg', 'live-counters'], 'street-food'],
  ['Live Dosa Counter', 'live-counters', ['pure-veg', 'live-counters'], 'south-indian'],
  ['Pasta Live Counter', 'live-counters', ['pure-veg', 'live-counters'], 'italian'],
  ['Pani Puri Counter', 'live-counters', ['pure-veg', 'live-counters'], 'street-food'],
  ['Live Ice Cream Counter', 'live-counters', ['pure-veg', 'live-counters', 'desserts'], null],
  ['Live Tandoor / Kebab Counter', 'live-counters', ['non-veg', 'live-counters'], 'north-indian'],

  // Desserts
  ['Gulab Jamun', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Rasmalai', 'desserts', ['pure-veg', 'desserts'], 'bengali'],
  ['Jalebi', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Rabri', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Gajar Halwa', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Moong Dal Halwa', 'desserts', ['pure-veg', 'desserts'], 'rajasthani'],
  ['Ice Cream', 'desserts', ['pure-veg', 'desserts'], null],
  ['Kulfi', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Brownie', 'desserts', ['pure-veg', 'desserts'], 'bakery-desserts'],
  ['Pastries', 'desserts', ['pure-veg', 'desserts'], 'bakery-desserts'],
  ['Cupcakes', 'desserts', ['pure-veg', 'desserts'], 'bakery-desserts'],
  ['Fruit Custard', 'desserts', ['pure-veg', 'desserts'], null],
  ['Kheer', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],
  ['Phirni', 'desserts', ['pure-veg', 'desserts'], 'north-indian'],

  // Tea / Coffee
  ['Masala Chai', 'tea-coffee', ['pure-veg', 'beverages'], null],
  ['Filter Coffee', 'tea-coffee', ['pure-veg', 'beverages'], 'south-indian'],
  ['Black Coffee', 'tea-coffee', ['pure-veg', 'beverages'], null],
  ['Green Tea', 'tea-coffee', ['pure-veg', 'beverages'], null],

  // Packaged Items (Anish named this category with no dishes — small
  // starter set, see file header)
  ['Mineral Water Bottles', 'packaged-items', ['pure-veg', 'beverages'], null],
  ['Soft Drink Cans', 'packaged-items', ['pure-veg', 'beverages'], null],
  ['Packaged Juices', 'packaged-items', ['pure-veg', 'beverages'], null],
  ['Biscuit Packets', 'packaged-items', ['pure-veg'], null],
  ['Namkeen Packets', 'packaged-items', ['pure-veg'], null],
];

export const DISH_CATALOG = RAW_DISHES.map(([name, category, foodTypes, cuisine]) => ({ name, category, foodTypes, cuisine }));

// Only the two event types this whole plan covers get the menu planner —
// same scoping precedent as lib/activityIdeas.js and lib/eventThemes.js.
const MENU_APPLICABLE_EVENT_TYPES = new Set(['kids-birthday', 'adult-birthday']);
export function isMenuLibraryApplicable(eventTypeSlug) {
  return MENU_APPLICABLE_EVENT_TYPES.has(eventTypeSlug);
}

export function getDishesForCategory(categorySlug, { foodTypes = [], cuisines = [] } = {}) {
  return DISH_CATALOG.filter(d => {
    if (d.category !== categorySlug) return false;
    if (foodTypes.length > 0 && !d.foodTypes.some(ft => foodTypes.includes(ft))) return false;
    if (cuisines.length > 0 && !(d.cuisine && cuisines.includes(d.cuisine))) return false;
    return true;
  });
}
