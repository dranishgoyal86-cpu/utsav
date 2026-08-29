// Hand-rolled CSV parser -- no dependency, per this project's established
// convention (custom date picker, hand-rolled coach marks). CSV's actual
// grammar is small enough that a real parser (quoted fields, commas and
// newlines inside quotes, doubled "" as an escaped quote, \r\n or \n line
// endings, a leading UTF-8 BOM some spreadsheet tools still write) is
// realistic to hand-write correctly -- this is the "CSV: hand-rolled"
// half of the brief; Excel's binary .xlsx format is not the same kind of
// realistic (see lib/excelParser.js for why that one gets a real library).
//
// Returns { headers: string[], rows: string[][] } -- every row padded/
// truncated to headers.length so downstream code never has to guard
// against a short/ragged row.

export function parseCSV(text) {
  // Strip a leading BOM (﻿) -- Excel's own "CSV UTF-8" export writes
  // one, and left in place it silently glues onto the first header's name.
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() {
    record.push(field);
    field = '';
  }
  function pushRecord() {
    pushField();
    // Skip fully-blank trailing lines (a common trailing-newline artifact)
    // rather than emitting an empty row downstream code would have to filter.
    if (!(record.length === 1 && record[0] === '')) records.push(record);
    record = [];
  }

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }

    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; } // normalize CRLF -> LF, drop the \r either way
    if (ch === '\n') { pushRecord(); i++; continue; }
    field += ch; i++;
  }
  // Final field/record if the file doesn't end with a newline.
  if (field !== '' || record.length > 0) pushRecord();

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map(h => h.trim());
  const rows = records.slice(1)
    .filter(r => r.some(cell => cell.trim() !== '')) // drop fully-blank rows
    .map(r => {
      const padded = r.slice(0, headers.length);
      while (padded.length < headers.length) padded.push('');
      return padded;
    });

  return { headers, rows };
}
