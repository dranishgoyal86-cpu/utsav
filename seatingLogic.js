// Pure bin-packing logic for seating assignment — no RN/Supabase imports, so
// this runs and unit-tests outside the app just like planLogic.js/
// vendorTaxonomy.js. Groups guests by their existing `tag` (Family/Friends/
// etc. — the free-text field already on event_invitees) and packs each
// group onto consecutive tables by weight (seats a guest actually needs —
// see partySize() below), so a group bigger than one table's capacity
// spills onto more tables of its own kind rather than mixing with another
// group just to fill a table exactly. Only ever called on currently-
// unassigned guests, so re-running it never disturbs a table the host
// already set by hand.

// Deliberately duplicated from helpers.js's resolveGuestPartySize() rather
// than imported — helpers.js pulls in react-native/expo-file-system/
// supabase, which would break this file's one hard rule (zero RN/Supabase
// imports, so it runs standalone outside the app). Keep this in sync with
// resolveGuestPartySize() by hand if the party-size rule ever changes.
function partySize(guest) {
  return guest.entry_type === 'household'
    ? (guest.household_size || 1)
    : 1 + (guest.plus_ones || 0);
}
export function autoAssignTables(unassignedGuests, existingMaxTable = 0, seatsPerTable = 8) {
  const groups = {};
  unassignedGuests.forEach(g => {
    const key = g.tag || 'Ungrouped';
    (groups[key] = groups[key] || []).push(g);
  });

  let table = existingMaxTable + 1;
  const updates = [];

  Object.values(groups).forEach(groupGuests => {
    let bucket = [];
    let weight = 0;
    const flush = () => {
      if (bucket.length === 0) return;
      bucket.forEach(g => updates.push({ id: g.id, table_number: table }));
      table += 1;
      bucket = [];
      weight = 0;
    };
    groupGuests.forEach(g => {
      const w = partySize(g);
      if (weight + w > seatsPerTable && bucket.length > 0) flush();
      bucket.push(g);
      weight += w;
    });
    flush();
  });

  return updates;
}
