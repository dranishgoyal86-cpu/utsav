import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TornArch from '../invite/motifs/TornArch';
import Jharokha from '../invite/motifs/Jharokha';
import Mandala from '../invite/motifs/Mandala';
import HairRule from '../invite/motifs/HairRule';
import Botanical from '../invite/motifs/Botanical';
import Stars from '../invite/motifs/Stars';
import Confetti from '../invite/motifs/Confetti';
import StorybookFrame from '../invite/motifs/StorybookFrame';

// Renders a static-layout model (lib/staticInviteLayout.js's
// buildStaticLayoutModel output) into an actual 4:5 card — a REAL
// compositional layout, not a screenshot. Targets 1080x1350, scaled down
// to a 324x405 box (same pattern as ToranCoverCard.js at 320x400, capturable
// via react-native-view-shot the same way). `tokens` is the selected
// variant's tokens; this component never looks one up itself.
function Motif({ motifId, color, width }) {
  if (motifId === 'toran-arch') return <TornArch width={width} height={100} color={color} />;
  if (motifId === 'jharokha') return <Jharokha width={width} height={90} color={color} />;
  if (motifId === 'mandala') return <Mandala size={80} color={color} />;
  if (motifId === 'botanical') return <Botanical width={width} height={90} color={color} />;
  if (motifId === 'stars') return <Stars width={width} height={90} color={color} />;
  if (motifId === 'confetti') return <Confetti width={width} height={70} color={color} />;
  if (motifId === 'storybook') return <StorybookFrame width={width} height={90} color={color} />;
  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

// Height-budget-aware compaction — the static card is a FIXED 4:5 box
// (1080x1350 in the real target size, scaled down to 324x405 here), so it
// cannot grow to fit more content the way a scrolling web page can. Found
// via this wave's Visual QA + Production Polish Pass (Playwright): several
// realistic "rich" combinations (invocation text + host line + a quote +
// a long venue, sometimes on top of a photo) silently clipped past the
// card's `overflow: hidden` edge — including the MANDATORY branding
// footer. Rather than truncating a name or letting the footer disappear,
// every extra optional slot actually present nudges spacing/name size a
// little tighter, so the fixed box still holds everything. A light-content
// card (few optional slots) is untouched — compaction is 0 and nothing
// shrinks.
function computeCompaction(slots, hasPhoto) {
  let score = 0;
  if (slots.symbol) score++;
  if (slots.hostLine) score++;
  if (slots.secondaryDetail) score++;
  if (hasPhoto) score++;
  const twoLineNames = (slots.primaryNames?.mode === 'couple' && !!slots.primaryNames.name2)
    || (slots.primaryNames?.mode === 'subject' && !!slots.primaryNames.line2);
  if (twoLineNames) score++;
  return Math.min(score, 5); // 0 (roomy) .. 5 (very tight)
}

// The single longest name/line string that will render at the big
// `name` style — used to shrink the font BEFORE render rather than
// relying on `adjustsFontSizeToFit`. Found via Playwright: RN's
// adjustsFontSizeToFit does not reliably auto-shrink on react-native-web
// (only `numberOfLines` actually clips there), so a genuinely long single
// name (not just "two names stacked", which computeCompaction already
// handles) could still overflow its 2-line box and get cut mid-word —
// confirmed on a 37-character second name at Fraunces-SemiBold, a wider
// face than the Cormorant Garamond default that had happened to fit.
function longestPrimaryNameChars(primaryNames) {
  if (!primaryNames) return 0;
  const candidates = primaryNames.mode === 'couple' ? [primaryNames.name1, primaryNames.name2]
    : primaryNames.mode === 'subject' ? [primaryNames.line1, primaryNames.line2]
    : primaryNames.mode === 'single' ? [primaryNames.name]
    : [];
  return Math.max(0, ...candidates.filter(Boolean).map((s) => s.length));
}

// Photo-crop treatment — used only by layouts that declare a photo slot
// (split-photo, photo-editorial). 'hero' fills a wide banner (object-fit
// cover, no stretching), 'portrait' a tall panel, 'circle' a round framed
// portrait (Botanical Romance's split-photo look), 'arch' a rounded-top
// panel (a restrained nod to the jharokha/arch motif family without
// depending on it). Never stretches — always resizeMode="cover" so the
// source photo's aspect ratio is preserved and simply cropped to fit.
function PhotoSlot({ uri, style, shape = 'hero', compaction = 0 }) {
  if (!uri) return null;
  const shapeStyle = shape === 'circle' ? s.photoCircle
    : shape === 'portrait' ? s.photoPortrait
    : shape === 'arch' ? s.photoArch
    : s.photoHero;
  // The photo itself also shrinks a little further under heavy text load
  // (found alongside the same overflow this pass fixed via
  // computeCompaction) — never below ~70% of its base size, so it stays a
  // clear focal point rather than shrinking to nothing.
  const scale = 1 - compaction * 0.06;
  return <Image source={{ uri }} resizeMode="cover" style={[shapeStyle, { width: shapeStyle.width * scale, height: shapeStyle.height * scale }, style]} />;
}

export default function StaticInviteCard({ layoutModel, tokens }) {
  if (!layoutModel || !tokens) return null;
  const { slots } = layoutModel;
  const c = tokens.colors;
  const hasPhoto = !!slots.photo?.url;
  const compaction = computeCompaction(slots, hasPhoto);
  // A photo IS the card's decorative focal point when present — showing
  // both a photo and a full decorative motif on a small fixed card is
  // redundant and, per this pass's Playwright findings, was the single
  // biggest cause of clipped content. The motif still renders on its own
  // for every archetype/variant that has no photo, unchanged.
  const showMotif = !hasPhoto;
  // Length-based shrink is deterministic (character count), not relying
  // on the browser to auto-fit — see longestPrimaryNameChars()'s comment.
  const longestNameChars = slots.primaryNames ? longestPrimaryNameChars(slots.primaryNames) : (slots.headline?.length || 0);
  const lengthPenalty = longestNameChars > 20 ? Math.min(10, Math.floor((longestNameChars - 20) * 0.45)) : 0;
  const nameFontSize = Math.max(14, 32 - compaction * 2 - lengthPenalty); // 32 (roomy, short name) down to a 14px floor (very tight, very long name)
  const spacingScale = 1 - compaction * 0.08; // 1.0 down to 0.6

  const content = (
    <>
      {hasPhoto ? (
        <View style={[s.photoWrap, { marginBottom: 8 * spacingScale }]}>
          <PhotoSlot uri={slots.photo.url} shape={slots.photo.shape} compaction={compaction} />
        </View>
      ) : null}

      {showMotif ? (
        <View style={s.motifWrap}>
          <Motif motifId={slots.decoration?.motif} color={c.line} width={280} />
        </View>
      ) : null}

      {/* Theme-pack icon badge (kids-birthday only, e.g. 🏏 for Sports,
          🚀 for Space) — small and corner-positioned so it never competes
          with the vertical text budget computeCompaction() manages.
          Themes whose motif is intentionally shared (Sports/Generic
          Celebration both use the confetti motif, to avoid any
          sport-specific/trademarked iconography) still read as distinct
          designs because of this badge + their different accent colour. */}
      {slots.decoration?.icon ? (
        <View style={s.iconBadge}>
          <Text style={s.iconBadgeText}>{slots.decoration.icon}</Text>
        </View>
      ) : null}

      {/* Symbol/invocation slot — host-selected content only (see
          lib/staticInviteLayout.js's own comment), rendered only when
          real invocation text exists, never a default/auto-inserted
          shloka. */}
      {slots.symbol ? (
        <Text style={[s.symbol, { color: c.accent, fontFamily: tokens.fonts.kicker, marginTop: 4 * spacingScale, marginBottom: 4 * spacingScale }]} numberOfLines={2}>
          {slots.symbol.text}
        </Text>
      ) : null}

      {slots.kicker ? (
        <Text style={[s.kicker, { color: c.accent, fontFamily: tokens.fonts.kicker, marginTop: 10 * spacingScale }]}>{slots.kicker.toUpperCase()}</Text>
      ) : null}

      {slots.hostLine ? <Text style={[s.hostLine, { color: c.dim, fontFamily: tokens.fonts.body, marginTop: 8 * spacingScale }]} numberOfLines={2}>{slots.hostLine}</Text> : null}

      {slots.primaryNames?.mode === 'couple' ? (
        <>
          <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.primaryNames.name1}</Text>
          {slots.primaryNames.name2 ? (
            <>
              <Text style={[s.connector, { color: c.accent, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.connector || 'weds'}</Text>
              <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.primaryNames.name2}</Text>
            </>
          ) : null}
        </>
      ) : slots.primaryNames?.mode === 'subject' ? (
        <>
          <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.primaryNames.line1}</Text>
          {slots.primaryNames.line2 ? <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.primaryNames.line2}</Text> : null}
        </>
      ) : slots.primaryNames?.mode === 'single' ? (
        <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.primaryNames.name}</Text>
      ) : slots.headline ? (
        <Text style={[s.name, { fontSize: nameFontSize, marginTop: 8 * spacingScale, color: c.ink, fontFamily: tokens.fonts.headline }]} numberOfLines={2} adjustsFontSizeToFit>{slots.headline}</Text>
      ) : null}

      {slots.secondaryDetail ? (
        <Text style={[s.secondary, { color: c.dim, fontFamily: tokens.fonts.body, marginTop: 8 * spacingScale }]} numberOfLines={2}>{slots.secondaryDetail}</Text>
      ) : null}

      <View style={[s.hairlineWrap, { marginTop: 16 * spacingScale, marginBottom: 10 * spacingScale }]}>
        <HairRule width={140} color={c.line} />
      </View>

      {slots.dateTime?.date ? <Text style={[s.date, { color: c.dateColor, fontFamily: tokens.fonts.body }]}>{formatDate(slots.dateTime.date)}</Text> : null}
      {slots.venue ? <Text style={[s.venue, { color: c.dim, fontFamily: tokens.fonts.body, marginTop: 6 * spacingScale }]} numberOfLines={2}>{slots.venue}</Text> : null}

      <View style={[s.footerWrap, { marginBottom: 16 * spacingScale }]}>
        {slots.qrFooter?.url ? <View style={[s.qrPlaceholder, { borderColor: c.line }]} /> : null}
        {/* Mandatory attribution — sourced entirely from the layout
            model's attribution slot (lib/inviteBrandingPolicy.js), never
            authored by this component or overridable per archetype. Its
            wrapper's marginTop stays 'auto' (never compacted away) so it
            is always pinned to the bottom of the card rather than
            drifting — compaction closes the gap ABOVE it instead. */}
        <Text style={[s.attribution, { color: c.dim }]}>{slots.attribution}</Text>
      </View>
    </>
  );

  if (tokens.gradient) {
    return (
      <LinearGradient colors={tokens.gradient} style={s.card}>
        {content}
      </LinearGradient>
    );
  }
  return <View style={[s.card, { backgroundColor: c.bg }]}>{content}</View>;
}

const s = StyleSheet.create({
  card: { width: 324, aspectRatio: 4 / 5, alignItems: 'center', paddingTop: 18, paddingHorizontal: 18, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  iconBadge: { position: 'absolute', top: 14, right: 14, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  iconBadgeText: { fontSize: 14 },
  photoWrap: { alignItems: 'center' },
  // Sized to leave clear, guaranteed room for names/date/venue/footer on
  // the fixed 324x405 card — the original sizes here (found via this
  // wave's Playwright QA pass) routinely pushed the mandatory branding
  // footer, and sometimes the couple's own names, past the card's clipped
  // bottom edge.
  photoHero: { width: 288, height: 110, borderRadius: 8 },
  photoPortrait: { width: 140, height: 150, borderRadius: 8 },
  photoCircle: { width: 100, height: 100, borderRadius: 50 },
  photoArch: { width: 160, height: 140, borderTopLeftRadius: 80, borderTopRightRadius: 80, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  motifWrap: { marginBottom: 6, alignItems: 'center' },
  symbol: { fontSize: 11, marginTop: 4, marginBottom: 4, textAlign: 'center' },
  kicker: { fontSize: 9.5, letterSpacing: 3, marginTop: 10, textAlign: 'center' },
  hostLine: { fontSize: 9, letterSpacing: 0.5, marginTop: 8, textAlign: 'center' },
  name: { textAlign: 'center' }, // fontSize/marginTop always supplied inline (computeCompaction) — no fixed default here
  connector: { fontSize: 15, marginTop: 2, fontStyle: 'italic' },
  secondary: { fontSize: 10, marginTop: 8, textAlign: 'center', paddingHorizontal: 10 },
  hairlineWrap: { marginTop: 16, marginBottom: 10 },
  date: { fontSize: 10.5, letterSpacing: 2, textAlign: 'center' },
  venue: { fontSize: 9.5, letterSpacing: 0.6, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  footerWrap: { marginTop: 'auto', marginBottom: 16, alignItems: 'center' },
  qrPlaceholder: { width: 40, height: 40, borderWidth: 1, borderRadius: 4, marginBottom: 6 },
  attribution: { fontSize: 8, letterSpacing: 0.4 },
});
