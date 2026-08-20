function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// VIP guests get a visual star marker only — no automatic head-table
// placement, since only general VIP flagging was asked for, not priority
// seating. Host places VIPs like any other guest.
export function buildSeatingChartHtml({ eventName, tables }) {
  const tableCards = tables.map(t => `
    <div class="table-card">
      <div class="table-title">Table ${t.number}</div>
      <ul class="guest-list">
        ${t.guests.map(g => `
          <li>${g.isVip ? '★ ' : ''}${escapeHtml(g.name)}${g.isHousehold ? ` (🏠 ${g.partySize})` : (g.plusOnes > 0 ? ` (+${g.plusOnes})` : '')}${g.tag ? ` <span class="tag">${escapeHtml(g.tag)}</span>` : ''}</li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; }
          h1 { font-size: 22px; color: #1A1225; margin-bottom: 20px; }
          .grid { display: flex; flex-wrap: wrap; gap: 16px; }
          .table-card { width: 240px; border: 1px solid #D4AF37; border-radius: 12px; padding: 16px; break-inside: avoid; }
          .table-title { font-size: 16px; font-weight: 700; color: #1A1225; margin-bottom: 10px; }
          .guest-list { margin: 0; padding-left: 18px; font-size: 13px; color: #333; line-height: 1.7; }
          .tag { font-size: 11px; color: #999; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(eventName)} — Seating Chart</h1>
        <div class="grid">${tableCards}</div>
      </body>
    </html>
  `;
}
