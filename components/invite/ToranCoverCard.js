import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TornArch from './motifs/TornArch';
import HairRule from './motifs/HairRule';
import { KalamkariFrame } from './motifs/Bloom';
import { Rangoli, DiyaRow } from './motifs/Diya';
import { resolveTheme } from '../../lib/inviteThemes';

// Native equivalent of the marketing site's cover components — same
// palettes (via inviteThemes, not re-hardcoded here), same text roles,
// same names-slot logic (two names + connector, single name, or eventName
// fallback), so a screenshot of this and the live guest page read as the
// same design. Static capture target for react-native-view-shot, same as
// every other card this app already screenshots for sharing.
//
// Wave 5/8: branches on `design`. Toran (arch) and Kalamkari (bloom) share
// one centred flow (genuinely similar compositions, colours/text differ).
// Wave 8's Ivory (minimal) gets its own return block instead of more
// ternaries threaded through that shared flow — left-aligned, enormous
// type, a date/venue row are a different composition, not a variant of
// the same one.
export default function ToranCoverCard({
  design = 'toran',
  eventName,
  eventDate,
  venue,
  partner1Name,
  partner2Name,
  hostedBy,
  kickerText, // Wave 8: host override for Ivory's kicker; ignored by other designs
  headlineText, // Wave 10: host override for Diya's headline; ignored by other designs
  // Wave 11 — per-function mode. Toran/Kalamkari/Ivory/Stillness keep the
  // couple/subject identity and add these as new content; Diya has no
  // couple to protect, so these instead drive its existing kicker/headline
  // exactly like Night Bloom already does.
  functionName,
  functionDate,
  functionTime,
}) {
  const theme = resolveTheme(design);
  const twoNames = !!(partner1Name && partner2Name);
  const singleName = partner1Name && !partner2Name ? partner1Name : !partner1Name ? eventName : null;
  const isFunctionCard = !!functionName;
  const dateText = isFunctionCard
    ? [functionDate && formatDate(functionDate), functionTime].filter(Boolean).join(' · ')
    : formatDate(eventDate);

  // Wave 10 — Diya, the first non-wedding design. No couple/connector at
  // all (see the reference: "Diya doesn't have a couple") — its own
  // return block, same reasoning as Ivory above: a genuinely different
  // composition (rangoli top, diya row bottom, single headline), not a
  // variant of the arch/bloom flow. Neither the kicker nor the headline
  // ships a fixed default — both fall back to the real name in scope.
  if (theme.motif === 'diya') {
    const kicker = (kickerText || functionName || eventName || '').toUpperCase();
    const headline = headlineText || functionName || eventName;
    return (
      <View style={[s.card, s.diyaCard, { backgroundColor: theme.colors.bg }]}>
        <Rangoli color={theme.colors.accent} />
        <Text style={[s.diyaKicker, { color: theme.colors.accent }]}>{kicker}</Text>
        {hostedBy ? <Text style={[s.hostedBy, { color: theme.colors.dim }]}>{hostedBy}</Text> : null}
        <Text style={[s.diyaHeadline, { color: theme.colors.ink }]}>{headline}</Text>
        <View style={s.hairlineWrap}>
          <HairRule width={140} color={theme.colors.line} />
        </View>
        {dateText ? <Text style={[s.date, { color: theme.colors.dateColor }]}>{dateText}</Text> : null}
        {venue ? <Text style={[s.venue, { color: theme.colors.dim }]}>{venue}</Text> : null}
        <View style={s.diyaRowWrap}>
          <DiyaRow />
        </View>
      </View>
    );
  }

  if (theme.motif === 'minimal') {
    const kicker = kickerText || theme.kicker;
    return (
      <View style={[s.card, s.ivoryCard, { backgroundColor: theme.colors.bg }]}>
        <HairRule width={40} color={theme.colors.accent} />
        <Text style={[s.ivoryKicker, { color: theme.colors.dim }]}>{kicker}</Text>

        {twoNames ? (
          <>
            <Text style={[s.ivoryName, { color: theme.colors.ink }]}>{partner1Name}</Text>
            <Text style={[s.ivoryConnector, { color: theme.colors.ink }]}>{theme.connector}</Text>
            <Text style={[s.ivoryName, { color: theme.colors.ink }]}>{partner2Name}</Text>
          </>
        ) : (
          <Text style={[s.ivoryName, { color: theme.colors.ink }]}>{singleName}</Text>
        )}

        {/* Wave 11 — which function this card is for, when in per-function
            mode. New line, not a replacement of the kicker above. */}
        {isFunctionCard ? (
          <Text style={[s.ivoryFunctionName, { color: theme.colors.accent }]}>{functionName.toUpperCase()}</Text>
        ) : null}

        <View style={s.ivoryDividerWrap}>
          <HairRule width={288} color={theme.colors.line} />
        </View>

        {/* Stacked, not side-by-side — matches the web card's fix after
            live rendering showed the reference's date-left/venue-right
            row colliding with this app's real venue data (full
            addresses, not short names). */}
        {dateText ? <Text style={[s.ivoryDate, { color: theme.colors.dateColor }]}>{dateText}</Text> : null}
        {venue ? <Text style={[s.ivoryVenue, { color: theme.colors.dim }]}>{venue}</Text> : null}
      </View>
    );
  }

  const content = (
    <>
      {theme.motif === 'bloom' ? (
        <View style={s.frameWrap} pointerEvents="none">
          <KalamkariFrame width={320} height={400} lineColor={theme.colors.line} accentColor={theme.colors.accent} />
        </View>
      ) : (
        <View style={s.archWrap}>
          <TornArch width={320} height={112} color={theme.colors.line} />
        </View>
      )}

      <Text
        style={[
          s.kickerText,
          {
            color: theme.colors.accent,
            marginTop: theme.motif === 'bloom' ? 30 : 14,
            fontFamily: theme.motif === 'bloom' ? 'Manrope-SemiBold' : 'TiroDevanagariHindi-Regular',
            letterSpacing: theme.motif === 'bloom' ? 1.6 : 3.6,
          },
        ]}
      >
        {theme.kicker}
      </Text>

      {hostedBy ? <Text style={[s.hostedBy, { color: theme.colors.dim }]}>{hostedBy}</Text> : null}

      {twoNames ? (
        <>
          <Text style={[s.name, { color: theme.colors.ink }]}>{partner1Name}</Text>
          <Text style={[s.connector, { color: theme.colors.accent }]}>{theme.connector}</Text>
          <Text style={[s.name, { color: theme.colors.ink }]}>{partner2Name}</Text>
        </>
      ) : (
        <Text style={[s.name, { color: theme.colors.ink }]}>{singleName}</Text>
      )}

      {/* Wave 11 — which function this card is for, when in per-function
          mode. New line, not a replacement of the Sanskrit/families kicker
          above. */}
      {isFunctionCard ? (
        <Text style={[s.functionNameTag, { color: theme.colors.accent }]}>{functionName.toUpperCase()}</Text>
      ) : null}

      <View style={s.hairlineWrap}>
        <HairRule width={140} color={theme.colors.line} />
      </View>

      {dateText ? <Text style={[s.date, { color: theme.colors.dateColor }]}>{dateText}</Text> : null}
      {venue ? <Text style={[s.venue, { color: theme.colors.dim }]}>{venue}</Text> : null}

      {theme.motif !== 'bloom' && (
        <View style={s.bottomArchWrap}>
          <HairRule width={320} color={theme.colors.line} curve />
        </View>
      )}
    </>
  );

  if (theme.gradient) {
    return (
      <LinearGradient colors={theme.gradient} style={s.card}>
        {content}
      </LinearGradient>
    );
  }
  return <View style={[s.card, { backgroundColor: theme.colors.bg }]}>{content}</View>;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

const s = StyleSheet.create({
  card: { width: 320, aspectRatio: 4 / 5, alignItems: 'center', paddingTop: 24, paddingHorizontal: 16, borderRadius: 6, overflow: 'hidden' },
  archWrap: { marginBottom: 4 },
  frameWrap: { position: 'absolute', top: 0, left: 0 },
  kickerText: { fontSize: 9, marginTop: 14, textAlign: 'center' },
  hostedBy: { fontFamily: 'Manrope-Regular', fontSize: 8.5, letterSpacing: 0.6, marginTop: 10, textAlign: 'center' },
  name: { fontFamily: 'CormorantGaramond-SemiBold', fontSize: 34, marginTop: 10, textAlign: 'center' },
  connector: { fontFamily: 'CormorantGaramond-Italic', fontSize: 16, marginTop: 2 },
  hairlineWrap: { marginTop: 18, marginBottom: 12 },
  date: { fontFamily: 'Manrope-SemiBold', fontSize: 10.5, letterSpacing: 2, textAlign: 'center' },
  venue: { fontFamily: 'Manrope-Regular', fontSize: 9.5, letterSpacing: 1, marginTop: 6, textAlign: 'center' },
  bottomArchWrap: { marginTop: 'auto', marginBottom: 20 },

  // Wave 8 — Ivory. Left-aligned (opts out of s.card's centred
  // alignItems), enormous type is the entire visual statement per the
  // reference — generous empty space, no motif, no border.
  ivoryCard: { alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 16 },
  ivoryKicker: { fontFamily: 'Manrope-SemiBold', fontSize: 9.5, letterSpacing: 4.5, marginTop: 14, textTransform: 'uppercase' },
  ivoryName: { fontFamily: 'Fraunces-SemiBold', fontSize: 32, letterSpacing: -1.3, marginTop: 8, lineHeight: 38 },
  ivoryConnector: { fontFamily: 'Fraunces-LightItalic', fontSize: 15, marginTop: 2, marginBottom: 2 },
  ivoryDividerWrap: { marginTop: 22, marginBottom: 14 },
  ivoryDate: { fontFamily: 'Manrope-SemiBold', fontSize: 10.5, letterSpacing: 1.2 },
  ivoryVenue: { fontFamily: 'Manrope-Regular', fontSize: 10, letterSpacing: 1, marginTop: 6, flexShrink: 1 },

  // Wave 10 — Diya. Centred like Toran/Kalamkari (s.card's default
  // alignItems), but its own headline/kicker sizing — no name/connector
  // styles apply here at all.
  diyaCard: { justifyContent: 'flex-start' },
  diyaKicker: { fontFamily: 'Manrope-SemiBold', fontSize: 9, letterSpacing: 3.6, marginTop: 14, textAlign: 'center' },
  diyaHeadline: { fontFamily: 'CormorantGaramond-SemiBold', fontSize: 30, marginTop: 10, textAlign: 'center' },
  diyaRowWrap: { marginTop: 'auto', marginBottom: 18 },

  // Wave 11 — the new "which function" line, per-function mode only.
  functionNameTag: { fontFamily: 'Manrope-SemiBold', fontSize: 10, letterSpacing: 2, marginTop: 8, textAlign: 'center', textTransform: 'uppercase' },
  ivoryFunctionName: { fontFamily: 'Manrope-SemiBold', fontSize: 9.5, letterSpacing: 2, marginTop: 10, textTransform: 'uppercase' },
});
