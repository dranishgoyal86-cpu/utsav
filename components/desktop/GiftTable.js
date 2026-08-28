import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native';
import { MAROON, GOLD, OK, OK_BG, WAIT_BG, LINE, LINE_SOFT, MUTED, TEXT, CARD, EYEBROW } from '../../lib/desktopTheme';

// Wave 13 — Task 1. Direct extension of the guest-list table pattern:
// same shell, same stat strip / search / sortable table. Columns per the
// brief: guest, gift type/amount, source, reciprocation flag.
//
// Two real, separately-recorded, unsynced sources (confirmed live in
// Wave 12's own investigation, same finding RsvpDashboard.js's gift card
// already documented) — a guest can have a gift_stickers row, an
// event_invitees.gift_type/gift_amount note, both, or neither. Shown as
// two honestly-labeled lines when both exist, never merged into one
// number that could double-count.
function GiftValue({ guest, stickers }) {
  const noted = guest.gift_type ? {
    label: guest.gift_type === 'cash' && guest.gift_amount ? `₹${Number(guest.gift_amount).toLocaleString('en-IN')}` : (guest.gift_note || guest.gift_type),
  } : null;
  const stickerRows = stickers || [];
  if (!noted && stickerRows.length === 0) return <Text style={s.empty}>—</Text>;
  return (
    <View>
      {stickerRows.map((g, i) => (
        <View key={i} style={s.giftRow}>
          <View style={[s.sourcePill, { backgroundColor: WAIT_BG }]}><Text style={[s.sourcePillText, { color: EYEBROW }]}>Sticker</Text></View>
          <Text style={s.giftText}>
            {g.gift_type === 'cash' || g.gift_type === 'upi' ? `₹${(g.amount || 0).toLocaleString('en-IN')}` : (g.item_description || g.gift_type || 'Item')}
          </Text>
        </View>
      ))}
      {noted && (
        <View style={[s.giftRow, stickerRows.length > 0 && { marginTop: 4 }]}>
          <View style={[s.sourcePill, { backgroundColor: OK_BG }]}><Text style={[s.sourcePillText, { color: OK }]}>Noted</Text></View>
          <Text style={s.giftText}>{noted.label}</Text>
        </View>
      )}
    </View>
  );
}

export default function GiftTable({ guests, giftStickersByGuest, onToggleReciprocation }) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // all | sticker | noted

  const withGifts = useMemo(() => guests.filter(g => g.gift_type || (giftStickersByGuest[g.id] || []).length > 0), [guests, giftStickersByGuest]);

  const stats = useMemo(() => {
    const stickerCount = withGifts.filter(g => (giftStickersByGuest[g.id] || []).length > 0).length;
    const notedCount = withGifts.filter(g => g.gift_type).length;
    const cashTotal = withGifts.reduce((sum, g) => {
      const stickerCash = (giftStickersByGuest[g.id] || []).filter(x => x.gift_type === 'cash' || x.gift_type === 'upi').reduce((s2, x) => s2 + (x.amount || 0), 0);
      const notedCash = g.gift_type === 'cash' ? (g.gift_amount || 0) : 0;
      return sum + stickerCash + notedCash;
    }, 0);
    const reciprocated = withGifts.filter(g => g.return_gift_given).length;
    return { total: withGifts.length, stickerCount, notedCount, cashTotal, reciprocated };
  }, [withGifts, giftStickersByGuest]);

  const filtered = useMemo(() => {
    let list = withGifts;
    if (sourceFilter === 'sticker') list = list.filter(g => (giftStickersByGuest[g.id] || []).length > 0);
    if (sourceFilter === 'noted') list = list.filter(g => g.gift_type);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g => (g.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [withGifts, sourceFilter, search, giftStickersByGuest]);

  return (
    <View>
      <View style={s.pagehead}>
        <Text style={s.eyebrow}>{stats.total} gifts recorded · may overlap, not deduped</Text>
        <Text style={s.h1}>Gifts</Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statV}>{stats.total}</Text><Text style={s.statL}>GUESTS WITH GIFTS</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: EYEBROW }]}>{stats.stickerCount}</Text><Text style={s.statL}>VIA GIFT STICKERS</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: OK }]}>{stats.notedCount}</Text><Text style={s.statL}>NOTED ON PROFILE</Text></View>
        <View style={s.stat}><Text style={s.statV}>₹{stats.cashTotal.toLocaleString('en-IN')}</Text><Text style={s.statL}>CASH TOTAL</Text></View>
      </View>

      <View style={s.toolbar}>
        <View style={s.search}>
          <MagnifyingGlass size={15} color={MUTED} style={{ marginRight: 6 }} />
          <TextInput style={s.searchInput} placeholder="Search by guest name…" placeholderTextColor={MUTED} value={search} onChangeText={setSearch} />
        </View>
        <View style={s.chips}>
          {[{ k: 'all', l: 'All' }, { k: 'sticker', l: 'Gift stickers' }, { k: 'noted', l: 'Noted on profile' }].map(c => (
            <TouchableOpacity key={c.k} style={[s.chip, sourceFilter === c.k && s.chipActive]} onPress={() => setSourceFilter(c.k)}>
              <Text style={[s.chipText, sourceFilter === c.k && s.chipTextActive]}>{c.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.tablewrap}>
        <View style={s.headRow}>
          <Text style={[s.headCell, { flex: 2 }]}>Guest</Text>
          <Text style={[s.headCell, { flex: 2.5 }]}>Gift</Text>
          <Text style={[s.headCell, { flex: 1 }]}>Reciprocated</Text>
        </View>
        {filtered.length === 0 ? (
          <Text style={s.emptyRow}>No gifts match this search/filter.</Text>
        ) : filtered.map(g => (
          <View key={g.id} style={s.row}>
            <Text style={[s.name, { flex: 2 }]} numberOfLines={1}>{g.name}</Text>
            <View style={{ flex: 2.5 }}><GiftValue guest={g} stickers={giftStickersByGuest[g.id]} /></View>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => onToggleReciprocation && onToggleReciprocation(g)}>
              <View style={[s.checkbox, g.return_gift_given && s.checkboxActive]} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pagehead: { marginBottom: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: EYEBROW, fontWeight: '700', marginBottom: 4 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, color: MAROON },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 16, padding: 16 },
  statV: { fontFamily: 'Fraunces-SemiBold', fontSize: 24, color: TEXT },
  statL: { fontSize: 10, color: MUTED, marginTop: 6, fontWeight: '700', letterSpacing: 0.3 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: TEXT },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: CARD, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { backgroundColor: MAROON, borderColor: MAROON },
  chipText: { fontSize: 12, fontWeight: '700', color: MUTED },
  chipTextActive: { color: '#fff' },
  tablewrap: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 18, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: LINE_SOFT, borderBottomWidth: 1.5, borderColor: LINE },
  headCell: { fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: MUTED, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: LINE_SOFT },
  name: { fontSize: 13.5, fontWeight: '700', color: TEXT },
  giftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourcePill: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 },
  sourcePillText: { fontSize: 9.5, fontWeight: '700' },
  giftText: { fontSize: 12.5, fontWeight: '600', color: TEXT },
  empty: { fontSize: 12.5, color: MUTED },
  emptyRow: { padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: '#D8C9AE' },
  checkboxActive: { backgroundColor: GOLD, borderColor: GOLD },
});
