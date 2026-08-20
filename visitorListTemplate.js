function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function sortedGuests(guests) {
  return [...guests].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// "Space after the first five digits" per spec — normalizes to the last 10
// digits first so a stored +91 prefix or stray formatting doesn't shift the
// split point, then falls back to the raw value untouched for anything that
// doesn't look like a normal 10-digit Indian mobile number.
function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return phone;
}

// Only the "both empty" case was specified explicitly (omit the line
// entirely); a host filling in just one of the two text inputs is a real
// case the two-separate-fields design allows, so this also handles that
// gracefully ("from 6:00 PM" / "until 11:00 PM") rather than printing a
// dangling "to".
function entryTimeLine(entryStartTime, entryEndTime) {
  const start = (entryStartTime || '').trim();
  const end = (entryEndTime || '').trim();
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  if (end) return `until ${end}`;
  return null;
}

export function buildVisitorListText({ eventName, eventDate, societyName, flatNumber, entryStartTime, entryEndTime, guests, hostName, hostPhone }) {
  const sorted = sortedGuests(guests);
  const lines = [
    'UTSAV — VISITOR LIST',
    '',
    `Event: ${eventName}`,
    `Date: ${eventDate}`,
    `Flat: ${flatNumber}, ${societyName}`,
  ];

  const entryLine = entryTimeLine(entryStartTime, entryEndTime);
  if (entryLine) lines.push(`Entry time: ${entryLine}`);

  lines.push(`Expected guests: ${sorted.length}`);
  lines.push('');
  lines.push('Please allow the following visitors:');
  lines.push('');

  sorted.forEach((g, i) => {
    const phonePart = g.phone ? ` — ${formatPhone(g.phone)}` : '';
    lines.push(`${i + 1}. ${g.name}${phonePart}`);
  });

  lines.push('');
  lines.push(`Host: ${hostName}${hostPhone ? ` — ${formatPhone(hostPhone)}` : ''}`);
  lines.push(`Flat ${flatNumber}`);
  lines.push('');
  lines.push('Generated via Utsav');

  return lines.join('\n');
}

// PDF-only additions vs. the WhatsApp text: venue address, a table with an
// "Arrived" checkbox column for the guard to tick by hand, minimal
// black-on-white print styling (thin rules, generous row height, no color,
// no small fonts — this is printed cheap and used at a gate).
export function buildVisitorListPdfHtml({ eventName, eventDate, societyName, flatNumber, venueAddress, entryStartTime, entryEndTime, guests, hostName, hostPhone }) {
  const sorted = sortedGuests(guests);
  const entryLine = entryTimeLine(entryStartTime, entryEndTime);

  const rows = sorted.map((g, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(g.name)}</td>
      <td>${g.phone ? escapeHtml(formatPhone(g.phone)) : ''}</td>
      <td class="checkbox-cell"><span class="checkbox"></span></td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; margin: 0; }
          h1 { font-size: 20px; margin: 0 0 10px; }
          .meta { font-size: 13px; line-height: 1.7; }
          .meta b { font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #000; padding: 11px 9px; font-size: 13px; text-align: left; }
          th { font-weight: 700; }
          .num { width: 34px; text-align: center; }
          .checkbox-cell { width: 64px; text-align: center; }
          .checkbox { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #000; }
          .footer { margin-top: 22px; font-size: 12px; border-top: 1px solid #000; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>UTSAV — VISITOR LIST</h1>
        <div class="meta"><b>Event:</b> ${escapeHtml(eventName)}</div>
        <div class="meta"><b>Date:</b> ${escapeHtml(eventDate)}</div>
        <div class="meta"><b>Flat:</b> ${escapeHtml(flatNumber)}, ${escapeHtml(societyName)}</div>
        ${venueAddress ? `<div class="meta"><b>Venue:</b> ${escapeHtml(venueAddress)}</div>` : ''}
        ${entryLine ? `<div class="meta"><b>Entry time:</b> ${escapeHtml(entryLine)}</div>` : ''}
        <div class="meta"><b>Expected guests:</b> ${sorted.length}</div>
        <table>
          <thead><tr><th class="num">#</th><th>Name</th><th>Phone</th><th class="checkbox-cell">Arrived</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Host: ${escapeHtml(hostName)}${hostPhone ? ` — ${escapeHtml(formatPhone(hostPhone))}` : ''} · Flat ${escapeHtml(flatNumber)}<br/>Generated via Utsav</div>
      </body>
    </html>
  `;
}
