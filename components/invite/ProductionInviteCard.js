import ToranCoverCard from './ToranCoverCard';
import StillnessCard from './StillnessCard';
import StaticInviteCard from '../inviteArchetypes/StaticInviteCard';
import ImageTemplateCard from './ImageTemplateCard';
import { mapToToranCoverCardProps, mapToStillnessCardProps } from '../../lib/inviteContentAdapter';
import { parseProductionDesign, isValidArchetypeSelection, isValidImageSelection } from '../../lib/inviteProductionDesign';
import { buildPresentationContent } from '../../lib/invitePresentationModel';
import { buildStaticLayoutModel } from '../../lib/staticInviteLayout';
import { getVariant } from '../../lib/inviteDesignArchetypes';
import { isNonFestive } from '../../lib/inviteSchemas';
import { getKidsBirthdayInviteOptions } from '../../lib/kidsBirthdayThemes';
import { getKidsBirthdayImageIdeaById } from '../../lib/kidsBirthdayImageIdeas';

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
export default function ProductionInviteCard({ templateId, eventTypeSlug, values, event, functions = [], featuredActivities = [] }) {
  const parsed = parseProductionDesign(templateId);

  if (parsed.kind === 'legacy') {
    if (parsed.legacyDesignId === 'stillness') {
      return <StillnessCard {...mapToStillnessCardProps(values)} />;
    }
    return <ToranCoverCard {...mapToToranCoverCardProps(parsed.legacyDesignId, values, event)} />;
  }

  if (parsed.kind === 'image') {
    // Kids Birthday Image Template pilot (Sept 17) — a real illustrated
    // per-theme image with the actual event's text painted on top (see
    // components/invite/ImageTemplateCard.js). Same defensive fallback
    // discipline as the archetype branch below: a corrupted/unknown
    // image:<themeSlug>:<ideaId> string must never render blank — falls
    // back to the same safe legacy design every other invite uses.
    const idea = getKidsBirthdayImageIdeaById(parsed.themeSlug, parsed.ideaId);
    if (!isValidImageSelection(parsed.themeSlug, parsed.ideaId) || !idea) {
      return <ToranCoverCard {...mapToToranCoverCardProps('toran', values, event)} />;
    }
    const presentation = buildPresentationContent({ eventTypeSlug, values, event, functions, featuredActivities });
    return <ImageTemplateCard idea={idea} values={values} event={event} primaryVenue={presentation.primaryVenue} />;
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
    const presentation = buildPresentationContent({ eventTypeSlug, values, event, functions, featuredActivities });
    const effectiveValues = { ...values, invocationText: presentation.invocationText };
    const effectiveEvent = { ...event, venue: presentation.primaryVenue };
    // Kids Birthday Theme-Aware Invite Designer — resolved once, up front,
    // so both the accent-colour override (tokens, below) and the
    // decoration icon badge (layoutModel, below) come from exactly the
    // same theme resolution — never two independent lookups that could
    // disagree with each other on reload.
    const kbOptions = (eventTypeSlug === 'kids-birthday' && event?.theme_slug)
      ? getKidsBirthdayInviteOptions(event.theme_slug, event.theme_palette)
      : null;

    const layoutModel = buildStaticLayoutModel({
      archetypeId: parsed.archetypeId, variantId: parsed.variantId,
      event: effectiveEvent, values: effectiveValues, eventTypeSlug,
      isNonFestive: false, qrTargetUrl: null, photoUrl: presentation.heroPhotoUrl,
      // A single representative icon (the theme's own icon set, position
      // 0) rendered via StaticInviteCard's existing icon-badge slot — see
      // that component's own comment for why this alone (combined with
      // the accent colour below) is enough for two themes sharing an
      // archetype/variant to read as visually distinct designs, without
      // forking the renderer or building a bespoke component per theme.
      decorationIcon: kbOptions?.icons?.[0] || null,
    });

    // A real per-theme accent colour layered on top of the chosen
    // archetype/variant's own frozen tokens, never replacing them
    // wholesale (see lib/kidsBirthdayThemes.js's header for why this
    // doesn't fork the renderer). Reads event.theme_slug/theme_palette —
    // the same real, already-persisted Plan-screen fields
    // (supabase/migrations/20260913010000_event_theme_palette.sql) — there
    // is no separate, invite-side theme store to keep in sync.
    //
    // Also overrides `line` (StaticInviteCard.js's Motif/HairRule color),
    // not just `accent` — found via visual QA that `accent` alone is
    // invisible on a kids-birthday card: it's only ever applied to the
    // symbol/kicker/connector text slots, none of which kids-birthday
    // content populates. `line` drives the big decorative motif art and
    // the hairline rule, which DO always render, so this is what actually
    // makes the per-theme colour visible. `bg`/`ink`/`dim`/`dateColor`
    // stay untouched — those are tuned for text contrast against the
    // variant's own fixed background and overriding them risks an
    // unreadable card, which a decorative line/motif color never does.
    let tokens = variant.tokens;
    if (kbOptions?.accentOverride) {
      const accent = kbOptions.accentOverride;
      tokens = {
        ...variant.tokens,
        colors: { ...variant.tokens.colors, accent, line: accent },
        semantic: {
          ...variant.tokens.semantic,
          accent, accentSoft: `${accent}33`,
          divider: accent, utilityBorder: accent, decorativeStroke: accent,
        },
      };
    }
    return <StaticInviteCard layoutModel={layoutModel} tokens={tokens} />;
  }

  return null;
}
