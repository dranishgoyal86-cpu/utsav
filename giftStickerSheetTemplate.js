function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// QR images come from api.qrserver.com's free QR-image endpoint rather than
// this app's own qrcode-svg library (already used for gate passes) — simpler
// for a print-only HTML grid, a plain <img src> per cell, no SVG-string
// embedding needed, at the cost of needing internet access at print time,
// which is already implicit (the host is online to use the app at all).
function stickerCell(eventPrefix, code) {
  const qrData = encodeURIComponent(`UTSAV-${eventPrefix}-${code}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrData}`;
  return `
    <div class="sticker">
      <img src="${qrUrl}" width="90" height="90" />
      <div class="code">${escapeHtml(code)}</div>
    </div>
  `;
}

export function buildGiftStickerSheetHtml({ eventId, codes }) {
  const eventPrefix = String(eventId).slice(0, 8);
  const cells = codes.map(code => stickerCell(eventPrefix, code)).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 8mm; }
          body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; }
          .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6mm; }
          .sticker {
            text-align: center; border: 1px dashed #ccc; border-radius: 6px;
            padding: 4mm; break-inside: avoid;
          }
          .code { font-family: monospace; font-size: 11px; font-weight: 700; margin-top: 3px; letter-spacing: 0.5px; }
        </style>
      </head>
      <body>
        <div class="grid">${cells}</div>
      </body>
    </html>
  `;
}
