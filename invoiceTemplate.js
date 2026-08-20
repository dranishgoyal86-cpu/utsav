// Converts a number to Indian-format words for the invoice total
function numberToWords(num) {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  num = Math.floor(num);
  if (num === 0) return 'Zero';
  function twoDigit(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  }
  function threeDigit(n) {
    return (n > 99 ? a[Math.floor(n / 100)] + ' Hundred ' : '') + twoDigit(n % 100);
  }
  let result = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const rest = num;
  if (crore) result += threeDigit(crore) + ' Crore ';
  if (lakh) result += twoDigit(lakh) + ' Lakh ';
  if (thousand) result += twoDigit(thousand) + ' Thousand ';
  if (rest) result += threeDigit(rest);
  return result.trim();
}

function money(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildInvoiceHtml(d) {
  const { billing, client, items, invoiceNumber, invoiceDate, isGst, sameState, gstRate,
    subtotal, cgst, sgst, igst, total, notes } = d;

  const itemsRows = items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="desc">${it.description}${isGst ? `<div class="sac">SAC: ${billing.sac_code || '998554'}</div>` : ''}</td>
      <td class="num">${it.qty}</td>
      <td class="num">${money(it.rate)}</td>
      <td class="num">${money(it.amount)}</td>
    </tr>
  `).join('');

  const taxRows = isGst ? (sameState ? `
    <tr><td colspan="4" class="totlabel">CGST (${gstRate / 2}%)</td><td class="num">${money(cgst)}</td></tr>
    <tr><td colspan="4" class="totlabel">SGST (${gstRate / 2}%)</td><td class="num">${money(sgst)}</td></tr>
  ` : `
    <tr><td colspan="4" class="totlabel">IGST (${gstRate}%)</td><td class="num">${money(igst)}</td></tr>
  `) : '';

  const bankBlock = billing.bank_name ? `
    <div class="bank">
      <div class="bank-title">Bank Details</div>
      <div>${billing.bank_name}</div>
      ${billing.bank_account ? `<div>A/C: ${billing.bank_account}</div>` : ''}
      ${billing.bank_ifsc ? `<div>IFSC: ${billing.bank_ifsc}</div>` : ''}
    </div>` : '';

  const docTitle = isGst ? 'TAX INVOICE' : 'BILL OF SUPPLY';

  return `
  <!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 32px; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
    .biz-name { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .muted { color: #666; line-height: 1.5; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; letter-spacing: 1px; color: #1a1a1a; }
    .meta { margin-top: 8px; text-align: right; line-height: 1.6; }
    .meta b { color: #000; }
    .parties { display: flex; justify-content: space-between; margin: 24px 0; gap: 24px; }
    .party { flex: 1; }
    .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
    .party-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { background: #1a1a1a; color: #fff; padding: 10px 8px; text-align: left; font-size: 11px; }
    thead th.num { text-align: right; }
    tbody td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.num { text-align: right; }
    td.desc { font-weight: 600; }
    .sac { font-weight: 400; color: #999; font-size: 10px; margin-top: 2px; }
    .totals td { padding: 7px 8px; border: none; }
    .totlabel { text-align: right; color: #666; }
    .grand td { border-top: 2px solid #1a1a1a; font-size: 15px; font-weight: 800; padding-top: 12px; }
    .words { margin-top: 12px; font-style: italic; color: #444; }
    .footer { display: flex; justify-content: space-between; margin-top: 32px; gap: 24px; }
    .bank { flex: 1; font-size: 11px; line-height: 1.6; }
    .bank-title { font-weight: 700; margin-bottom: 4px; }
    .notes { flex: 1; font-size: 11px; color: #555; }
    .sign { text-align: right; margin-top: 48px; }
    .sign-line { border-top: 1px solid #999; width: 160px; margin-left: auto; padding-top: 6px; text-align: center; }
    .stamp { text-align: center; margin-top: 24px; color: #aaa; font-size: 10px; }
  </style></head><body>

    <div class="top">
      <div>
        <div class="biz-name">${billing.business_name}</div>
        <div class="muted">
          ${billing.address ? billing.address + '<br>' : ''}
          ${[billing.city, billing.state, billing.pincode].filter(Boolean).join(', ')}
          ${billing.gstin ? `<br><b>GSTIN:</b> ${billing.gstin}` : ''}
          ${billing.pan ? `<br><b>PAN:</b> ${billing.pan}` : ''}
          ${billing.phone ? `<br>${billing.phone}` : ''}
          ${billing.email ? ` · ${billing.email}` : ''}
        </div>
      </div>
      <div class="doc-title">
        <h1>${docTitle}</h1>
        <div class="meta">
          <div><b>${invoiceNumber}</b></div>
          <div>${invoiceDate}</div>
        </div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Bill To</div>
        <div class="party-name">${client.name}</div>
        <div class="muted">
          ${client.address ? client.address.replace(/\n/g, '<br>') + '<br>' : ''}
          ${client.state ? client.state : ''}
          ${client.gstin ? `<br><b>GSTIN:</b> ${client.gstin}` : ''}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:6%">#</th>
          <th style="width:48%">Description</th>
          <th class="num" style="width:10%">Qty</th>
          <th class="num" style="width:18%">Rate</th>
          <th class="num" style="width:18%">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
      <tbody class="totals">
        <tr><td colspan="4" class="totlabel">Subtotal</td><td class="num">${money(subtotal)}</td></tr>
        ${taxRows}
        <tr class="grand"><td colspan="4" class="totlabel">TOTAL</td><td class="num">${money(total)}</td></tr>
      </tbody>
    </table>

    <div class="words"><b>In words:</b> ${numberToWords(total)} Rupees Only</div>

    <div class="footer">
      ${bankBlock}
      <div class="notes">
        ${notes ? `<b>Notes:</b><br>${notes.replace(/\n/g, '<br>')}` : ''}
      </div>
    </div>

    <div class="sign">
      <div style="height:40px"></div>
      <div class="sign-line">For ${billing.business_name}</div>
    </div>

    ${!isGst ? '<div class="stamp">This is a Bill of Supply. No GST charged (supplier not GST-registered / composition scheme).</div>' : ''}

  </body></html>`;
}

// A marketplace booking's total_amount is never tagged with a GST rate
// anywhere in the booking flow — CreateBookingScreen.js/create-razorpay-order
// just charge a flat total. Splitting that into CGST/SGST here would mean
// inventing tax figures, so this renders as a payment receipt (single amount
// line, "Paid" stamp) rather than reusing buildInvoiceHtml's tax-invoice
// math. The provider's GSTIN/PAN/business address still appear in full for
// reference — legitimate business details, distinct from a fabricated split.
export function buildReceiptHtml(d) {
  const { billing, customer, booking, provider, paymentId, paidAt, amount, receiptNumber } = d;

  const businessName = billing?.business_name || provider?.businessName || provider?.name || 'Provider';

  const bizBlock = `
    <div class="biz-name">${businessName}</div>
    <div class="muted">
      ${billing?.address ? billing.address + '<br>' : ''}
      ${[billing?.city, billing?.state, billing?.pincode].filter(Boolean).join(', ')}
      ${billing?.gstin ? `<br><b>GSTIN:</b> ${billing.gstin}` : ''}
      ${billing?.pan ? `<br><b>PAN:</b> ${billing.pan}` : ''}
      ${billing?.phone ? `<br>${billing.phone}` : ''}
      ${billing?.email ? ` · ${billing.email}` : ''}
    </div>`;

  const bankBlock = billing?.bank_name ? `
    <div class="bank">
      <div class="bank-title">Bank Details</div>
      <div>${billing.bank_name}</div>
      ${billing.bank_account ? `<div>A/C: ${billing.bank_account}</div>` : ''}
      ${billing.bank_ifsc ? `<div>IFSC: ${billing.bank_ifsc}</div>` : ''}
    </div>` : '<div class="bank"></div>';

  return `
  <!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 32px; font-size: 12px; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
    .biz-name { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .muted { color: #666; line-height: 1.5; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 22px; letter-spacing: 1px; color: #1a1a1a; }
    .paid-badge { display: inline-block; margin-top: 8px; background: #2E7D32; color: #fff; font-weight: 700; font-size: 11px; letter-spacing: 1px; padding: 4px 10px; border-radius: 4px; }
    .meta { margin-top: 8px; text-align: right; line-height: 1.6; }
    .meta b { color: #000; }
    .parties { display: flex; justify-content: space-between; margin: 24px 0; gap: 24px; }
    .party { flex: 1; }
    .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 6px; }
    .party-name { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th { background: #1a1a1a; color: #fff; padding: 10px 8px; text-align: left; font-size: 11px; }
    thead th.num { text-align: right; }
    tbody td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    td.num { text-align: right; }
    td.desc { font-weight: 600; }
    .desc-sub { font-weight: 400; color: #999; font-size: 10px; margin-top: 2px; }
    .totals td { padding: 7px 8px; border: none; }
    .totlabel { text-align: right; color: #666; }
    .grand td { border-top: 2px solid #1a1a1a; font-size: 15px; font-weight: 800; padding-top: 12px; }
    .payment-box { margin-top: 20px; background: #f7f7f5; border-radius: 8px; padding: 14px 16px; }
    .payment-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .payment-row b { color: #000; }
    .footer { display: flex; justify-content: space-between; margin-top: 32px; gap: 24px; }
    .bank { flex: 1; font-size: 11px; line-height: 1.6; }
    .bank-title { font-weight: 700; margin-bottom: 4px; }
    .sign { text-align: right; margin-top: 48px; }
    .sign-line { border-top: 1px solid #999; width: 160px; margin-left: auto; padding-top: 6px; text-align: center; }
  </style></head><body>

    <div class="top">
      <div>${bizBlock}</div>
      <div class="doc-title">
        <h1>PAYMENT RECEIPT</h1>
        <div class="meta">
          <div><b>${receiptNumber}</b></div>
          <div>${paidAt}</div>
        </div>
        <div><span class="paid-badge">✓ PAID</span></div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Received From</div>
        <div class="party-name">${customer?.name || 'Customer'}</div>
        <div class="muted">
          ${customer?.phone || ''}${customer?.phone && customer?.email ? ' · ' : ''}${customer?.email || ''}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:6%">#</th>
          <th style="width:64%">Description</th>
          <th class="num" style="width:30%">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td class="desc">
            ${booking?.serviceTitle || booking?.eventType || 'Event service'}
            <div class="desc-sub">
              ${booking?.eventType ? `${booking.eventType}` : ''}
              ${booking?.eventDate ? ` · ${booking.eventDate}` : ''}
              ${booking?.eventTime ? ` · ${booking.eventTime}` : ''}
              ${booking?.venue ? ` · ${booking.venue}` : ''}
              ${booking?.guestCount ? ` · ${booking.guestCount} guests` : ''}
            </div>
          </td>
          <td class="num">${money(amount)}</td>
        </tr>
      </tbody>
      <tbody class="totals">
        <tr class="grand"><td colspan="2" class="totlabel">TOTAL PAID</td><td class="num">${money(amount)}</td></tr>
      </tbody>
    </table>

    <div class="payment-box">
      <div class="payment-row"><span>Payment ID</span><b>${paymentId || '—'}</b></div>
      <div class="payment-row"><span>Payment method</span><b>Razorpay</b></div>
      <div class="payment-row"><span>Paid on</span><b>${paidAt}</b></div>
      <div class="payment-row"><span>Booking ID</span><b>${booking?.id ? booking.id.slice(0, 8).toUpperCase() : '—'}</b></div>
    </div>

    <div class="footer">
      ${bankBlock}
    </div>

    <div class="sign">
      <div style="height:40px"></div>
      <div class="sign-line">For ${businessName}</div>
    </div>

  </body></html>`;
}