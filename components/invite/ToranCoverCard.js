import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import TornArch from './motifs/TornArch';
import HairRule from './motifs/HairRule';

// Native equivalent of the marketing site's ToranCover.tsx — same palette,
// same text roles, same names-slot logic (two names + weds, single name,
// or eventName fallback), so a screenshot of this and a screenshot of the
// live page read as the same design. expo-linear-gradient is linear, not
// radial like the web version's CSS radial-gradient — an honest visual
// approximation, not a pixel-identical port; flagged rather than pretended.
//
// No animation here (Unveil/Drift are CSS-only on the web page) — this is
// a static capture target for react-native-view-shot, same as every other
// card this app already screenshots for sharing.
export default function ToranCoverCard({
  eventName,
  eventDate,
  venue,
  partner1Name,
  partner2Name,
  hostedBy,
}) {
  const twoNames = !!(partner1Name && partner2Name);
  const singleName = partner1Name && !partner2Name ? partner1Name : !partner1Name ? eventName : null;

  return (
    <LinearGradient
      colors={['#6E1A2E', '#2E0713']}
      style={s.card}
    >
      <View style={s.archWrap}>
        <TornArch width={320} height={112} color="#D4A03C" />
      </View>

      <Text style={s.sanskrit}>श्री गणेशाय नमः</Text>

      {hostedBy ? <Text style={s.hostedBy}>{hostedBy}</Text> : null}

      {twoNames ? (
        <>
          <Text style={s.name}>{partner1Name}</Text>
          <Text style={s.weds}>weds</Text>
          <Text style={s.name}>{partner2Name}</Text>
        </>
      ) : (
        <Text style={s.name}>{singleName}</Text>
      )}

      <View style={s.hairlineWrap}>
        <HairRule width={140} color="#D4A03C" />
      </View>

      {eventDate ? <Text style={s.date}>{formatDate(eventDate)}</Text> : null}
      {venue ? <Text style={s.venue}>{venue}</Text> : null}

      <View style={s.bottomArchWrap}>
        <HairRule width={320} color="#D4A03C" curve />
      </View>
    </LinearGradient>
  );
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
  sanskrit: { fontFamily: 'TiroDevanagariHindi-Regular', fontSize: 9, color: '#D4A03C', letterSpacing: 3.6, marginTop: 14 },
  hostedBy: { fontFamily: 'Manrope-Regular', fontSize: 8.5, color: '#C79A5A', letterSpacing: 0.6, marginTop: 10, textAlign: 'center' },
  name: { fontFamily: 'CormorantGaramond-SemiBold', fontSize: 34, color: '#FFF3DC', marginTop: 10, textAlign: 'center' },
  weds: { fontFamily: 'CormorantGaramond-Italic', fontSize: 16, color: '#D4A03C', marginTop: 2 },
  hairlineWrap: { marginTop: 18, marginBottom: 12 },
  date: { fontFamily: 'Manrope-SemiBold', fontSize: 10.5, color: '#F0DFC2', letterSpacing: 2, textAlign: 'center' },
  venue: { fontFamily: 'Manrope-Regular', fontSize: 9.5, color: '#C79A5A', letterSpacing: 1, marginTop: 6, textAlign: 'center' },
  bottomArchWrap: { marginTop: 'auto', marginBottom: 20 },
});
