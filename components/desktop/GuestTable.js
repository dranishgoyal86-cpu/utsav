import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { MagnifyingGlass, CaretUp, CaretDown } from 'phosphor-react-native';
import { resolveGuestPartySize } from '../../helpers';
import { functionDesignColor } from '../../lib/functionDesignColors';

const MAROON = '#5A1526';
const GOLD = '#E8A020';
const OK = '#3E7D45', OK_BG = '#EAF3E9';
const WAIT = '#BD7A1E', WAIT_BG = '#FBF0DC';
const NO = '#B3453A', NO_BG = '#FBEAE7';
const PAGE_SIZE = 15;

function initials(name) {
  return (name || '?').trim().split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// A guest's overall RSVP bucket for the stat strip / status chips — reads
// the same event_invitees.rsvp_status column GuestList.js's own mobile
// filters already read (not a new concept, just reused here).
function rsvpBucket(guest) {
  if (guest.rsvp_status === 'yes') return 'yes';
  if (guest.rsvp_status === 'no') return 'no';
  return 'pending';
}

// Two honest, separate gift sources — see Wave 12's Task 0 finding
// (RsvpDashboard.js's own gift card already established this exact
// two-labeled-lines treatment): gift_stickers (physical sticker scans)
// and event_invitees.gift_type/gift_amount (host-typed on the guest's own
// profile) are real, unsynced, no shared key to dedupe against.
function GiftCell({ guest, stickers }) {
  const noted = guest.gift_type ? {
    label: guest.gift_type === 'cash' && guest.gift_amount ? `₹${Number(guest.gift_amount).toLocaleString('en-IN')}` : (guest.gift_note || guest.gift_type),
  } : null;
  const stickerRows = stickers || [];
  if (!noted && stickerRows.length === 0) return <Text style={s.giftEmpty}>—</Text>;
  return (
    <View>
      {stickerRows.map((g, i) => (
        <Text key={i} style={s.giftLine}>
          <Text style={s.giftSourceTag}>Sticker · </Text>
          {g.gift_type === 'cash' || g.gift_type === 'upi' ? `₹${(g.amount || 0).toLocaleString('en-IN')}` : (g.item_description || g.gift_type || 'Item')}
        </Text>
      ))}
      {noted && (
        <Text style={[s.giftLine, stickerRows.length > 0 && { marginTop: 2 }]}>
          <Text style={s.giftSourceTag}>Noted · </Text>{noted.label}
        </Text>
      )}
    </View>
  );
}

function FunctionTags({ funcIds, eventFunctions }) {
  if (!funcIds || funcIds.length === 0) return <Text style={s.giftEmpty}>—</Text>;
  const funcs = funcIds.map(id => eventFunctions.find(f => f.id === id)).filter(Boolean);
  return (
    <View style={s.tagsWrap}>
      {funcs.map(f => {
        const colors = functionDesignColor(f.template_id);
        return (
          <View key={f.id} style={[s.tag, colors ? { backgroundColor: colors.bg } : { backgroundColor: '#F1EAE0' }]}>
            <Text style={[s.tagText, colors ? { color: colors.fg } : { color: '#8A7B68' }]}>{f.name}</Text>
          </View>
        );
      })}
    </View>
  );
}

function RsvpCell({ guest, funcIds, eventFunctions, functionRsvpMap }) {
  if (!funcIds || funcIds.length === 0) {
    const bucket = rsvpBucket(guest);
    if (bucket === 'yes') return <View style={[s.pill, { backgroundColor: OK_BG }]}><Text style={[s.pillText, { color: OK }]}>Attending</Text></View>;
    if (bucket === 'no') return <View style={[s.pill, { backgroundColor: NO_BG }]}><Text style={[s.pillText, { color: NO }]}>Declined</Text></View>;
    return <View style={[s.pill, { backgroundColor: WAIT_BG }]}><Text style={[s.pillText, { color: WAIT }]}>Awaiting</Text></View>;
  }
  const statuses = funcIds.map(id => (functionRsvpMap[guest.id] || {})[id] || 'pending');
  const yes = statuses.filter(x => x === 'yes').length;
  const no = statuses.filter(x => x === 'no').length;
  const pending = statuses.length - yes - no;
  return (
    <View>
      <View style={s.dotsRow}>
        {statuses.map((st, i) => (
          <View key={i} style={[s.dot, { backgroundColor: st === 'yes' ? OK : st === 'no' ? NO : '#EFE4D2' }]} />
        ))}
      </View>
      <Text style={s.dotsSummary}>
        {yes > 0 ? `${yes} yes` : ''}{yes > 0 && (no > 0 || pending > 0) ? ' · ' : ''}
        {no > 0 ? `${no} no` : ''}{no > 0 && pending > 0 ? ' · ' : ''}
        {pending > 0 ? `${pending} pending` : ''}
      </Text>
    </View>
  );
}

export default function GuestTable({ guests, eventFunctions, guestFunctionMap, functionRsvpMap, giftStickersByGuest, onOpenGuest }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState({});
  const [page, setPage] = useState(0);

  const stats = useMemo(() => {
    const total = guests.length;
    const yes = guests.filter(g => rsvpBucket(g) === 'yes').length;
    const no = guests.filter(g => rsvpBucket(g) === 'no').length;
    const pending = total - yes - no;
    return { total, yes, no, pending };
  }, [guests]);

  const filtered = useMemo(() => {
    let list = guests;
    if (statusFilter !== 'all') list = list.filter(g => rsvpBucket(g) === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g => (g.name || '').toLowerCase().includes(q) || (g.phone || '').includes(q));
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortKey === 'party') cmp = resolveGuestPartySize(a) - resolveGuestPartySize(b);
      else if (sortKey === 'functions') cmp = (guestFunctionMap[a.id]?.length || 0) - (guestFunctionMap[b.id]?.length || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [guests, statusFilter, search, sortKey, sortDir, guestFunctionMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount - 1);
  const pageGuests = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const allOnPageSelected = pageGuests.length > 0 && pageGuests.every(g => selected[g.id]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  function toggleSelectAllOnPage() {
    setSelected(prev => {
      const next = { ...prev };
      pageGuests.forEach(g => { next[g.id] = !allOnPageSelected; });
      return next;
    });
  }
  function bulkAction(label) {
    Alert.alert(label, `${label} for ${selectedIds.length} guest${selectedIds.length === 1 ? '' : 's'} isn't wired up yet.`);
  }

  return (
    <View>
      <View style={s.pagehead}>
        <View>
          <Text style={s.eyebrow}>{stats.total} invited · {eventFunctions.length} function{eventFunctions.length === 1 ? '' : 's'}</Text>
          <Text style={s.h1}>Guests</Text>
        </View>
      </View>

      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statV}>{stats.total}</Text><Text style={s.statL}>TOTAL INVITED</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: OK }]}>{stats.yes}</Text><Text style={s.statL}>ATTENDING</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: WAIT }]}>{stats.pending}</Text><Text style={s.statL}>AWAITING REPLY</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: NO }]}>{stats.no}</Text><Text style={s.statL}>DECLINED</Text></View>
      </View>

      {selectedIds.length > 0 && (
        <View style={s.bulkbar}>
          <Text style={s.bulkbarText}><Text style={{ fontWeight: '800', color: '#F4C563' }}>{selectedIds.length}</Text> selected</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.bulkBtn} onPress={() => bulkAction('Send reminder')}><Text style={s.bulkBtnText}>Send reminder</Text></TouchableOpacity>
          <TouchableOpacity style={s.bulkBtn} onPress={() => bulkAction('Assign function')}><Text style={s.bulkBtnText}>Assign function</Text></TouchableOpacity>
          <TouchableOpacity style={s.bulkBtn} onPress={() => setSelected({})}><Text style={s.bulkBtnText}>Clear</Text></TouchableOpacity>
        </View>
      )}

      <View style={s.toolbar}>
        <View style={s.search}>
          <MagnifyingGlass size={15} color="#93816A" style={{ marginRight: 6 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Search guests by name or phone…"
            placeholderTextColor="#93816A"
            value={search}
            onChangeText={v => { setSearch(v); setPage(0); }}
          />
        </View>
        <View style={s.chips}>
          {[{ k: 'all', l: 'All' }, { k: 'yes', l: 'Attending' }, { k: 'pending', l: 'Pending' }, { k: 'no', l: 'Declined' }].map(c => (
            <TouchableOpacity key={c.k} style={[s.chip, statusFilter === c.k && s.chipActive]} onPress={() => { setStatusFilter(c.k); setPage(0); }}>
              <Text style={[s.chipText, statusFilter === c.k && s.chipTextActive]}>{c.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.tablewrap}>
        <View style={s.headRow}>
          <TouchableOpacity style={s.checkCol} onPress={toggleSelectAllOnPage}>
            <View style={[s.checkbox, allOnPageSelected && s.checkboxActive]} />
          </TouchableOpacity>
          <SortHeader label="Guest" k="name" sortKey={sortKey} sortDir={sortDir} onPress={toggleSort} style={{ flex: 2.2 }} />
          <SortHeader label="Functions" k="functions" sortKey={sortKey} sortDir={sortDir} onPress={toggleSort} style={{ flex: 1.6 }} />
          <Text style={[s.headCell, { flex: 1.4 }]}>RSVP</Text>
          <SortHeader label="Party" k="party" sortKey={sortKey} sortDir={sortDir} onPress={toggleSort} style={{ flex: 0.7 }} />
          <Text style={[s.headCell, { flex: 1.2 }]}>Gift</Text>
        </View>

        {pageGuests.length === 0 ? (
          <Text style={s.emptyRow}>No guests match this search/filter.</Text>
        ) : pageGuests.map(g => {
          const funcIds = guestFunctionMap[g.id] || [];
          return (
            <TouchableOpacity key={g.id} style={s.row} onPress={() => onOpenGuest(g)}>
              <TouchableOpacity style={s.checkCol} onPress={() => setSelected(prev => ({ ...prev, [g.id]: !prev[g.id] }))}>
                <View style={[s.checkbox, selected[g.id] && s.checkboxActive]} />
              </TouchableOpacity>
              <View style={[s.who, { flex: 2.2 }]}>
                <View style={s.av}><Text style={s.avText}>{initials(g.name)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{g.name}</Text>
                  {g.phone ? <Text style={s.phone}>{g.phone}</Text> : null}
                </View>
                {g.is_vip ? <Text style={{ fontSize: 12 }}>★</Text> : null}
              </View>
              <View style={{ flex: 1.6 }}><FunctionTags funcIds={funcIds} eventFunctions={eventFunctions} /></View>
              <View style={{ flex: 1.4 }}><RsvpCell guest={g} funcIds={funcIds} eventFunctions={eventFunctions} functionRsvpMap={functionRsvpMap} /></View>
              <Text style={{ flex: 0.7, fontSize: 13, color: '#332419' }}>{resolveGuestPartySize(g)}</Text>
              <View style={{ flex: 1.2 }}><GiftCell guest={g} stickers={giftStickersByGuest[g.id]} /></View>
            </TouchableOpacity>
          );
        })}

        <View style={s.foot}>
          <Text style={s.footText}>
            Showing {filtered.length === 0 ? 0 : pageSafe * PAGE_SIZE + 1}–{Math.min(filtered.length, pageSafe * PAGE_SIZE + PAGE_SIZE)} of {filtered.length}
          </Text>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: pageCount }).slice(0, 6).map((_, i) => (
              <TouchableOpacity key={i} style={[s.pgBtn, i === pageSafe && s.pgBtnActive]} onPress={() => setPage(i)}>
                <Text style={[s.pgBtnText, i === pageSafe && s.pgBtnTextActive]}>{i + 1}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function SortHeader({ label, k, sortKey, sortDir, onPress, style }) {
  const active = sortKey === k;
  const Icon = sortDir === 'asc' ? CaretUp : CaretDown;
  return (
    <TouchableOpacity style={[s.headCellWrap, style]} onPress={() => onPress(k)}>
      <Text style={[s.headCell, active && s.headCellActive]}>{label}</Text>
      {active && <Icon size={11} color="#B57A16" weight="bold" style={{ marginLeft: 3 }} />}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  pagehead: { marginBottom: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: '#B57A16', fontWeight: '700', marginBottom: 4 },
  h1: { fontFamily: 'Fraunces-SemiBold', fontSize: 28, color: MAROON },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EFE4D2', borderRadius: 16, padding: 16 },
  statV: { fontFamily: 'Fraunces-SemiBold', fontSize: 26, color: '#332419' },
  statL: { fontSize: 10.5, color: '#93816A', marginTop: 6, fontWeight: '700', letterSpacing: 0.3 },
  bulkbar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: MAROON, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 16, marginBottom: 12 },
  bulkbarText: { color: '#fff', fontSize: 13 },
  bulkBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
  bulkBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EFE4D2', borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: '#332419' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: '#EFE4D2', backgroundColor: '#fff', borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { backgroundColor: MAROON, borderColor: MAROON },
  chipText: { fontSize: 12, fontWeight: '700', color: '#93816A' },
  chipTextActive: { color: '#fff' },
  tablewrap: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EFE4D2', borderRadius: 18, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#F7F0E2', borderBottomWidth: 1.5, borderColor: '#EFE4D2' },
  checkCol: { width: 34, alignItems: 'flex-start' },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: '#D8C9AE' },
  checkboxActive: { backgroundColor: GOLD, borderColor: GOLD },
  headCellWrap: { flexDirection: 'row', alignItems: 'center' },
  headCell: { fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: '#93816A', fontWeight: '700' },
  headCellActive: { color: MAROON },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#F7F0E2' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F7E9EC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EFE4D2' },
  avText: { fontSize: 11, fontWeight: '800', color: MAROON },
  name: { fontSize: 13.5, fontWeight: '700', color: '#332419' },
  phone: { fontSize: 11, color: '#93816A', marginTop: 1 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: '700' },
  dotsRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotsSummary: { fontSize: 10.5, color: '#93816A', marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 10.5, fontWeight: '700' },
  giftEmpty: { fontSize: 12.5, color: '#93816A' },
  giftLine: { fontSize: 12, color: '#332419', fontWeight: '600' },
  giftSourceTag: { fontSize: 10.5, color: '#93816A', fontWeight: '600' },
  emptyRow: { padding: 24, textAlign: 'center', color: '#93816A', fontSize: 13 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderColor: '#EFE4D2' },
  footText: { fontSize: 12, color: '#93816A' },
  pgBtn: { width: 27, height: 27, borderRadius: 8, borderWidth: 1.5, borderColor: '#EFE4D2', alignItems: 'center', justifyContent: 'center' },
  pgBtnActive: { backgroundColor: MAROON, borderColor: MAROON },
  pgBtnText: { fontSize: 12, color: '#332419' },
  pgBtnTextActive: { color: '#fff' },
});
