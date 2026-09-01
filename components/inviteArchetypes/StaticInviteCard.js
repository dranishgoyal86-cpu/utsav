import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TornArch from '../invite/motifs/TornArch';
import Jharokha from '../invite/motifs/Jharokha';
import Mandala from '../invite/motifs/Mandala';
import HairRule from '../invite/motifs/HairRule';

// Renders a static-layout model (lib/staticInviteLayout.js's
// buildStaticLayoutModel output) into an actual 4:5 card — a REAL
// compositional layout, not a screenshot of the web page (the brief's own
// explicit rule). Targets the same 1080x1350 primary format the model
// declares, scaled down to a screen-sized 324x405 box here (same pattern
// components/invite/ToranCoverCard.js already uses at 320x400 — this
// component is capturable via react-native-view-shot exactly the same
// way for a real WhatsApp-share pipeline, not wired to one this wave).
//
// `tokens` comes from the selected variant (lib/inviteDesignArchetypes'
// getVariant(variantId).tokens) — this component never looks up a variant
// itself, keeping it a pure presentational renderer like ToranCoverCard.js.
function Motif({ motifId, color, width }) {
  if (motifId === 'toran-arch') return <TornArch width={width} height={100} color={color} />;
  if (motifId === 'jharokha') return <Jharokha width={width} height={90} color={color} />;
  if (motifId === 'mandala') return <Mandala size={80} color={color} />;
  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

export default function StaticInviteCard({ layoutModel, tokens }) {
  if (!layoutModel || !tokens) return null;
  const { slots } = layoutModel;
  const c = tokens.colors;

  const content = (
    <>
      <View style={s.motifWrap}>
        <Motif motifId={slots.decoration?.motif} color={c.line} width={280} />
      </View>

      {/* Symbol/invocation slot — host-selected content only (see
          lib/staticInviteLayout.js's own comment), rendered only when
          real invocation text exists, never a default/auto-inserted
          shloka. */}
      {slots.symbol ? (
        <Text style={[s.symbol, { color: c.accent, fontFamily: tokens.fonts.kicker }]} numberOfLines={2}>
          {slots.symbol.text}
        </Text>
      ) : null}

      {slots.kicker ? (
        <Text style={[s.kicker, { color: c.accent, fontFamily: tokens.fonts.kicker }]}>{slots.kicker.toUpperCase()}</Text>
      ) : null}

      {slots.hostLine ? <Text style={[s.hostLine, { color: c.dim, fontFamily: tokens.fonts.body }]}>{slots.hostLine}</Text> : null}

      {slots.primaryNames?.mode === 'couple' ? (
        <>
          <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.name1}</Text>
          {slots.primaryNames.name2 ? (
            <>
              <Text style={[s.connector, { color: c.accent, fontFamily: tokens.fonts.headline }]}>weds</Text>
              <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.name2}</Text>
            </>
          ) : null}
        </>
      ) : slots.primaryNames?.mode === 'subject' ? (
        <>
          <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.line1}</Text>
          {slots.primaryNames.line2 ? <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.line2}</Text> : null}
        </>
      ) : slots.primaryNames?.mode === 'single' ? (
        <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.primaryNames.name}</Text>
      ) : slots.headline ? (
        <Text style={[s.name, { color: c.ink, fontFamily: tokens.fonts.headline }]}>{slots.headline}</Text>
      ) : null}

      {slots.secondaryDetail ? (
        <Text style={[s.secondary, { color: c.dim, fontFamily: tokens.fonts.body }]} numberOfLines={2}>{slots.secondaryDetail}</Text>
      ) : null}

      <View style={s.hairlineWrap}>
        <HairRule width={140} color={c.line} />
      </View>

      {slots.dateTime?.date ? <Text style={[s.date, { color: c.dateColor, fontFamily: tokens.fonts.body }]}>{formatDate(slots.dateTime.date)}</Text> : null}
      {slots.venue ? <Text style={[s.venue, { color: c.dim, fontFamily: tokens.fonts.body }]} numberOfLines={2}>{slots.venue}</Text> : null}

      <View style={s.footerWrap}>
        {slots.qrFooter?.url ? <View style={[s.qrPlaceholder, { borderColor: c.line }]} /> : null}
        {/* Mandatory attribution — sourced entirely from the layout
            model's attribution slot (lib/inviteBrandingPolicy.js), never
            authored by this component or overridable per archetype. */}
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
  card: { width: 324, aspectRatio: 4 / 5, alignItems: 'center', paddingTop: 22, paddingHorizontal: 18, borderRadius: 6, overflow: 'hidden' },
  motifWrap: { marginBottom: 6, alignItems: 'center' },
  symbol: { fontSize: 11, marginTop: 4, marginBottom: 4, textAlign: 'center' },
  kicker: { fontSize: 9.5, letterSpacing: 3, marginTop: 10, textAlign: 'center' },
  hostLine: { fontSize: 9, letterSpacing: 0.5, marginTop: 8, textAlign: 'center' },
  name: { fontSize: 32, marginTop: 8, textAlign: 'center' },
  connector: { fontSize: 15, marginTop: 2, fontStyle: 'italic' },
  secondary: { fontSize: 10, marginTop: 8, textAlign: 'center', paddingHorizontal: 10 },
  hairlineWrap: { marginTop: 16, marginBottom: 10 },
  date: { fontSize: 10.5, letterSpacing: 2, textAlign: 'center' },
  venue: { fontSize: 9.5, letterSpacing: 0.6, marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  footerWrap: { marginTop: 'auto', marginBottom: 16, alignItems: 'center' },
  qrPlaceholder: { width: 40, height: 40, borderWidth: 1, borderRadius: 4, marginBottom: 6 },
  attribution: { fontSize: 8, letterSpacing: 0.4 },
});
