import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { inviteThemes } from '../../lib/inviteThemes';

// Wave 6 — deliberately its own component, not a third branch inside
// ToranCoverCard. Stillness is a different page (single motionless card,
// different fields entirely — a name and years, not two partner names),
// not a third palette flowing through the wedding-card template. No
// gradient, no motif SVG, no animation of any kind — static from render.
function formatFunctionDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StillnessCard({
  nameLine1,
  nameLine2,
  years,
  detailLine1,
  detailLine2,
  // Wave 11 — set only when this is one function's own card within an
  // event whose overall design is already Stillness. Subject (name/years)
  // never changes per function; only which occasion and its real
  // date/time do.
  functionName,
  functionDate,
  functionTime,
}) {
  const theme = inviteThemes.stillness;
  const isFunctionCard = !!functionName;
  const detail1 = isFunctionCard ? formatFunctionDate(functionDate) : detailLine1;
  const detail2 = isFunctionCard ? functionTime : detailLine2;

  return (
    <View style={[s.card, { backgroundColor: theme.colors.bg }]}>
      <Svg width={48} height={2} viewBox="0 0 48 2">
        <Line x1={0} y1={1} x2={48} y2={1} stroke={theme.colors.line} strokeWidth={1} />
      </Svg>

      <Text style={[s.kicker, { color: theme.colors.dim }]}>{theme.kicker}</Text>

      <View style={s.nameWrap}>
        {nameLine1 ? <Text style={[s.name, { color: theme.colors.ink }]}>{nameLine1}</Text> : null}
        {nameLine2 ? <Text style={[s.name, { color: theme.colors.ink }]}>{nameLine2}</Text> : null}
      </View>

      {years ? <Text style={[s.years, { color: theme.colors.dim }]}>{years}</Text> : null}

      {isFunctionCard ? (
        <Text style={[s.functionName, { color: theme.colors.dim }]}>{functionName.toUpperCase()}</Text>
      ) : null}

      <Svg width={120} height={2} viewBox="0 0 120 2" style={{ marginTop: 24, marginBottom: 20 }}>
        <Line x1={0} y1={1} x2={120} y2={1} stroke={theme.colors.soft} strokeWidth={0.8} />
      </Svg>

      {detail1 ? <Text style={[s.detail1, { color: theme.colors.body }]}>{detail1}</Text> : null}
      {detail2 ? <Text style={[s.detail2, { color: theme.colors.dim }]}>{detail2}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: 320, aspectRatio: 4 / 5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, borderRadius: 6, overflow: 'hidden' },
  kicker: { fontFamily: 'Manrope-SemiBold', fontSize: 9, letterSpacing: 5, marginTop: 18, textAlign: 'center' },
  nameWrap: { marginTop: 22, alignItems: 'center' },
  name: { fontFamily: 'CormorantGaramond-Regular', fontSize: 26, textAlign: 'center', lineHeight: 32 },
  years: { fontFamily: 'Manrope-Regular', fontSize: 10.5, letterSpacing: 1.6, marginTop: 10, textAlign: 'center' },
  functionName: { fontFamily: 'Manrope-SemiBold', fontSize: 9, letterSpacing: 3, marginTop: 14, textAlign: 'center' },
  detail1: { fontFamily: 'Manrope-Regular', fontSize: 10.5, letterSpacing: 1.4, textAlign: 'center' },
  detail2: { fontFamily: 'Manrope-Regular', fontSize: 9.5, letterSpacing: 1.2, marginTop: 6, textAlign: 'center' },
});
