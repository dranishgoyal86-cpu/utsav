// Verifies hotelGuestListTemplate.js's pure functions against hand-written
// fixtures before they're trusted to generate a real list handed to a
// hotel/venue coordinator. Run with: node scripts/verifyHotelGuestListTemplate.js
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

const { buildHotelGuestListText, buildHotelGuestListPdfHtml } = loadEsmAsCjs(
  path.resolve(__dirname, '..', 'hotelGuestListTemplate.js')
);

let pass = 0, fail = 0;
function assert(label, cond) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
}

const fixture = {
  eventName: 'Riya & Arjun Wedding',
  eventDate: '15 December 2026',
  hostName: 'Anish Goyal',
  hostPhone: '9876543210',
  guests: [
    {
      name: 'Priya Sharma',
      phone: '9123456780',
      accommodationName: 'Taj Hotel — Block A',
      roomNumber: '204',
      arrivalDate: '2026-12-14',
      arrivalTime: '18:30',
      departureDate: '2026-12-16',
      departureTime: '10:00',
      govtIdLink: 'https://example.supabase.co/storage/v1/signed/priya-aadhaar.jpg?token=abc',
      accompanying: [
        { name: 'Rohan Sharma', govtIdLink: 'https://example.supabase.co/storage/v1/signed/rohan-aadhaar.jpg?token=def' },
      ],
    },
    {
      name: 'Vikram Mehta',
      phone: '9988776655',
      accommodationName: null,
      roomNumber: null,
      arrivalDate: null,
      arrivalTime: null,
      departureDate: null,
      departureTime: null,
      govtIdLink: null,
      accompanying: [],
    },
  ],
};

const text = buildHotelGuestListText(fixture);

assert('text includes event name', text.includes('Riya & Arjun Wedding'));
assert('text includes formatted phone for guest with a doc', text.includes('91234 56780'));
assert('text includes accommodation + room', text.includes('Taj Hotel — Block A') && text.includes('Room 204'));
assert('text includes accompanying guest name', text.includes('Rohan Sharma'));
assert('text includes accompanying guest signed link', text.includes('rohan-aadhaar.jpg'));
assert('text shows "Not uploaded yet" for guest with no doc', text.includes('Vikram Mehta') && /Vikram Mehta[\s\S]*?Not uploaded yet/.test(text));
assert('total count line counts guest + accompanying (3 total)', text.includes('Total guests (incl. accompanying): 3'));
assert('host line present', text.includes('Anish Goyal') && text.includes('98765 43210'));

const html = buildHotelGuestListPdfHtml(fixture);
assert('html includes event name', html.includes('Riya &amp; Arjun Wedding'));
assert('html includes "Uploaded" for guest with a doc', /Priya Sharma[\s\S]*?Uploaded/.test(html));
assert('html includes "Not uploaded yet" for guest with no doc', /Vikram Mehta[\s\S]*?Not uploaded yet/.test(html));
assert('html includes accompanying guest row', html.includes('+ Rohan Sharma'));
assert('html escapes ampersand in event name (XSS/HTML-injection safety)', !html.includes('Riya & Arjun') || html.includes('Riya &amp; Arjun'));

// Empty guest list — the "no outstation guests" case this feature exists
// to skip gracefully (GuestList.js's own requireOutstationGuests() guards
// against calling this at all when there are zero, but the template
// functions themselves shouldn't throw if ever called with an empty array).
const emptyText = buildHotelGuestListText({ ...fixture, guests: [] });
assert('empty guest list does not throw and shows zero total', emptyText.includes('Total guests (incl. accompanying): 0'));
const emptyHtml = buildHotelGuestListPdfHtml({ ...fixture, guests: [] });
assert('empty guest list PDF html does not throw', typeof emptyHtml === 'string' && emptyHtml.includes('<table>'));

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
