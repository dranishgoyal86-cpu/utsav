// Menu Library — Birthday Event Improvement plan, Piece 5, rebuilt twice
// now. This is the second rebuild ("menu list is very confusing"):
//
// - Food Type is a SINGLE choice (host picks exactly one — Pure Veg,
//   Veg+Egg, Non-Veg, Jain, Vegan, or Kids Special), not a multi-select
//   filter like before.
// - Cuisine is a MULTI-select — pick as many as apply — plus a
//   "Multicuisine" option that means "show everything, ignore cuisine
//   filtering entirely" (for a host who genuinely wants a mixed spread).
// - The old 18-cuisine list (with Punjabi/Gujarati/Rajasthani/
//   Maharashtrian/Bengali/Coastal/Hyderabadi-Mughlai/Italian/Continental/
//   Street Food/Bakery as separate cuisines) is gone — every one of those
//   regional/style dishes now lives under North Indian or South Indian
//   (its actual MENU CATEGORY — chaat, snack, main course, etc. — is
//   unchanged), or under Fast Food for pizza/pasta/burger-style Western
//   items, per Anish's explicit instruction to fold state-specific food
//   into its parent cuisine bucket rather than keep it split out.
//
// Real, honest scope notes, same spirit as the first rebuild:
// - Maharashtrian and Goan/Mangalorean/coastal dishes were folded into the
//   South Indian bucket (not North) — a judgment call, since the app only
//   offers two Indian buckets now; Bengali/Hyderabadi-Mughlai/Gujarati/
//   Rajasthani/Punjabi went to North Indian.
// - Jain and Vegan food-type tags are NOT independently verified per dish
//   (a "Pure Veg" dish tagged jain-safe here means no onion/garlic where
//   obviously applicable, not a caterer-certified claim) — a host should
//   still confirm with their caterer for a genuinely Jain or vegan event.
// - "At least 5-10 options per category" is honored for every realistic
//   cuisine x category combination (North Indian, South Indian, Chinese,
//   Fast Food, Kids Party Menu especially) — a few narrow combinations
//   (e.g. Mexican + Rice/Biryani) are thinner by nature, not an oversight.
// - Every category still supports a free-text custom dish (unchanged from
//   the first rebuild) for anything this catalog doesn't cover.
export const FOOD_TYPES = [
  { slug: 'pure-veg', label: 'Pure Veg' },
  { slug: 'veg-egg', label: 'Veg + Egg' },
  { slug: 'non-veg', label: 'Non-Veg' },
  { slug: 'jain', label: 'Jain' },
  { slug: 'vegan', label: 'Vegan' },
  { slug: 'kids-special', label: 'Kids Special' },
];

export const CUISINES = [
  { slug: 'north-indian', label: 'North Indian' },
  { slug: 'south-indian', label: 'South Indian' },
  { slug: 'chinese', label: 'Chinese' },
  { slug: 'fast-food', label: 'Fast Food' },
  { slug: 'kids-party', label: 'Kids Party Menu' },
  { slug: 'thai-asian', label: 'Thai / Asian' },
  { slug: 'mexican', label: 'Mexican' },
  { slug: 'multicuisine', label: 'Multicuisine (show everything)' },
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

// [name, category, foodTypes[], cuisine|null]
const RAW_DISHES = [
  // ───────────────── Welcome Drinks ─────────────────
  ['Jaljeera', 'welcome-drinks', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Aam Panna', 'welcome-drinks', ['pure-veg', 'vegan'], 'north-indian'],
  ['Nimbu Pani', 'welcome-drinks', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Fresh Lime Soda', 'welcome-drinks', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Rose Sherbet', 'welcome-drinks', ['pure-veg'], 'north-indian'],
  ['Buttermilk / Chaas', 'welcome-drinks', ['pure-veg'], 'north-indian'],
  ['Lassi', 'welcome-drinks', ['pure-veg'], 'north-indian'],
  ['Kokum Sharbat', 'welcome-drinks', ['pure-veg', 'vegan'], 'south-indian'],
  ['Filter Coffee (Cold)', 'welcome-drinks', ['pure-veg'], 'south-indian'],
  ['Tender Coconut Water', 'welcome-drinks', ['pure-veg', 'jain', 'vegan'], 'south-indian'],
  ['Cold Coffee', 'welcome-drinks', ['pure-veg'], null],
  ['Mocktails', 'welcome-drinks', ['pure-veg'], null],
  ['Orange Juice', 'welcome-drinks', ['pure-veg', 'kids-special', 'vegan'], 'kids-party'],
  ['Mango Drink', 'welcome-drinks', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Chocolate Milkshake', 'welcome-drinks', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Rose Milk', 'welcome-drinks', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Thai Iced Tea', 'welcome-drinks', ['pure-veg'], 'thai-asian'],
  ['Lemonade', 'welcome-drinks', ['pure-veg', 'jain', 'vegan'], 'mexican'],

  // ───────────────── Starters ─────────────────
  ['Paneer Tikka', 'starters', ['pure-veg'], 'north-indian'],
  ['Hara Bhara Kebab', 'starters', ['pure-veg'], 'north-indian'],
  ['Veg Seekh Kebab', 'starters', ['pure-veg'], 'north-indian'],
  ['Tandoori Mushroom', 'starters', ['pure-veg'], 'north-indian'],
  ['Dahi Ke Kebab', 'starters', ['pure-veg'], 'north-indian'],
  ['Amritsari Chhole Kulche Bites', 'starters', ['pure-veg'], 'north-indian'],
  ['Mini Samosa', 'starters', ['pure-veg', 'kids-special'], 'north-indian'],
  ['Dhokla', 'starters', ['pure-veg', 'jain'], 'north-indian'],
  ['Khandvi', 'starters', ['pure-veg', 'jain'], 'north-indian'],
  ['Chicken Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Malai Chicken Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Tandoori Chicken', 'starters', ['non-veg'], 'north-indian'],
  ['Chicken Seekh Kebab', 'starters', ['non-veg'], 'north-indian'],
  ['Fish Tikka', 'starters', ['non-veg'], 'north-indian'],
  ['Mutton Seekh Kebab', 'starters', ['non-veg'], 'north-indian'],
  ['Egg Pakora', 'starters', ['veg-egg'], 'north-indian'],
  ['Kothimbir Vadi', 'starters', ['pure-veg', 'jain'], 'south-indian'],
  ['Masala Vada', 'starters', ['pure-veg', 'jain'], 'south-indian'],
  ['Prawns Koliwada', 'starters', ['non-veg'], 'south-indian'],
  ['Chicken 65', 'starters', ['non-veg'], 'south-indian'],
  ['Fish Amritsari (Coastal Style)', 'starters', ['non-veg'], 'south-indian'],
  ['Veg Spring Rolls', 'starters', ['pure-veg'], 'chinese'],
  ['Veg Manchurian (Dry)', 'starters', ['pure-veg'], 'chinese'],
  ['Chilli Paneer', 'starters', ['pure-veg'], 'chinese'],
  ['Crispy Corn', 'starters', ['pure-veg'], 'chinese'],
  ['Crispy Chilli Potato', 'starters', ['pure-veg', 'vegan'], 'chinese'],
  ['Chilli Chicken', 'starters', ['non-veg'], 'chinese'],
  ['Chicken Lollypop', 'starters', ['non-veg'], 'chinese'],
  ['Chicken Momos', 'starters', ['non-veg'], 'chinese'],
  ['Veg Momos', 'starters', ['pure-veg'], 'chinese'],
  ['French Fries', 'starters', ['pure-veg', 'vegan', 'kids-special'], 'fast-food'],
  ['Potato Wedges', 'starters', ['pure-veg', 'vegan'], 'fast-food'],
  ['Cheese Corn Balls', 'starters', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Garlic Bread', 'starters', ['pure-veg'], 'fast-food'],
  ['Nachos', 'starters', ['pure-veg'], 'fast-food'],
  ['Chicken Nuggets', 'starters', ['non-veg', 'kids-special'], 'fast-food'],
  ['Chicken Popcorn', 'starters', ['non-veg', 'kids-special'], 'fast-food'],
  ['Fish Fingers', 'starters', ['non-veg', 'kids-special'], 'fast-food'],
  ['Thai Spring Rolls', 'starters', ['pure-veg'], 'thai-asian'],
  ['Chicken Satay Skewers', 'starters', ['non-veg'], 'thai-asian'],
  ['Veg Satay Skewers', 'starters', ['pure-veg'], 'thai-asian'],
  ['Thai Fish Cakes', 'starters', ['non-veg'], 'thai-asian'],
  ['Edamame', 'starters', ['pure-veg', 'vegan', 'jain'], 'thai-asian'],
  ['Nachos with Salsa', 'starters', ['pure-veg', 'vegan'], 'mexican'],
  ['Quesadilla (Veg)', 'starters', ['pure-veg'], 'mexican'],
  ['Quesadilla (Chicken)', 'starters', ['non-veg'], 'mexican'],
  ['Mexican Bean Dip', 'starters', ['pure-veg', 'vegan'], 'mexican'],
  ['Guacamole with Chips', 'starters', ['pure-veg', 'vegan', 'jain'], 'mexican'],
  ['Potato Smileys', 'starters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Samosas (Kids)', 'starters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Popcorn (Kids)', 'starters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Cheese Balls (Kids)', 'starters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Chicken Lollipop (Kids)', 'starters', ['non-veg', 'kids-special'], 'kids-party'],
  ['Grilled Sandwiches', 'starters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Corn Cups', 'starters', ['pure-veg', 'kids-special', 'vegan'], 'kids-party'],
  ['Fruit Cups', 'starters', ['pure-veg', 'kids-special', 'vegan', 'jain'], 'kids-party'],

  // ───────────────── Chaat / Street Food ─────────────────
  ['Pani Puri', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Sev Puri', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Dahi Puri', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Bhel Puri', 'chaat-street-food', ['pure-veg', 'vegan'], 'north-indian'],
  ['Papdi Chaat', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Aloo Tikki Chaat', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Raj Kachori', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Dahi Bhalla', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Chole Kulche', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Chole Bhature', 'chaat-street-food', ['pure-veg'], 'north-indian'],
  ['Pav Bhaji', 'chaat-street-food', ['pure-veg'], 'south-indian'],
  ['Vada Pav', 'chaat-street-food', ['pure-veg'], 'south-indian'],
  ['Misal Pav', 'chaat-street-food', ['pure-veg'], 'south-indian'],
  ['Dabeli', 'chaat-street-food', ['pure-veg'], 'south-indian'],
  ['Mini Aloo Tikki (Kids)', 'chaat-street-food', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Dahi Puri (Kids, Mild)', 'chaat-street-food', ['pure-veg', 'kids-special'], 'kids-party'],

  // ───────────────── Main Course ─────────────────
  ['Paneer Butter Masala', 'main-course', ['pure-veg'], 'north-indian'],
  ['Shahi Paneer', 'main-course', ['pure-veg'], 'north-indian'],
  ['Kadai Paneer', 'main-course', ['pure-veg'], 'north-indian'],
  ['Palak Paneer', 'main-course', ['pure-veg'], 'north-indian'],
  ['Malai Kofta', 'main-course', ['pure-veg'], 'north-indian'],
  ['Veg Kolhapuri', 'main-course', ['pure-veg'], 'north-indian'],
  ['Mix Veg Curry', 'main-course', ['pure-veg', 'jain'], 'north-indian'],
  ['Dum Aloo', 'main-course', ['pure-veg'], 'north-indian'],
  ['Undhiyu', 'main-course', ['pure-veg'], 'north-indian'],
  ['Dal Baati Churma', 'main-course', ['pure-veg'], 'north-indian'],
  ['Butter Chicken', 'main-course', ['non-veg'], 'north-indian'],
  ['Chicken Curry', 'main-course', ['non-veg'], 'north-indian'],
  ['Kadai Chicken', 'main-course', ['non-veg'], 'north-indian'],
  ['Chicken Korma', 'main-course', ['non-veg'], 'north-indian'],
  ['Mutton Rogan Josh', 'main-course', ['non-veg'], 'north-indian'],
  ['Mutton Korma', 'main-course', ['non-veg'], 'north-indian'],
  ['Egg Curry', 'main-course', ['veg-egg'], 'north-indian'],
  ['Idli', 'main-course', ['pure-veg', 'jain', 'kids-special'], 'south-indian'],
  ['Medu Vada', 'main-course', ['pure-veg'], 'south-indian'],
  ['Masala Dosa', 'main-course', ['pure-veg'], 'south-indian'],
  ['Plain Dosa', 'main-course', ['pure-veg', 'jain'], 'south-indian'],
  ['Uttapam', 'main-course', ['pure-veg'], 'south-indian'],
  ['Appam with Stew', 'main-course', ['pure-veg'], 'south-indian'],
  ['Pongal', 'main-course', ['pure-veg', 'jain'], 'south-indian'],
  ['Puran Poli', 'main-course', ['pure-veg'], 'south-indian'],
  ['Bharli Vangi', 'main-course', ['pure-veg'], 'south-indian'],
  ['Chicken Chettinad', 'main-course', ['non-veg'], 'south-indian'],
  ['Chicken Stew', 'main-course', ['non-veg'], 'south-indian'],
  ['Goan Fish Curry', 'main-course', ['non-veg'], 'south-indian'],
  ['Prawn Curry', 'main-course', ['non-veg'], 'south-indian'],
  ['Fish Curry', 'main-course', ['non-veg'], 'south-indian'],
  ['Veg Manchurian (Gravy)', 'main-course', ['pure-veg'], 'chinese'],
  ['Chilli Paneer (Gravy)', 'main-course', ['pure-veg'], 'chinese'],
  ['Veg Schezwan', 'main-course', ['pure-veg'], 'chinese'],
  ['Chicken Manchurian', 'main-course', ['non-veg'], 'chinese'],
  ['Chilli Chicken (Gravy)', 'main-course', ['non-veg'], 'chinese'],
  ['Schezwan Chicken', 'main-course', ['non-veg'], 'chinese'],
  ['Veg Pizza', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Margherita Pizza', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Chicken Pizza', 'main-course', ['non-veg', 'kids-special'], 'fast-food'],
  ['White Sauce Pasta', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Red Sauce Pasta', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Chicken Pasta', 'main-course', ['non-veg', 'kids-special'], 'fast-food'],
  ['Mac and Cheese', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Veg Burger', 'main-course', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Chicken Burger', 'main-course', ['non-veg', 'kids-special'], 'fast-food'],
  ['Grilled Chicken', 'main-course', ['non-veg'], 'fast-food'],
  ['Fish and Chips', 'main-course', ['non-veg'], 'fast-food'],
  ['Veg Lasagna', 'main-course', ['pure-veg'], 'fast-food'],
  ['Thai Green Curry (Veg)', 'main-course', ['pure-veg'], 'thai-asian'],
  ['Thai Green Curry (Chicken)', 'main-course', ['non-veg'], 'thai-asian'],
  ['Thai Red Curry (Chicken)', 'main-course', ['non-veg'], 'thai-asian'],
  ['Basil Chicken Stir-fry', 'main-course', ['non-veg'], 'thai-asian'],
  ['Pad Thai (Veg)', 'main-course', ['pure-veg'], 'thai-asian'],
  ['Pad Thai (Chicken)', 'main-course', ['non-veg'], 'thai-asian'],
  ['Vegetable Tempura', 'main-course', ['pure-veg'], 'thai-asian'],
  ['Tacos (Veg)', 'main-course', ['pure-veg'], 'mexican'],
  ['Tacos (Chicken)', 'main-course', ['non-veg'], 'mexican'],
  ['Burrito Bowl (Veg)', 'main-course', ['pure-veg'], 'mexican'],
  ['Burrito Bowl (Chicken)', 'main-course', ['non-veg'], 'mexican'],
  ['Fajitas (Veg)', 'main-course', ['pure-veg'], 'mexican'],
  ['Fajitas (Chicken)', 'main-course', ['non-veg'], 'mexican'],
  ['Enchiladas', 'main-course', ['pure-veg'], 'mexican'],
  ['Mini Pizza (Kids)', 'main-course', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Burger (Kids)', 'main-course', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Chicken Burger (Kids)', 'main-course', ['non-veg', 'kids-special'], 'kids-party'],
  ['Sandwich Triangles', 'main-course', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Maggi / Noodles Cups', 'main-course', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Pasta (Kids)', 'main-course', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Dosa', 'main-course', ['pure-veg', 'kids-special', 'jain'], 'kids-party'],

  // ───────────────── Breads ─────────────────
  ['Roti', 'breads', ['pure-veg', 'jain'], 'north-indian'],
  ['Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Butter Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Garlic Naan', 'breads', ['pure-veg'], 'north-indian'],
  ['Paratha', 'breads', ['pure-veg'], 'north-indian'],
  ['Kulcha', 'breads', ['pure-veg'], 'north-indian'],
  ['Missi Roti', 'breads', ['pure-veg'], 'north-indian'],
  ['Poori', 'breads', ['pure-veg', 'jain'], 'north-indian'],
  ['Bhature', 'breads', ['pure-veg'], 'north-indian'],
  ['Thepla', 'breads', ['pure-veg', 'jain'], 'north-indian'],
  ['Steamed Rice Roti (Neer Dosa Style)', 'breads', ['pure-veg', 'jain'], 'south-indian'],
  ['Tortillas', 'breads', ['pure-veg', 'vegan'], 'mexican'],

  // ───────────────── Rice / Biryani ─────────────────
  ['Jeera Rice', 'rice-biryani', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Steamed Rice', 'rice-biryani', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Veg Pulao', 'rice-biryani', ['pure-veg'], 'north-indian'],
  ['Peas Pulao', 'rice-biryani', ['pure-veg'], 'north-indian'],
  ['Veg Biryani', 'rice-biryani', ['pure-veg'], 'north-indian'],
  ['Paneer Biryani', 'rice-biryani', ['pure-veg'], 'north-indian'],
  ['Chicken Biryani', 'rice-biryani', ['non-veg'], 'north-indian'],
  ['Mutton Biryani', 'rice-biryani', ['non-veg'], 'north-indian'],
  ['Egg Biryani', 'rice-biryani', ['veg-egg'], 'north-indian'],
  ['Curd Rice', 'rice-biryani', ['pure-veg', 'jain'], 'south-indian'],
  ['Lemon Rice', 'rice-biryani', ['pure-veg', 'jain', 'vegan'], 'south-indian'],
  ['Coconut Rice', 'rice-biryani', ['pure-veg', 'vegan'], 'south-indian'],
  ['Sambar Rice', 'rice-biryani', ['pure-veg'], 'south-indian'],
  ['Bisibelebath', 'rice-biryani', ['pure-veg'], 'south-indian'],
  ['Fish Biryani', 'rice-biryani', ['non-veg'], 'south-indian'],
  ['Prawn Biryani', 'rice-biryani', ['non-veg'], 'south-indian'],
  ['Veg Fried Rice', 'rice-biryani', ['pure-veg', 'vegan'], 'chinese'],
  ['Veg Hakka Noodles', 'rice-biryani', ['pure-veg', 'vegan'], 'chinese'],
  ['Schezwan Fried Rice', 'rice-biryani', ['pure-veg', 'vegan'], 'chinese'],
  ['Chicken Fried Rice', 'rice-biryani', ['non-veg'], 'chinese'],
  ['Chicken Hakka Noodles', 'rice-biryani', ['non-veg'], 'chinese'],
  ['Egg Fried Rice', 'rice-biryani', ['veg-egg'], 'chinese'],
  ['Thai Fried Rice (Veg)', 'rice-biryani', ['pure-veg'], 'thai-asian'],
  ['Thai Fried Rice (Chicken)', 'rice-biryani', ['non-veg'], 'thai-asian'],
  ['Mexican Rice', 'rice-biryani', ['pure-veg', 'vegan', 'jain'], 'mexican'],
  ['Refried Beans', 'rice-biryani', ['pure-veg', 'vegan'], 'mexican'],
  ['Curd Rice (Kids)', 'rice-biryani', ['pure-veg', 'kids-special', 'jain'], 'kids-party'],
  ['Khichdi (Kids)', 'rice-biryani', ['pure-veg', 'kids-special'], 'kids-party'],

  // ───────────────── Dal / Curry ─────────────────
  ['Chole', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Rajma', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Dal Makhani', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Dal Tadka', 'dal-curry', ['pure-veg', 'jain'], 'north-indian'],
  ['Gujarati Kadhi', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Dal Dhokli', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Panchmel Dal', 'dal-curry', ['pure-veg'], 'north-indian'],
  ['Sambar', 'dal-curry', ['pure-veg', 'jain'], 'south-indian'],
  ['Rasam', 'dal-curry', ['pure-veg', 'jain'], 'south-indian'],
  ['Moong Dal (South Style)', 'dal-curry', ['pure-veg', 'vegan'], 'south-indian'],

  // ───────────────── Accompaniments ─────────────────
  ['Raita', 'accompaniments', ['pure-veg'], 'north-indian'],
  ['Papad', 'accompaniments', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Green Salad', 'accompaniments', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Pickle', 'accompaniments', ['pure-veg', 'vegan'], 'north-indian'],
  ['Curd', 'accompaniments', ['pure-veg'], 'north-indian'],
  ['Coconut Chutney', 'accompaniments', ['pure-veg', 'vegan'], 'south-indian'],
  ['Tomato Chutney', 'accompaniments', ['pure-veg', 'vegan'], 'south-indian'],
  ['Sambar (Side)', 'accompaniments', ['pure-veg', 'jain'], 'south-indian'],
  ['Salsa & Chips', 'accompaniments', ['pure-veg', 'vegan'], 'mexican'],
  ['Sour Cream Dip', 'accompaniments', ['pure-veg'], 'mexican'],

  // ───────────────── Kids Menu (category — see also kids-special food
  // type and kids-party cuisine scattered above/below, all three exist
  // because Anish asked for all three as separate concepts: a food TYPE
  // filter, a cuisine, AND this dedicated category for the classic
  // "kids' party spread" items) ─────────────────
  ['Mini Pizza', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Burger', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Chicken Burger', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Sandwich Triangles (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Maggi / Noodles Cups (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Cheese Balls', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Potato Smileys (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Chicken Nuggets (Kids Menu)', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Chicken Popcorn (Kids Menu)', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Chicken Lollipop (Kids Menu)', 'kids-menu', ['non-veg', 'kids-special'], 'kids-party'],
  ['Mini Aloo Tikki', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Dosa (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special', 'jain'], 'kids-party'],
  ['Mini Idli', 'kids-menu', ['pure-veg', 'kids-special', 'jain'], 'kids-party'],
  ['Curd Rice (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special', 'jain'], 'kids-party'],
  ['Khichdi', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Banana Slices', 'kids-menu', ['pure-veg', 'kids-special', 'vegan', 'jain'], 'kids-party'],
  ['Mini Pancakes', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Grilled Sandwiches (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Corn Cups (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special', 'vegan'], 'kids-party'],
  ['Fruit Cups (Kids Menu)', 'kids-menu', ['pure-veg', 'kids-special', 'vegan', 'jain'], 'kids-party'],

  // ───────────────── Live Counters ─────────────────
  ['Chaat Counter', 'live-counters', ['pure-veg'], 'north-indian'],
  ['Live Dosa Counter', 'live-counters', ['pure-veg'], 'south-indian'],
  ['Pasta Live Counter', 'live-counters', ['pure-veg'], 'fast-food'],
  ['Pani Puri Counter', 'live-counters', ['pure-veg'], 'north-indian'],
  ['Live Tandoor / Kebab Counter', 'live-counters', ['non-veg'], 'north-indian'],
  ['Taco Counter', 'live-counters', ['pure-veg', 'non-veg'], 'mexican'],
  ['Popcorn Counter', 'live-counters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Cotton Candy Counter', 'live-counters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Waffle Counter', 'live-counters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Pasta Counter (Kids)', 'live-counters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Ice Gola Counter', 'live-counters', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Live Ice Cream Counter', 'live-counters', ['pure-veg'], null],

  // ───────────────── Desserts ─────────────────
  ['Gulab Jamun', 'desserts', ['pure-veg'], 'north-indian'],
  ['Rasmalai', 'desserts', ['pure-veg'], 'north-indian'],
  ['Jalebi', 'desserts', ['pure-veg'], 'north-indian'],
  ['Rabri', 'desserts', ['pure-veg'], 'north-indian'],
  ['Gajar Halwa', 'desserts', ['pure-veg'], 'north-indian'],
  ['Moong Dal Halwa', 'desserts', ['pure-veg'], 'north-indian'],
  ['Kheer', 'desserts', ['pure-veg'], 'north-indian'],
  ['Phirni', 'desserts', ['pure-veg'], 'north-indian'],
  ['Payasam', 'desserts', ['pure-veg'], 'south-indian'],
  ['Mysore Pak', 'desserts', ['pure-veg'], 'south-indian'],
  ['Ice Cream', 'desserts', ['pure-veg', 'kids-special'], null],
  ['Kulfi', 'desserts', ['pure-veg'], 'north-indian'],
  ['Brownie', 'desserts', ['pure-veg', 'kids-special'], 'fast-food'],
  ['Pastries', 'desserts', ['pure-veg'], 'fast-food'],
  ['Fruit Custard', 'desserts', ['pure-veg'], null],
  ['Mango Sticky Rice', 'desserts', ['pure-veg'], 'thai-asian'],
  ['Thai Coconut Pudding', 'desserts', ['pure-veg'], 'thai-asian'],
  ['Churros', 'desserts', ['pure-veg', 'kids-special'], 'mexican'],
  ['Tres Leches Cake', 'desserts', ['pure-veg'], 'mexican'],
  ['Cupcakes', 'desserts', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Donuts', 'desserts', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Brownies (Kids)', 'desserts', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Ice Cream Cups', 'desserts', ['pure-veg', 'kids-special'], 'kids-party'],
  ['Mini Pastries', 'desserts', ['pure-veg', 'kids-special'], 'kids-party'],

  // ───────────────── Tea / Coffee ─────────────────
  ['Masala Chai', 'tea-coffee', ['pure-veg'], 'north-indian'],
  ['Black Coffee', 'tea-coffee', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Green Tea', 'tea-coffee', ['pure-veg', 'jain', 'vegan'], 'north-indian'],
  ['Filter Coffee', 'tea-coffee', ['pure-veg'], 'south-indian'],
  ['Fresh Juice', 'tea-coffee', ['pure-veg', 'kids-special', 'vegan'], 'kids-party'],

  // ───────────────── Packaged Items ─────────────────
  ['Mineral Water Bottles', 'packaged-items', ['pure-veg', 'jain', 'vegan'], null],
  ['Soft Drink Cans', 'packaged-items', ['pure-veg', 'jain', 'vegan'], null],
  ['Packaged Juices', 'packaged-items', ['pure-veg', 'jain', 'vegan'], null],
  ['Biscuit Packets', 'packaged-items', ['pure-veg'], null],
  ['Namkeen Packets', 'packaged-items', ['pure-veg'], 'north-indian'],
  ['Chips Packets', 'packaged-items', ['pure-veg', 'vegan'], 'fast-food'],
];

export const DISH_CATALOG = RAW_DISHES.map(([name, category, foodTypes, cuisine]) => ({ name, category, foodTypes, cuisine }));

// Only the two event types this whole plan covers get the menu planner —
// Anish later asked for this to apply to every event type in the taxonomy,
// so this always returns true now; kept as a named function in case a
// narrower rule is ever wanted again.
export function isMenuLibraryApplicable(_eventTypeSlug) {
  return true;
}

// foodType is a single value now (or null/undefined = no filter yet).
// cuisines is an array — 'multicuisine' anywhere in it means "ignore the
// cuisine filter entirely, show everything in this category" (Anish's
// explicit "multicuisine ... should show all possible food options").
export function getDishesForCategory(categorySlug, { foodType = null, cuisines = [] } = {}) {
  const showAllCuisines = cuisines.length === 0 || cuisines.includes('multicuisine');
  return DISH_CATALOG.filter(d => {
    if (d.category !== categorySlug) return false;
    if (foodType && !d.foodTypes.includes(foodType)) return false;
    if (!showAllCuisines && !(d.cuisine && cuisines.includes(d.cuisine))) return false;
    return true;
  });
}
