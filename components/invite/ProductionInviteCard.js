import ToranCoverCard from './ToranCoverCard';
import StillnessCard from './StillnessCard';
import StaticInviteCard from '../inviteArchetypes/StaticInviteCard';
import { mapToToranCoverCardProps, mapToStillnessCardProps } from '../../lib/inviteContentAdapter';
import { parseProductionDesign, isValidArchetypeSelection } from '../../lib/inviteProductionDesign';
import { buildPresentationContent } from '../../lib/invitePresentationModel';
import { buildStaticLayoutModel } from '../../lib/staticInviteLayout';
import { getVariant } from '../../lib/inviteDesignArchetypes';
import { isNonFestive } from '../../lib/inviteSchemas';

// Production Integration Wave — the ONE real rendering bridge between a
// host's saved template_id (see lib/inviteProductionDesign.js's storage
// contract) and an actual on-screen/capturable card. Used by BOTH the
// mobile designer (ToranInvites.js) and the desktop designer
// (InviteDesignerDesktop.js) — previously each hand-wrote its own
// `isStillness ? <StillnessCard/> : <ToranCoverCard/>` ternary; now there
// is exactly one place that decision is made, and it is the SAME
// StaticInviteCard component proven across 5 QA batches, not a second
// production copy of it.
//
// Legacy selections (toran/kalamkari/ivory/diya/stillness) render
// EXACTLY as before — ToranCoverCard/StillnessCard, unchanged, same
// mapping functions. Every existing saved invite keeps working with zero
// behavior change.
//
// qrTargetUrl is deliberately NOT threaded through from a real per-guest
// pass_code here — this component renders the ONE shared preview/capture
// image every guest's share message links to (see ToranInvites.js's
// sendInvite(), which captures this same preview once and reuses it for
// every guest); baking a specific guest's QR code into that shared image
// would leak one guest's pass into everyone else's share. Matches the
// legacy cards' own behavior (ToranCoverCard/StillnessCard have never had
// a QR slot at all).
export default function ProductionInviteCard({ templateId, eventTypeSlug, values, event, functions = [] }) {
  const parsed = parseProductionDesign(templateId);

  if (parsed.kind === 'legacy') {
    if (parsed.legacyDesignId === 'stillness') {
      return <StillnessCard {...mapToStillnessCardProps(values)} />;
    }
    return <ToranCoverCard {...mapToToranCoverCardProps(parsed.legacyDesignId, values, event)} />;
  }

  if (parsed.kind === 'archetype') {
    // Launch-hardening: a corrupted/unknown archetype:<id>:<variant>
    // string (should never happen via the app's own picker — this guards
    // hand-edited DB rows, a future schema drift, or a variant that gets
    // retired) must never render blank or crash. Fall back to the same
    // safe legacy design every pre-archetype invite already uses — never
    // silently rewrite the stored template_id just because a render
    // encountered an unknown value.
    if (!isValidArchetypeSelection(parsed.archetypeId, parsed.variantId)) {
      const fallbackId = isNonFestive(eventTypeSlug) ? 'stillness' : 'toran';
      if (fallbackId === 'stillness') return <StillnessCard {...mapToStillnessCardProps(values)} />;
      return <ToranCoverCard {...mapToToranCoverCardProps(fallbackId, values, event)} />;
    }
    const variant = getVariant(parsed.variantId);
    const presentation = buildPresentationContent({ eventTypeSlug, values, event, functions });
    const effectiveValues = { ...values, invocationText: presentation.invocationText };
    const effectiveEvent = { ...event, venue: presentation.primaryVenue };
    const layoutModel = buildStaticLayoutModel({
      archetypeId: parsed.archetypeId, variantId: parsed.variantId,
      event: effectiveEvent, values: effectiveValues, eventTypeSlug,
      isNonFestive: false, qrTargetUrl: null, photoUrl: presentation.heroPhotoUrl,
    });
    return <StaticInviteCard layoutModel={layoutModel} tokens={variant.tokens} />;
  }

  return null;
}
