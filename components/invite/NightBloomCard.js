import { View, Text, StyleSheet } from 'react-native';

// Wave 9 — Night Bloom, the RN counterpart to the web's NightBloomCard.tsx.
// This is NOT a whole-invite cover like ToranCoverCard/StillnessCard —
// it's a per-function card, so it isn't looked up through inviteThemes/
// resolveTheme() and has its own fixed dark palette, same as the web side.
// Used as GuestList.js's live preview once a host picks Night Bloom for a
// function (Task 4) — mirrors ToranInvites.js's own preview-doubles-as-
// share-target pattern, though this card isn't a share-image capture
// target itself (per-function images aren't part of this app's sharing
// model — see the brief's "no change to the sharing/link model").
//
// Gradient TEXT fill (the kicker, per the reference) needs a masked-view
// library this app doesn't have installed — adding one means a new native
// dependency during a month where EAS builds are already quota-blocked, so
// the kicker renders as a solid colour instead (theme.colors below), a
// real documented deviation rather than a silent downgrade. The divider
// bar CAN use a real gradient (expo-linear-gradient is already installed
// and used elsewhere in this app) so that one detail stays gradient-true.

import { LinearGradient } from 'expo-linear-gradient';

// Exported (Wave 12) so anything needing "the Night Bloom colour" — the
// desktop guest-list's function tags, specifically — reads it from here
// rather than re-hardcoding a second, driftable copy. NB.violet is the
// single representative pick (the gradient's first stop) since Night
// Bloom's real kicker fill is a 3-stop gradient with no one scalar colour.
export const NB = {
  bg: '#0C0A12',
  violet: '#9066FF',
  pink: '#FF4F9E',
  orange: '#FF9A3D',
  ink: '#F5F2FF',
  lav: '#CFC6E8',
  muted: '#8E85AC',
};

const DOTS = [
  { x: '12%', y: '10%', size: 3 },
  { x: '78%', y: '8%', size: 2.6 },
  { x: '90%', y: '30%', size: 3.4 },
  { x: '22%', y: '78%', size: 2.8 },
  { x: '60%', y: '86%', size: 3.6 },
];

function formatFunctionDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
}

function formatFunctionTime(timeStr) {
  if (!timeStr) return '';
  const m = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return timeStr;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${min} ${suffix}`;
}

export default function NightBloomCard({ name, date, time, headlineText }) {
  const headline = headlineText || name;
  const dateLine = formatFunctionDate(date);
  const timeLine = formatFunctionTime(time);

  return (
    <View style={s.card}>
      <View style={[s.glow, s.glow1]} />
      <View style={[s.glow, s.glow2]} />
      {DOTS.map((d, i) => (
        <View key={i} style={[s.dot, { left: d.x, top: d.y, width: d.size, height: d.size, borderRadius: d.size / 2 }]} />
      ))}

      <View style={s.content}>
        <Text style={s.kicker}>{(name || '').toUpperCase()}</Text>
        <LinearGradient
          colors={[NB.violet, NB.pink, NB.orange]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={s.divider}
        />
        <Text style={s.headline}>{headline}</Text>
        {(dateLine || timeLine) ? (
          <View style={s.details}>
            {dateLine ? <Text style={s.detailLine1}>{dateLine}</Text> : null}
            {timeLine ? <Text style={s.detailLine2}>{timeLine}</Text> : null}
          </View>
        ) : null}
        {/* No dress-code line — no real data source for it anywhere in this
            app today, same call as the web side. */}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { width: 320, backgroundColor: NB.bg, borderRadius: 14, overflow: 'hidden' },
  glow: { position: 'absolute', borderRadius: 999 },
  // RN has no radial-gradient primitive without another new dependency —
  // approximated with large, low-opacity solid circles anchored at the
  // same corners the reference's radial glows sit at.
  glow1: { width: 280, height: 280, backgroundColor: NB.violet, opacity: 0.22, left: -90, bottom: -110 },
  glow2: { width: 220, height: 220, backgroundColor: NB.pink, opacity: 0.18, right: -70, top: -80 },
  dot: { position: 'absolute', backgroundColor: '#FFFFFF', opacity: 0.48 },
  content: { padding: 24 },
  kicker: { fontFamily: 'Manrope-SemiBold', fontSize: 10, letterSpacing: 5.5 * 0.1, color: NB.pink },
  divider: { width: 32, height: 2, borderRadius: 1, marginTop: 10, marginBottom: 16 },
  headline: { fontFamily: 'Fraunces-Bold', fontSize: 34, lineHeight: 38, letterSpacing: -1, color: NB.ink },
  details: { marginTop: 18 },
  detailLine1: { fontFamily: 'Manrope-SemiBold', fontSize: 11, letterSpacing: 1.8 * 0.1, color: NB.lav, marginTop: 5 },
  detailLine2: { fontFamily: 'Manrope-Regular', fontSize: 10, letterSpacing: 1.4 * 0.1, color: NB.muted, marginTop: 5 },
});
