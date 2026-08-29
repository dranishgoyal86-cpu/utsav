// Excel parsing -- the one deliberate dependency in this whole feature,
// distinct from the fuzzy-matching decision (which stayed in-house). CSV
// is a small enough grammar to hand-roll correctly (see lib/csvParser.js);
// .xlsx is a real zip-of-XML binary format with its own compressed
// container, shared-string tables, and cell-type encoding -- reimplementing
// even a useful subset of that isn't a reasonable use of build time next to
// `xlsx` (SheetJS community edition), which is the de facto standard for
// exactly this and has no runtime dependencies of its own.
import * as XLSX from 'xlsx';

// Takes the raw file bytes (an ArrayBuffer -- see BulkImportServices.js's
// fetch(uri).arrayBuffer(), the same cross-platform read used for both
// native and web pickers) and returns the same { headers, rows } shape
// lib/csvParser.js produces, so every downstream step (column mapping,
// fuzzy matching, import) is format-agnostic past this point.
export function parseExcel(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[firstSheetName];
  // header: 1 -> array-of-arrays (not object-keyed-by-header), so a blank
  // or duplicate header cell doesn't silently eat a column the way
  // sheet_to_json's default object mode would. raw: false -> cell values
  // come back already formatted as displayed (e.g. "1,200" or a typed
  // date string), matching what a CSV export of the same sheet would give
  // this parser -- keeps both input formats behaving the same downstream.
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map(h => String(h ?? '').trim());
  const rows = grid.slice(1)
    .filter(r => r.some(cell => String(cell ?? '').trim() !== ''))
    .map(r => {
      const padded = r.slice(0, headers.length).map(c => String(c ?? ''));
      while (padded.length < headers.length) padded.push('');
      return padded;
    });

  return { headers, rows };
}
