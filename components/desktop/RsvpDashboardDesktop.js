import { View, Text, StyleSheet } from 'react-native';
import { StatCard } from './DesktopKit';
import { functionDesignColor } from '../../lib/functionDesignColors';
import { MAROON, OK, WAIT, NO, MUTED, TEXT, CARD, LINE, EYEBROW } from '../../lib/desktopTheme';

// Wave 13 — Task 3. New pattern: stats + progress, not a table. Per-
// function cards in a grid (comparable at a glance, not one long scroll),
// each progress bar colour-linked to that function's own real assigned
// design via inviteThemes/NightBloomCard (functionDesignColor — the same
// single source of truth the guest-list's function tags already use).
// Falls back to a neutral maroon-ish grey when a function has no design
// assigned (null template_id) — nothing to link to, not a fabricated
// colour.
const FALLBACK_BAR = '#D8C9AE';

function FunctionProgressCard({ fn }) {
  const colors = functionDesignColor(fn.template_id);
  const barColor = colors?.fg || FALLBACK_BAR;
  const pct = fn.total > 0 ? Math.round((fn.yes / fn.total) * 100) : 0;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle} numberOfLines={1}>{fn.name}</Text>
        {colors && <View style={[s.designDot, { backgroundColor: colors.fg }]} />}
      </View>
      <Text style={s.cardMeta}>{fn.total} invited</Text>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <View style={s.legend}>
        <Text style={[s.legendItem, { color: OK }]}>{fn.yes} yes</Text>
        <Text style={[s.legendItem, { color: NO }]}>{fn.no} no</Text>
        <Text style={[s.legendItem, { color: WAIT }]}>{fn.pending} pending</Text>
      </View>
    </View>
  );
}

export default function RsvpDashboardDesktop({ totalInvited, totalResponded, functionRows, stickerCount, stickerTotal, notedCount, notedTotal }) {
  return (
    <View>
      <View style={s.pagehead}>
        <Text style={s.eyebrow}>{functionRows.length} function{functionRows.length === 1 ? '' : 's'}</Text>
        <Text style={s.h1}>RSVP dashboard</Text>
      </View>

      <View style={s.statsRow}>
        <StatCard value={`${totalResponded} / ${totalInvited}`} label="GUESTS RESPONDED" color={MAROON} />
        {(stickerCount > 0 || notedCount > 0) && (
          <View style={s.giftStat}>
            {stickerCount > 0 && (
              <Text style={s.giftLine}>{stickerCount} via Gift Stickers{stickerTotal > 0 ? ` · ₹${stickerTotal.toLocaleString('en-IN')}` : ''}</Text>
            )}
            {notedCount > 0 && (
              <Text style={[s.giftLine, stickerCount > 0 && { marginTop: 4 }]}>{notedCount} noted on profiles{notedTotal > 0 ? ` · ₹${notedTotal.toLocaleString('en-IN')}` : ''}</Text>
            )}
            <Text style={s.giftHint}>Host-only · not visible to guests · may overlap, not deduped</Text>
          </View>
        )}
      </View>

      {functionRows.length === 0 ? (
        <Text style={s.hint}>No functions set up yet for this event.</Text>
      ) : (
        <View style={s.grid}>
          {functionRows.map(fn => <FunctionProgressCard key={fn.id} fn={fn} />)}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pagehead: { marginBottom: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: EYEBROW, fontWeight: '700', marginBottom: 4 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, color: MAROON },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 24, alignItems: 'stretch' },
  giftStat: { flex: 2, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 16, justifyContent: 'center' },
  giftLine: { fontSize: 13, fontWeight: '700', color: TEXT },
  giftHint: { fontSize: 10, color: MUTED, marginTop: 6 },
  hint: { fontSize: 13, color: MUTED },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: { width: 280, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 18, padding: 18 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  cardTitle: { fontFamily: 'Fraunces-SemiBold', fontSize: 17, color: TEXT, flex: 1 },
  designDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
  cardMeta: { fontSize: 11.5, color: MUTED, marginBottom: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#F1EAE0', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  legend: { flexDirection: 'row', gap: 12, marginTop: 12 },
  legendItem: { fontSize: 11.5, fontWeight: '700' },
});
