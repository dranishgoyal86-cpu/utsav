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

function buildPrimaryNames(values) {
  if (!values) return null;
  if (values.partner1Name || values.partner2Name) {
    return { mode: 'couple', name1: values.partner1Name || '', name2: values.partner2Name || '' };
  }
  if (values.subjectNameLine1) {
    return { mode: 'subject', line1: values.subjectNameLine1, line2: values.subjectNameLine2 || '' };
  }
  if (values.celebrantName) return { mode: 'single', name: values.celebrantName };
  if (values.childName) return { mode: 'single', name: values.childName };
  return null;
}

// event: a plain { name, event_date, event_time, venue } shape (the same
// fields ToranCoverCard.js already reads off the real events row — no new
// canonical field required). qrTargetUrl: the real guest-facing link this
// card should gateway to (a guest_passes.pass_code-based URL, resolved by
// the caller — this file has no Supabase access and doesn't know it).
export function buildStaticLayoutModel({ archetypeId, variantId, event, values, isNonFestive = false, qrTargetUrl = null } = {}) {
  const archetype = getArchetype(archetypeId);
  const variant = getVariant(variantId);
  const attribution = resolveBrandAttribution({ isNonFestive, surface: 'static' });

  const slots = {
    [STATIC_SLOT.DECORATION]: { motif: variant?.tokens?.motif || null },
    // Host-selected content only — never auto-inserted, matching every
    // religious-content field's own rule throughout lib/inviteSchemas.
    [STATIC_SLOT.SYMBOL]: values?.invocationText ? { text: values.invocationText } : null,
    [STATIC_SLOT.KICKER]: values?.kickerText || null,
    [STATIC_SLOT.HEADLINE]: values?.headlineText || event?.name || null,
    [STATIC_SLOT.PRIMARY_NAMES]: buildPrimaryNames(values),
    [STATIC_SLOT.HOST_LINE]: values?.hostedBy || null,
    [STATIC_SLOT.DATE_TIME]: { date: event?.event_date || null, time: event?.event_time || null },
    [STATIC_SLOT.VENUE]: event?.venue || null,
    // Deliberately sparse — the brief's own rule: "Do NOT overcrowd the
    // static card with all travel/stay/RSVP data. The static card is the
    // invitation + gateway," not the full guest portal.
    [STATIC_SLOT.SECONDARY_DETAIL]: values?.coupleQuote || values?.tagline || null,
    [STATIC_SLOT.QR_FOOTER]: qrTargetUrl ? { url: qrTargetUrl } : null,
    // Mandatory, injected by the branding policy layer — never something
    // an archetype/variant can override or omit (see
    // lib/inviteBrandingPolicy.js's resolveBrandAttribution()).
    [STATIC_SLOT.ATTRIBUTION]: attribution.staticLine,
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
