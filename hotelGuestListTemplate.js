function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function sortedGuests(guests) {
  return [...guests].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// Same "last 10 digits, space after the first five" convention as
// visitorListTemplate.js's formatPhone — kept in sync deliberately, not a
// copy-paste drift risk since both are tiny and unlikely to change.
function formatPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return `${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return phone;
}

function stayLine(g) {
  const parts = [];
  if (g.accommodationName) parts.push(g.accommodationName);
  if (g.roomNumber) parts.push(`Room ${g.roomNumber}`);
  return parts.join(' · ') || null;
}

function travelLine(g) {
  const parts = [];
  if (g.arrivalDate) parts.push(`Arrives ${g.arrivalDate}${g.arrivalTime ? ` ${g.arrivalTime}` : ''}`);
  if (g.departureDate) parts.push(`Departs ${g.departureDate}${g.departureTime ? ` ${g.departureTime}` : ''}`);
  return parts.join(' · ') || null;
}

// Plain-text, WhatsApp-ready — same "generated on demand, not stored"
// shape as visitorListTemplate.js. Govt ID links are short-lived signed
// URLs (createSignedUrl, resolved fresh by the caller right before this
// runs) — "Not uploaded yet" is shown plainly rather than silently
// omitted, so a gap is visible to the host before they hand this to a
// hotel/venue coordinator, not discovered after the fact.
export function buildHotelGuestListText({ eventName, eventDate, guests, hostName, hostPhone }) {
  const sorted = sortedGuests(guests);
  const lines = [
    'UTSAV — OUTSTATION GUEST LIST',
    '',
    `Event: ${eventName}`,
    `Date: ${eventDate}`,
    `Total guests (incl. accompanying): ${sorted.reduce((n, g) => n + 1 + (g.accompanying?.length || 0), 0)}`,
    '',
  ];

  sorted.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.name}${g.phone ? ` — ${formatPhone(g.phone)}` : ''}`);
    const stay = stayLine(g);
    if (stay) lines.push(`   🏨 ${stay}`);
    const travel = travelLine(g);
    if (travel) lines.push(`   ✈️ ${travel}`);
    lines.push(`   🪪 Govt ID: ${g.govtIdLink || 'Not uploaded yet'}`);
    (g.accompanying || []).forEach(a => {
      lines.push(`   + ${a.name} — Govt ID: ${a.govtIdLink || 'Not uploaded yet'}`);
    });
    lines.push('');
  });

  lines.push(`Host: ${hostName}${hostPhone ? ` — ${formatPhone(hostPhone)}` : ''}`);
  lines.push('');
  lines.push('Generated via Utsav');

  return lines.join('\n');
}

// PDF — same minimal black-on-white print styling as
// visitorListTemplate.js's buildVisitorListPdfHtml (thin rules, no color,
// generous row height — meant to be cheaply printed and handed to a hotel
// desk, not viewed on-screen).
export function buildHotelGuestListPdfHtml({ eventName, eventDate, guests, hostName, hostPhone }) {
  const sorted = sortedGuests(guests);
  const totalCount = sorted.reduce((n, g) => n + 1 + (g.accompanying?.length || 0), 0);

  const rows = sorted.map((g, i) => {
    const accRows = (g.accompanying || []).map(a => `
      <tr>
        <td class="num"></td>
        <td>&nbsp;&nbsp;+ ${escapeHtml(a.name)}</td>
        <td></td>
        <td></td>
        <td>${a.govtIdLink ? 'Uploaded' : 'Not uploaded yet'}</td>
      </tr>
    `).join('');
    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(g.name)}</td>
        <td>${g.phone ? escapeHtml(formatPhone(g.phone)) : ''}</td>
        <td>${escapeHtml(stayLine(g) || '')}</td>
        <td>${g.govtIdLink ? 'Uploaded' : 'Not uploaded yet'}</td>
      </tr>
      ${accRows}
    `;
  }).join('');

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
          th, td { border: 1px solid #000; padding: 10px 8px; font-size: 12.5px; text-align: left; }
          th { font-weight: 700; }
          .num { width: 30px; text-align: center; }
          .footer { margin-top: 22px; font-size: 12px; border-top: 1px solid #000; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>UTSAV — OUTSTATION GUEST LIST</h1>
        <div class="meta"><b>Event:</b> ${escapeHtml(eventName)}</div>
        <div class="meta"><b>Date:</b> ${escapeHtml(eventDate)}</div>
        <div class="meta"><b>Total guests (incl. accompanying):</b> ${totalCount}</div>
        <table>
          <thead><tr><th class="num">#</th><th>Name</th><th>Phone</th><th>Stay</th><th>Govt ID</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Host: ${escapeHtml(hostName)}${hostPhone ? ` — ${escapeHtml(formatPhone(hostPhone))}` : ''}<br/>Govt ID links in the shared text version are short-lived — regenerate if expired.<br/>Generated via Utsav</div>
      </body>
    </html>
  `;
}
