// Section metadata (a display label per grouping key) + the section()
// constructor schemas/*.js use to attach a list of field() entries to a
// section. Sections are a rendering grouping only — they carry no
// design/layout meaning beyond "these fields are shown together with this
// heading"; a future design archetype is free to split a section across
// multiple scenes or drop its heading entirely for a dense one-page card.
// invite-architecture wave, Part 3 — expanded from the foundation wave's 6
// sections to cover all 26 canonical event_type_slug schemas. Every new key
// follows the same rule the original 6 did: a grouping label only, no
// design/layout meaning — a future design archetype is free to reshuffle
// which section renders where (or drop the heading) per layout.
export const SECTION_DEFS = Object.freeze({
  identity: { key: 'identity', label: null }, // no heading today — matches current form's un-headed top fields
  family: { key: 'family', label: 'Family' },
  media: { key: 'media', label: null },
  presentation: { key: 'presentation', label: null },
  subject: { key: 'subject', label: null },
  details: { key: 'details', label: null },
  schedule: { key: 'schedule', label: 'Schedule' },
  venue: { key: 'venue', label: 'Venue' },
  ritual: { key: 'ritual', label: 'Ritual details' },
  dress: { key: 'dress', label: 'Dress & guidance' },
  hospitality: { key: 'hospitality', label: 'Hospitality' },
  ceremonies: { key: 'ceremonies', label: 'Ceremonies' },
  logistics: { key: 'logistics', label: 'Logistics' },
  programme: { key: 'programme', label: 'Programme' },
  registration: { key: 'registration', label: 'Registration' },
  custom: { key: 'custom', label: 'In your own words' },
});

export function section(sectionKey, fields) {
  const def = SECTION_DEFS[sectionKey];
  if (!def) {
    throw new Error(`section(): unknown section key "${sectionKey}" — add it to SECTION_DEFS first`);
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error(`section(): section "${sectionKey}" needs at least one field()`);
  }
  return { key: def.key, label: def.label, fields };
}
