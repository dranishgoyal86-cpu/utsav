function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// One guest's printable/shareable pass — self-contained (name + QR + event
// details), works at any venue including a condominium's own security desk.
// No real integration with a third-party condo platform (no partner API
// access exists for that); this generic pass is the whole answer.
function passHtml({ eventName, eventDate, eventVenue, guestName, tag, isVip, plusOnes, qrSvgString }) {
  return `
    <div class="pass">
      ${isVip ? '<div class="vip-ribbon">★ VIP</div>' : ''}
      <div class="pass-title">${escapeHtml(eventName)}</div>
      ${eventDate ? `<div class="pass-meta">${escapeHtml(eventDate)}</div>` : ''}
      ${eventVenue ? `<div class="pass-meta">${escapeHtml(eventVenue)}</div>` : ''}
      <div class="qr-wrap">${qrSvgString}</div>
      <div class="guest-name">${escapeHtml(guestName)}</div>
      ${tag ? `<div class="guest-tag">${escapeHtml(tag)}</div>` : ''}
      ${plusOnes > 0 ? `<div class="guest-tag">+${plusOnes} guest${plusOnes > 1 ? 's' : ''}</div>` : ''}
      <div class="pass-footer">Present this pass at the gate — theutsavapp.com</div>
    </div>
  `;
}

// One guest's pass in the guest_passes-backed hierarchy PassCard.js needs:
// most Indian society guards read the pass, not scan it, so everything
// below the guest name must stand alone with the QR covered — largest to
// smallest is guest name, then where (flat/society or venue), then when
// (date + entry window), then the human-readable code, then the QR last.
function passCardHtml({ guestName, partySize, venueLabel, venueAddress, dateLabel, entryWindow, passCode, qrSvgString }) {
  return `
    <div class="card">
      <div class="card-guest">${escapeHtml(guestName)}</div>
      ${partySize > 1 ? `<div class="card-party">Party of ${partySize}</div>` : ''}
      ${venueLabel ? `<div class="card-where">${escapeHtml(venueLabel)}</div>` : ''}
      ${venueAddress ? `<div class="card-where-sub">${escapeHtml(venueAddress)}</div>` : ''}
      ${dateLabel ? `<div class="card-when">${escapeHtml(dateLabel)}${entryWindow ? ` · ${escapeHtml(entryWindow)}` : ''}</div>` : ''}
      <div class="card-code">${escapeHtml(passCode)}</div>
      <div class="card-qr">${qrSvgString}</div>
      <div class="card-footer">Present this pass at the gate — theutsavapp.com</div>
    </div>
  `;
}

export function buildPassCardHtml(passes) {
  const list = Array.isArray(passes) ? passes : [passes];
  const body = list.map((p, i) => `
    <div style="${i < list.length - 1 ? 'page-break-after: always;' : ''}">
      ${passCardHtml(p)}
    </div>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 0; }
          .card {
            max-width: 380px; margin: 40px auto; padding: 30px 24px;
            border: 1.5px solid #D4AF37; border-radius: 18px; text-align: center;
          }
          .card-guest { font-size: 26px; font-weight: 800; color: #1A1225; line-height: 1.2; }
          .card-party { font-size: 14px; font-weight: 600; color: #555; margin-top: 4px; }
          .card-where { font-size: 18px; font-weight: 700; color: #1A1225; margin-top: 14px; }
          .card-where-sub { font-size: 13px; color: #666; margin-top: 2px; }
          .card-when { font-size: 14px; color: #555; margin-top: 10px; }
          .card-code { font-size: 22px; font-weight: 800; letter-spacing: 4px; color: #1A1225; margin-top: 16px; font-family: 'Courier New', monospace; }
          .card-qr { margin: 18px auto 0; width: 160px; height: 160px; }
          .card-qr svg { width: 160px; height: 160px; }
          .card-footer { font-size: 10px; color: #999; margin-top: 16px; letter-spacing: 0.3px; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
}

// Single pass or a batch — a batch wraps each pass in a page-break div and
// concatenates into one HTML doc, so Print.printToFileAsync produces one
// multi-page PDF for the whole guest list in a single call, not N calls.
export function buildGatePassHtml(passes) {
  const list = Array.isArray(passes) ? passes : [passes];
  const body = list.map((p, i) => `
    <div style="${i < list.length - 1 ? 'page-break-after: always;' : ''}">
      ${passHtml(p)}
    </div>
  `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 0; }
          .pass {
            position: relative;
            max-width: 380px; margin: 40px auto; padding: 28px 24px;
            border: 1.5px solid #D4AF37; border-radius: 18px; text-align: center;
          }
          .vip-ribbon {
            position: absolute; top: 14px; right: 14px;
            background: #F0A93F; color: #fff; font-weight: 700; font-size: 11px;
            padding: 4px 10px; border-radius: 10px;
          }
          .pass-title { font-size: 20px; font-weight: 800; color: #1A1225; margin-bottom: 4px; }
          .pass-meta { font-size: 12px; color: #666; margin-bottom: 2px; }
          .qr-wrap { margin: 20px auto; width: 180px; height: 180px; }
          .qr-wrap svg { width: 180px; height: 180px; }
          .guest-name { font-size: 17px; font-weight: 700; color: #1A1225; margin-top: 8px; }
          .guest-tag { font-size: 12px; color: #888; margin-top: 2px; }
          .pass-footer { font-size: 10px; color: #999; margin-top: 20px; letter-spacing: 0.3px; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `;
}
