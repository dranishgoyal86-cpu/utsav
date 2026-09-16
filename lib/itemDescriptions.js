// "add description also below features which are not self explanatory —
// with more details tab" (Anish, Sept 16). This is a first DRAFT written
// by Claude for Anish to review/edit — every line here is guessable
// content, not verified vendor/industry copy, so treat it as a starting
// point, not final.
//
// Deliberately a plain lookup by item_name rather than a new DB column:
// event_requirements is a live Supabase table (see
// supabase/migrations/event_requirements.sql), and item_name strings are
// shared across every event type that uses them ("Photographer" means the
// same thing everywhere) — a static file keyed by that same string is the
// simplest thing that works, easy for Anish to add to later without a
// migration, and it naturally only shows "More details" on items listed
// here (EventScope.js's ScopeItemRow checks ITEM_DESCRIPTIONS[item_name]
// and renders nothing at all when there's no entry) — so genuinely
// self-explanatory items (Cake, DJ, Photographer...) are left out on
// purpose rather than padded with filler text.
//
// Keys are the exact item_name values from event_requirements — keep them
// byte-for-byte identical to what's in that table, or the lookup silently
// misses.
export const ITEM_DESCRIPTIONS = {
  'Anchor': 'A stage host/compère who keeps the event moving — announcing rituals, cueing performances, and filling the gaps between them so nothing feels awkward or rushed.',
  'Emcee': 'Same role as an anchor — the person on the mic guiding the event from one moment to the next.',
  'Baraat transport': "The groom's ceremonial arrival — usually a decorated horse, car, or even an elephant, with a band or dhol leading the procession to the venue.",
  'Bhajan mandali': 'A devotional singing group, typically for pre-wedding or religious functions like a griha pravesh or a Satyanarayan puja.',
  'Prasad caterer': 'A caterer who specializes in preparing and serving prasad (blessed food) for religious ceremonies, following the specific hygiene and ritual norms these require.',
  'Ritual supplies': 'The physical items a priest needs to perform the ceremony — items like kalash, coconuts, flowers, thread, and havan samagri — arranged as a kit rather than sourced piecemeal.',
  'Mandap decor': 'The decorated structure/canopy the wedding ceremony itself happens under — usually the single most photographed setup at the event.',
  'Haldi decor': 'Yellow/marigold-themed decor for the Haldi ceremony — often includes floral backdrops, seating, and props for the turmeric ritual itself.',
  'Barricading': 'Crowd-control barriers for entry points, stages, or parking areas — mainly needed for larger events where managing guest flow and security matters.',
  'RFID badges': 'Wristbands or cards with a chip inside, used to scan guests in and out, track access to different areas, or link to a cashless payment system — common at large corporate or ticketed events.',
  'Registration desk': 'The check-in point where guests sign in, collect their badge or kit, and get directed onward — standard for corporate events and conferences.',
  'Exhibition booths': 'Standalone display stalls (for sponsors, vendors, or brands) set up around the venue, usually for corporate events, expos, or trade shows.',
  'Booth builder': 'The team that physically designs and constructs custom exhibition or brand booths, rather than using off-the-shelf stall setups.',
  'Interactive displays': 'Touchscreen or motion-activated stations — quizzes, product demos, photo experiences — used to keep guests engaged at corporate or brand events.',
  'Interactive screens': 'Large touch-enabled screens used for guest engagement, live polls, or product showcases.',
  '360 booth': 'A rotating camera platform guests stand on to get a slow-motion, 360-degree video of themselves — a popular modern photo-booth alternative.',
  'LED dance floor': 'A dance floor with built-in LED panels that light up in sync with music — a visual upgrade over a plain dance floor, usually for sangeet/reception nights.',
  'LED wall': 'A large digital video wall (instead of a projector screen) used as a backdrop for the stage — sharper and brighter, common at bigger weddings and corporate events.',
  'LED screens': 'Digital display screens placed around the venue for live event coverage, sponsor branding, or slideshows.',
  'LED stage': 'A stage with LED panelling built into its structure (steps, backdrop, or flooring) for a more dramatic lighting effect than standard stage lighting.',
  'AV equipment': 'The audio-visual setup behind the scenes — projectors, screens, mixers, and cabling — needed to run presentations, videos, or live streams smoothly.',
  'Sound and AV': 'Combined audio and visual equipment and technical support for the event — microphones, speakers, screens, and the crew running them.',
  'Live streaming': "Broadcasting the event live online for guests who can't attend in person — common for weddings with family abroad, or for corporate events.",
  'Simultaneous translation': 'Real-time spoken translation (usually via headsets) for guests who speak a different language — mainly relevant for large corporate or multi-national events.',
  'Translator': 'A person who translates speeches or conversations live for guests, without the headset-based simultaneous setup.',
  'AI networking': 'A tech-driven matchmaking tool at corporate/networking events that suggests which attendees should meet based on shared interests or goals.',
  'Timing and scoring': 'Equipment and staff to track results and times — relevant for sports-themed events, runs, or competitive games at the event.',
  'VR zone': 'A virtual-reality gaming or experience corner — popular as a novelty entertainment zone at bigger birthday or corporate events.',
  'Gaming van': 'A mobile van fitted out with gaming consoles/screens that parks at the venue — a ready-made gaming zone with no separate setup needed.',
  'Live cartoon artist': "An artist who draws quick, live caricature-style portraits of guests as a keepsake and activity — different from a magician or regular photographer.",
  'Puppet show': "A staged puppet performance — typically for kids' events, either a hired troupe or a simpler tabletop setup.",
  'Bubble show': 'A performer creating giant bubble effects and bubble-based tricks as a kids’ entertainment act.',
  'Science show': 'A hands-on science demonstration act (experiments, reactions, illusions) aimed at kids as party entertainment.',
  'Mascot character': "A person in a full costume (a cartoon character, animal, or brand mascot) who interacts with guests — common at kids' birthdays.",
  'PR agency': 'A team that manages media coverage, press invites, and public messaging around the event — relevant mainly for larger celebrity or corporate events.',
  'Celebrity networking': 'Structured opportunities (meet-and-greet slots, photo sessions) for guests to interact with any celebrity guest at the event.',
  'Hospitality team': 'Dedicated staff whose job is greeting, guiding, and looking after guests through the event — separate from catering or security staff.',
  'VIP hospitality': 'A dedicated, elevated level of guest service (special seating, personal attendants, priority everything) reserved for VIP guests specifically.',
  'Wedding website': "A personal website for the couple with event details, RSVP, travel/stay info, and photos — a modern alternative to sending everything over text.",
  'Digital invitation': 'A shareable online/WhatsApp invite (image, video, or web link) instead of, or alongside, a physical printed card.',
  'Rain cover / weather tent': 'A waterproof canopy or tent kept on standby to protect an outdoor event from unexpected rain.',
  'Weather backup': "A pre-arranged indoor or covered alternative space in case the weather doesn't cooperate on an outdoor event day.",
  'Extra cooling': 'Additional air coolers, misting fans, or AC units brought in for outdoor or tented events in hot weather, beyond the venue’s standard cooling.',
  'Power backup': 'A generator or backup power supply kept on standby so the event isn’t affected by a power cut.',
  'Wi-Fi': 'Temporary internet setup at the venue — useful for corporate events, live streaming, or vendors who need connectivity on-site.',
  'Event app': "A dedicated mobile app for the event — schedules, maps, networking, or live updates — mainly used for larger conferences or corporate events.",
  'Ticketing': 'The system used to sell, issue, and scan tickets for a paid or registration-based event.',
  'Branding': "Custom event branding — logos, banners, signage, and thematic design elements — carrying a couple's or company's chosen look across the venue.",
  'Luxury entry': "A grand, elaborately staged entrance moment for the couple or guest of honour — think themed walkways, special effects, or a dramatic reveal.",
};
