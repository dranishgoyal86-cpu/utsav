// Pure static/PDF layout-model builder. Produces a slot-based data model
// (lib/inviteDesignArchetypes/types.js's STATIC_SLOT vocabulary) — NOT a
// rendered image and NOT a screenshot of the web page. A rendering
// component (components/inviteArchetypes/StaticInviteCard.js) turns this
// model into actual pixels; this file only decides WHAT goes in each slot,
// so the exact same model can later drive a PDF renderer too without a
// second, competing content-mapping layer.
//
// PDF strategy (contract only this wave, no expo-print wiring — "do not
// implement production PDF export unless easy to do without destabilizing
// the wave"): buildPdfPageModels() below reuses this same slot model for
// page 1 (the invitation), then adds simple list-shaped secondary pages
// for function/travel/stay content when it exists — never a separate
// third template system.
import { STATIC_SLOT } from './inviteDesignArchetypes/types';
import { getArchetype, getVariant } from './inviteDesignArchetypes';
import { resolveBrandAttribution } from './inviteBrandingPolicy';

// eventTypeSlug: Batch 3 fix (found via Playwright) — "weds" as the
// couple connector is right for hindu-wedding/nikah/engagement, but reads
// as a real wedding for an already-married couple's anniversary. Never
// affects the names themselves, only this one decorative word.
function buildPrimaryNames(values, eventTypeSlug) {
  if (!values) return null;
  if (values.partner1Name || values.partner2Name) {
    return { mode: 'couple', name1: values.partner1Name || '', name2: values.partner2Name || '', connector: eventTypeSlug === 'anniversary' ? '&' : 'weds' };
  }
  if (values.subjectNameLine1) {
    return { mode: 'subject', line1: values.subjectNameLine1, line2: values.subjectNameLine2 || '' };
  }
  if (values.celebrantName) return { mode: 'single', name: values.celebrantName };
  if (values.childName) return { mode: 'single', name: values.childName };
  // Batch 2 — babyName (naming-ceremony) and productName (product-launch)
  // are both CONDITIONAL fields (lib/inviteContentAdapter.js's
  // applyConditionalSuppression already blanks them out upstream whenever
  // nameIsSecret/productNameHidden is true, before this function ever
  // sees them) — when present here, they're genuinely safe to show as
  // the primary visual name.
  if (values.babyName) return { mode: 'single', name: values.babyName };
  if (values.productName) return { mode: 'single', name: values.productName };
  return null;
}

// Batch 2 — a host-facing, non-leaking placeholder for the two "hidden
// name" cases. Deliberately plain app copy (same category as the
// "YOU ARE INVITED" kicker default), never host content: shown only when
// the host has toggled a name secret/hidden AND hasn't written their own
// headlineText to override it.
const SECRET_BABY_NAME_TEASER = 'Join us as we welcome and name our little one';
const HIDDEN_PRODUCT_TEASER = 'Something big is coming';

// Layout family -> photo-crop shape, so a photo dropped onto a
// split-photo or photo-editorial layout gets an intentional crop instead
// of being stretched to fit — see StaticInviteCard.js's PhotoSlot(), which
// always resizeMode="cover"s (never stretches) regardless of shape.
const PHOTO_SHAPE_BY_LAYOUT = Object.freeze({
  'split-photo': 'circle',
  'photo-editorial': 'hero',
  'framed-portrait': 'arch',
});

function resolvePhotoShape(archetype) {
  const layouts = archetype?.static?.layouts || [];
  for (const layout of layouts) {
    if (PHOTO_SHAPE_BY_LAYOUT[layout]) return PHOTO_SHAPE_BY_LAYOUT[layout];
  }
  return null;
}

// event: a plain { name, event_date, event_time, venue } shape (the same
// fields ToranCoverCard.js already reads off the real events row — no new
// canonical field required). qrTargetUrl: the real guest-facing link this
// card should gateway to (a guest_passes.pass_code-based URL, resolved by
// the caller — this file has no Supabase access and doesn't know it).
// photoUrl: an optional host-supplied photo (event/subject/child hero
// photo) — only surfaced in the PHOTO slot when the selected archetype's
// layout actually has a photo treatment; otherwise silently omitted
// (never crops a photo onto a layout that has nowhere to put it).
export function buildStaticLayoutModel({ archetypeId, variantId, event, values, isNonFestive = false, qrTargetUrl = null, photoUrl = null, eventTypeSlug = null } = {}) {
  const archetype = getArchetype(archetypeId);
  const variant = getVariant(variantId);
  const attribution = resolveBrandAttribution({ isNonFestive, surface: 'static' });
  const photoShape = photoUrl ? resolvePhotoShape(archetype) : null;

  const slots = {
    [STATIC_SLOT.DECORATION]: { motif: variant?.tokens?.motif || null },
    // Host-selected content only — never auto-inserted, matching every
    // religious-content field's own rule throughout lib/inviteSchemas.
    [STATIC_SLOT.SYMBOL]: values?.invocationText ? { text: values.invocationText } : null,
    // ceremonyName (engagement's REQUIRED field — Ring Ceremony/Roka/Sagai)
    // falls back into the kicker when the host hasn't written a custom one
    // — found via this wave's Visual QA pass: without this, an engagement
    // static card with no kickerText showed no occasion line at all,
    // reading like a generic/blank invite rather than naming what kind of
    // ceremony it is ("Do not assume every engagement is a wedding-lite
    // experience"). Matches the same fallback already used for the web
    // preview's kicker.
    // Batch 2 — ceremonyType (baby-shower/housewarming's own REQUIRED
    // occasion-name field, e.g. "Godh Bharai"/"Griha Pravesh") falls back
    // the same way ceremonyName already does for engagement.
    [STATIC_SLOT.KICKER]: values?.kickerText || values?.ceremonyName?.toUpperCase() || values?.ceremonyType?.toUpperCase() || values?.ceremonyCustomName?.toUpperCase() || values?.religiousEventType?.toUpperCase() || null,
    [STATIC_SLOT.HEADLINE]: values?.headlineText || event?.name || null,
    [STATIC_SLOT.PRIMARY_NAMES]: buildPrimaryNames(values, eventTypeSlug),
    [STATIC_SLOT.HOST_LINE]: values?.hostedBy || null,
    [STATIC_SLOT.DATE_TIME]: { date: event?.event_date || null, time: event?.event_time || null },
    [STATIC_SLOT.VENUE]: event?.venue || null,
    // Deliberately sparse — the brief's own rule: "Do NOT overcrowd the
    // static card with all travel/stay/RSVP data. The static card is the
    // invitation + gateway," not the full guest portal.
    // Batch 2 fix (found via Playwright): a secret-name/hidden-product
    // teaser sentence was originally routed into HEADLINE, which renders
    // at large display-name size with numberOfLines={2} +
    // adjustsFontSizeToFit — fine for an actual short name, but it
    // truncated a full sentence mid-word ("Something extraordinary is
    // about ."), and simultaneously duplicated the same tagline text
    // already shown here. The teaser now lives ONLY in this slot
    // (smaller, two-line-safe body text), and the large headline instead
    // falls back to the plain event name — always a real name, never
    // blank, never at risk of truncating a full sentence.
    [STATIC_SLOT.SECONDARY_DETAIL]: values?.coupleQuote || values?.tagline
      || (values?.nameIsSecret === true ? SECRET_BABY_NAME_TEASER : null)
      || (values?.productNameHidden === true ? HIDDEN_PRODUCT_TEASER : null)
      || null,
    [STATIC_SLOT.QR_FOOTER]: qrTargetUrl ? { url: qrTargetUrl } : null,
    // Mandatory, injected by the branding policy layer — never something
    // an archetype/variant can override or omit (see
    // lib/inviteBrandingPolicy.js's resolveBrandAttribution()).
    [STATIC_SLOT.ATTRIBUTION]: attribution.staticLine,
    [STATIC_SLOT.PHOTO]: photoShape ? { url: photoUrl, shape: photoShape } : null,
  };

  return {
    archetypeId, variantId,
    aspectRatio: '4:5',
    targetSize: { width: 1080, height: 1350 },
    slots,
  };
}

// Secondary PDF pages — plain list-shaped content, reusing the same
// kicker/headline/list-row vocabulary conceptually rather than inventing
// per-page layouts. functions/travelNote/stayNote are caller-supplied
// (from canonical event_functions / travel / accommodation data — this
// file stores none of it). Returns [] entries for anything not present,
// never fabricated placeholder content.
export function buildPdfPageModels({ staticLayoutModel, functions = [], travelNote = null, stayNote = null } = {}) {
  const pages = [{ kind: 'invitation', layout: staticLayoutModel }];

  if (functions.length > 0) {
    pages.push({
      kind: 'functions',
      kicker: 'SCHEDULE',
      rows: functions.map((f) => ({ title: f.name, date: f.date || null, time: f.time || null })),
    });
  }
  if (travelNote || stayNote) {
    pages.push({
      kind: 'travel-stay',
      kicker: 'TRAVEL & STAY',
      travelNote: travelNote || null,
      stayNote: stayNote || null,
    });
  }
  return { paginationMode: 'auto', pages };
}

// ── PDF HTML rendering (Production Batch 1) ──
// Turns buildPdfPageModels()'s page models into a plain HTML string for
// expo-print's Print.printToFileAsync({ html }) — the same
// printToFileAsync + Sharing.shareAsync pipeline already proven in
// screens/customer/GiftStickers.js (used there unguarded, no
// Platform.OS==='web' check, so this follows the identical pattern). This
// is NOT a second template system: every value rendered here comes
// straight off the page models buildPdfPageModels() already produces from
// the exact same static layout model StaticInviteCard.js renders on
// screen — this function only re-expresses that same data as HTML/CSS
// instead of React Native views. Custom app fonts (tokens.fonts.*) aren't
// loaded inside expo-print's renderer, so headings fall back to a plain
// serif/sans-serif system stack rather than silently rendering with the
// wrong font.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatPdfDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderInvitationPageHtml(layout, c) {
  const { slots } = layout;
  const namesHtml = slots.primaryNames?.mode === 'couple'
    ? `<div class="names">${escapeHtml(slots.primaryNames.name1)}${slots.primaryNames.name2 ? ` &amp; ${escapeHtml(slots.primaryNames.name2)}` : ''}</div>`
    : slots.primaryNames?.mode === 'subject'
    ? `<div class="names">${escapeHtml(slots.primaryNames.line1)}${slots.primaryNames.line2 ? `<br/>${escapeHtml(slots.primaryNames.line2)}` : ''}</div>`
    : slots.primaryNames?.mode === 'single'
    ? `<div class="names">${escapeHtml(slots.primaryNames.name)}</div>`
    : slots.headline ? `<div class="names">${escapeHtml(slots.headline)}</div>` : '';

  return `
    <div class="page invitation">
      ${slots.photo?.url ? `<img class="photo photo-${slots.photo.shape}" src="${escapeHtml(slots.photo.url)}" />` : ''}
      ${slots.symbol ? `<div class="symbol">${escapeHtml(slots.symbol.text)}</div>` : ''}
      ${slots.kicker ? `<div class="kicker">${escapeHtml(slots.kicker.toUpperCase())}</div>` : ''}
      ${slots.hostLine ? `<div class="hostLine">${escapeHtml(slots.hostLine)}</div>` : ''}
      ${namesHtml}
      ${slots.secondaryDetail ? `<div class="secondary">${escapeHtml(slots.secondaryDetail)}</div>` : ''}
      <div class="hairline"></div>
      ${slots.dateTime?.date ? `<div class="date">${escapeHtml(formatPdfDate(slots.dateTime.date))}${slots.dateTime.time ? ` · ${escapeHtml(slots.dateTime.time)}` : ''}</div>` : ''}
      ${slots.venue ? `<div class="venue">${escapeHtml(slots.venue)}</div>` : ''}
      <div class="attribution">${escapeHtml(slots.attribution)}</div>
    </div>`;
}

function renderFunctionsPageHtml(page, c) {
  // Visual QA pass fix: this row's date was rendered as the raw ISO
  // string ("2026-12-10") while the invitation page's own date already
  // goes through formatPdfDate ("12 December 2026") — found via a visual
  // Playwright render of the actual generated PDF HTML, inconsistent
  // formatting within one document.
  const rows = (page.rows || []).map((r) => `
      <div class="row">
        <span class="rowTitle">${escapeHtml(r.title)}</span>
        <span class="rowMeta">${escapeHtml([formatPdfDate(r.date), r.time].filter(Boolean).join(' · '))}</span>
      </div>`).join('');
  return `
    <div class="page listPage">
      <div class="kicker">${escapeHtml(page.kicker)}</div>
      ${rows}
    </div>`;
}

function renderTravelStayPageHtml(page, c) {
  return `
    <div class="page listPage">
      <div class="kicker">${escapeHtml(page.kicker)}</div>
      ${page.travelNote ? `<div class="note"><strong>Travel</strong><br/>${escapeHtml(page.travelNote)}</div>` : ''}
      ${page.stayNote ? `<div class="note"><strong>Stay</strong><br/>${escapeHtml(page.stayNote)}</div>` : ''}
    </div>`;
}

// pdfPageModels: buildPdfPageModels()'s return value. tokens: the same
// selected variant's tokens StaticInviteCard.js renders with, so the PDF's
// colours match the on-screen static card. Returns a complete HTML
// document ready for Print.printToFileAsync({ html }).
export function buildPdfHtml({ pdfPageModels, tokens } = {}) {
  const c = tokens?.colors || { bg: '#FFFFFF', ink: '#1A1A1A', accent: '#B8862F', dim: '#888888', line: '#EEEEEE' };
  const pages = pdfPageModels?.pages || [];

  const pagesHtml = pages.map((page) => {
    if (page.kind === 'invitation') return renderInvitationPageHtml(page.layout, c);
    if (page.kind === 'functions') return renderFunctionsPageHtml(page, c);
    if (page.kind === 'travel-stay') return renderTravelStayPageHtml(page, c);
    return '';
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; }
  .page {
    position: relative;
    width: 100%; min-height: 100vh; padding: 60px 48px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    background: ${c.bg}; color: ${c.ink};
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .photo { object-fit: cover; margin-bottom: 20px; }
  .photo-hero { width: 100%; max-width: 460px; height: 240px; border-radius: 10px; }
  .photo-portrait { width: 260px; height: 320px; border-radius: 10px; }
  .photo-circle { width: 200px; height: 200px; border-radius: 100px; }
  .photo-arch { width: 280px; height: 320px; border-radius: 140px 140px 10px 10px; }
  .symbol { font-size: 15px; color: ${c.accent}; margin-bottom: 6px; }
  .kicker { font-size: 13px; letter-spacing: 3px; color: ${c.accent}; margin-top: 12px; }
  .hostLine { font-size: 12px; letter-spacing: 0.5px; color: ${c.dim}; margin-top: 10px; }
  .names { font-family: 'Palatino Linotype', Georgia, serif; font-size: 40px; margin-top: 14px; }
  .secondary { font-size: 13px; color: ${c.dim}; margin-top: 12px; max-width: 420px; }
  .hairline { width: 160px; height: 1px; background: ${c.line}; margin: 22px 0; }
  .date { font-size: 14px; letter-spacing: 2px; }
  .venue { font-size: 13px; color: ${c.dim}; margin-top: 8px; max-width: 420px; }
  .attribution { position: absolute; bottom: 32px; font-size: 10px; letter-spacing: 0.4px; color: ${c.dim}; }
  .listPage { align-items: stretch; text-align: left; }
  .listPage .kicker { text-align: center; margin-bottom: 24px; }
  .row { display: flex; justify-content: space-between; border-bottom: 1px solid ${c.line}; padding: 10px 0; font-size: 14px; }
  .rowTitle { font-weight: 700; }
  .rowMeta { color: ${c.dim}; }
  .note { font-size: 13.5px; line-height: 1.6; margin-bottom: 18px; }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}
