// Section metadata (a display label per grouping key) + the section()
// constructor schemas/*.js use to attach a list of field() entries to a
// section. Sections are a rendering grouping only — they carry no
// design/layout meaning beyond "these fields are shown together with this
// heading"; a future design archetype is free to split a section across
// multiple scenes or drop its heading entirely for a dense one-page card.
export const SECTION_DEFS = Object.freeze({
  identity: { key: 'identity', label: null }, // no heading today — matches current form's un-headed top fields
  media: { key: 'media', label: null },
  presentation: { key: 'presentation', label: null },
  subject: { key: 'subject', label: null },
  details: { key: 'details', label: null },
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
