import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MagnifyingGlass } from 'phosphor-react-native';
import { MAROON, GOLD, OK, MUTED, TEXT, CARD, LINE, LINE_SOFT, EYEBROW } from '../../lib/desktopTheme';

// Wave 13 — Task 1. Same table pattern as Guests/Gifts. Columns: item,
// category/section, status. Deliberately NO "linked function" column —
// confirmed live against event_todos' real schema that no function_id (or
// any function-linking mechanism, checked EventTodo.js's own logic too)
// exists anywhere in this app's checklist model. Inventing one here would
// be exactly the kind of fabricated-shape mistake this brief's Task 1
// explicitly warned against, so it's simply not there — same "confirm,
// don't assume" discipline as every schema check this whole project has
// done.
function sectionLabel(section) {
  if (!section) return 'General';
  return section.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function ChecklistTable({ todos, onToggle }) {
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const sections = useMemo(() => [...new Set(todos.map(t => t.section).filter(Boolean))].sort(), [todos]);

  const stats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter(t => t.status === 'done').length;
    return { total, done, pending: total - done };
  }, [todos]);

  const filtered = useMemo(() => {
    let list = todos;
    if (sectionFilter !== 'all') list = list.filter(t => t.section === sectionFilter);
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => (t.title || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [todos, sectionFilter, statusFilter, search]);

  return (
    <View>
      <View style={s.pagehead}>
        <Text style={s.eyebrow}>{stats.total} items · {sections.length} section{sections.length === 1 ? '' : 's'}</Text>
        <Text style={s.h1}>Checklist</Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.stat}><Text style={s.statV}>{stats.total}</Text><Text style={s.statL}>TOTAL ITEMS</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: OK }]}>{stats.done}</Text><Text style={s.statL}>DONE</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: EYEBROW }]}>{stats.pending}</Text><Text style={s.statL}>PENDING</Text></View>
      </View>

      <View style={s.toolbar}>
        <View style={s.search}>
          <MagnifyingGlass size={15} color={MUTED} style={{ marginRight: 6 }} />
          <TextInput style={s.searchInput} placeholder="Search checklist items…" placeholderTextColor={MUTED} value={search} onChangeText={setSearch} />
        </View>
        <View style={s.chips}>
          {[{ k: 'all', l: 'All' }, { k: 'pending', l: 'Pending' }, { k: 'done', l: 'Done' }].map(c => (
            <TouchableOpacity key={c.k} style={[s.chip, statusFilter === c.k && s.chipActive]} onPress={() => setStatusFilter(c.k)}>
              <Text style={[s.chipText, statusFilter === c.k && s.chipTextActive]}>{c.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {sections.length > 0 && (
        <View style={[s.chips, { marginBottom: 12, flexWrap: 'wrap' }]}>
          <TouchableOpacity style={[s.sectionChip, sectionFilter === 'all' && s.sectionChipActive]} onPress={() => setSectionFilter('all')}>
            <Text style={[s.sectionChipText, sectionFilter === 'all' && s.sectionChipTextActive]}>All sections</Text>
          </TouchableOpacity>
          {sections.map(sec => (
            <TouchableOpacity key={sec} style={[s.sectionChip, sectionFilter === sec && s.sectionChipActive]} onPress={() => setSectionFilter(sec)}>
              <Text style={[s.sectionChipText, sectionFilter === sec && s.sectionChipTextActive]}>{sectionLabel(sec)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={s.tablewrap}>
        <View style={s.headRow}>
          <Text style={{ width: 34 }} />
          <Text style={[s.headCell, { flex: 2.5 }]}>Item</Text>
          <Text style={[s.headCell, { flex: 1.2 }]}>Section</Text>
          <Text style={[s.headCell, { flex: 1 }]}>Status</Text>
        </View>
        {filtered.length === 0 ? (
          <Text style={s.emptyRow}>No checklist items match this search/filter.</Text>
        ) : filtered.map(item => (
          <TouchableOpacity key={item.id} style={s.row} onPress={() => onToggle(item)}>
            <View style={{ width: 34 }}>
              <View style={[s.checkbox, item.status === 'done' && s.checkboxActive]} />
            </View>
            <Text style={[s.itemTitle, { flex: 2.5 }, item.status === 'done' && s.itemDone]} numberOfLines={1}>{item.title}</Text>
            <Text style={[s.sectionText, { flex: 1.2 }]}>{sectionLabel(item.section)}</Text>
            <View style={{ flex: 1 }}>
              <View style={[s.pill, item.status === 'done' ? { backgroundColor: '#EAF3E9' } : { backgroundColor: '#FBF0DC' }]}>
                <Text style={[s.pillText, { color: item.status === 'done' ? OK : EYEBROW }]}>{item.status === 'done' ? 'Done' : 'Pending'}</Text>
              </View>
            </View>
          </TouchableOpacity>
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
  statV: { fontFamily: 'Fraunces-SemiBold', fontSize: 26, color: TEXT },
  statL: { fontSize: 10.5, color: MUTED, marginTop: 6, fontWeight: '700', letterSpacing: 0.3 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  search: { flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1.5, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: TEXT },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: CARD, borderRadius: 100, paddingVertical: 8, paddingHorizontal: 14 },
  chipActive: { backgroundColor: MAROON, borderColor: MAROON },
  chipText: { fontSize: 12, fontWeight: '700', color: MUTED },
  chipTextActive: { color: '#fff' },
  sectionChip: { borderWidth: 1.5, borderColor: LINE, backgroundColor: CARD, borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12 },
  sectionChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  sectionChipText: { fontSize: 11.5, fontWeight: '700', color: MUTED },
  sectionChipTextActive: { color: MAROON },
  tablewrap: { backgroundColor: CARD, borderWidth: 1, borderColor: LINE, borderRadius: 18, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: LINE_SOFT, borderBottomWidth: 1.5, borderColor: LINE },
  headCell: { fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: MUTED, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: LINE_SOFT },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: '#D8C9AE' },
  checkboxActive: { backgroundColor: GOLD, borderColor: GOLD },
  itemTitle: { fontSize: 13.5, fontWeight: '600', color: TEXT },
  itemDone: { color: MUTED, textDecorationLine: 'line-through' },
  sectionText: { fontSize: 12, color: MUTED },
  pill: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 10.5, fontWeight: '700' },
  emptyRow: { padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 },
});
