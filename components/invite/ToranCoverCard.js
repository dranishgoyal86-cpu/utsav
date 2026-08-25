import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TornArch from './motifs/TornArch';
import HairRule from './motifs/HairRule';
import { KalamkariFrame } from './motifs/Bloom';
import { resolveTheme } from '../../lib/inviteThemes';

// Native equivalent of the marketing site's cover components — same
// palettes (via inviteThemes, not re-hardcoded here), same text roles,
// same names-slot logic (two names + connector, single name, or eventName
// fallback), so a screenshot of this and the live guest page read as the
// same design. Static capture target for react-native-view-shot, same as
// every other card this app already screenshots for sharing.
//
// Wave 5: branches on `design` (Toran's original arch layout vs
// Kalamkari's double-border frame) — colours/connector/kicker text all
// come from inviteThemes, nothing hardcoded per-design in this file except
// the two structural layouts themselves (they're genuinely different
// shapes, not just different colours of the same shape).
export default function ToranCoverCard({
  design = 'toran',
  eventName,
  eventDate,
  venue,
  partner1Name,
  partner2Name,
  hostedBy,
}) {
  const theme = resolveTheme(design);
  const twoNames = !!(partner1Name && partner2Name);
  const singleName = partner1Name && !partner2Name ? partner1Name : !partner1Name ? eventName : null;
  const dateText = formatDate(eventDate);

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
});
