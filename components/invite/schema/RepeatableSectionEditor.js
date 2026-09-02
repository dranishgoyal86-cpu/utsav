import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { reorderSection, removeSection, addSection } from '../../../lib/repeatableSectionLogic';

// Batch 5 — the smallest generic editor for a FIELD_KIND.SECTIONS field
// (lib/inviteSchemas/types.js). Before this, InviteFieldRenderer.js
// rendered nothing at all for a SECTIONS field — round-tripped by the
// adapter, but with no way for a host to actually enter the data through
// the app. interfaith-wedding's interfaithCeremonies is the first schema
// where that gap genuinely blocks a real host (multiple ceremonies are
// the whole point of the event type), so this exists to unblock it — but
// it is deliberately generic, not interfaith-specific: the same component
// serves any SECTIONS field (customSections on every schema; a future
// conference agenda, festival schedule, retreat programme, or offsite
// itinerary editor never needs its own component). No storage table of
// its own — `value`/`onChange` round-trip a plain array straight into the
// schema's own schema_content JSONB, exactly like every other field.
//
// Minimum item contract (per the brief): title, subtitle/description,
// date, start time, end time, venue, an optional role/person label, and
// sort order. Reordering is handled by simple Move Up/Down buttons rather
// than drag-and-drop (out of scope for this pass); sortOrder is not a
// host-facing field — it's silently kept in sync with array position on
// every change, so a consumer can rely on either the array order or the
// stored sortOrder interchangeably.
export default function RepeatableSectionEditor({ theme, value, onChange, itemLabel = 'Section' }) {
  const s = makeStyles(theme);
  const items = Array.isArray(value) ? value : [];

  function updateItem(index, patch) {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  }
  function removeItem(index) {
    onChange(removeSection(items, index));
  }
  function moveItem(index, direction) {
    // reorderSection() returns the same array reference as a no-op at the
    // edges (guarded here too, matching the buttons' own disabled state,
    // so an edge no-op never fires an onChange the way the old inline
    // early-return version didn't either).
    const next = reorderSection(items, index, direction);
    if (next !== items) onChange(next);
  }
  function addItem() {
    onChange(addSection(items));
  }

  return (
    <View style={s.wrap}>
      {items.map((item, i) => (
        <View key={item.id || i} style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardHeaderText}>{itemLabel} {i + 1}</Text>
            <View style={s.cardHeaderActions}>
              <TouchableOpacity onPress={() => moveItem(i, -1)} disabled={i === 0} style={s.iconBtn}>
                <Text style={[s.iconBtnText, i === 0 && s.iconBtnTextDisabled]}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveItem(i, 1)} disabled={i === items.length - 1} style={s.iconBtn}>
                <Text style={[s.iconBtnText, i === items.length - 1 && s.iconBtnTextDisabled]}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeItem(i)} style={s.iconBtn}>
                <Text style={s.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={s.label}>Title</Text>
          <TextInput style={s.input} value={item.title || ''} onChangeText={(v) => updateItem(i, { title: v })} placeholder="e.g. Church Ceremony" placeholderTextColor={theme.textTertiary} />

          <Text style={s.label}>Description (optional)</Text>
          <TextInput style={[s.input, s.textarea]} value={item.description || ''} onChangeText={(v) => updateItem(i, { description: v })} multiline placeholder="What happens here, in your own words" placeholderTextColor={theme.textTertiary} />

          <View style={s.row}>
            <View style={s.rowField}>
              <Text style={s.label}>Date</Text>
              <TextInput style={s.input} value={item.date || ''} onChangeText={(v) => updateItem(i, { date: v })} placeholder="e.g. 14 Dec 2026" placeholderTextColor={theme.textTertiary} />
            </View>
          </View>
          <View style={s.row}>
            <View style={s.rowField}>
              <Text style={s.label}>Start time</Text>
              <TextInput style={s.input} value={item.startTime || ''} onChangeText={(v) => updateItem(i, { startTime: v })} placeholder="e.g. 4:00 PM" placeholderTextColor={theme.textTertiary} />
            </View>
            <View style={s.rowField}>
              <Text style={s.label}>End time (optional)</Text>
              <TextInput style={s.input} value={item.endTime || ''} onChangeText={(v) => updateItem(i, { endTime: v })} placeholder="e.g. 6:00 PM" placeholderTextColor={theme.textTertiary} />
            </View>
          </View>

          <Text style={s.label}>Venue</Text>
          <TextInput style={s.input} value={item.venue || ''} onChangeText={(v) => updateItem(i, { venue: v })} placeholder="Address or venue name" placeholderTextColor={theme.textTertiary} />

          <Text style={s.label}>Role / person (optional)</Text>
          <TextInput style={s.input} value={item.personLabel || ''} onChangeText={(v) => updateItem(i, { personLabel: v })} placeholder="e.g. Officiant, tradition name" placeholderTextColor={theme.textTertiary} />
        </View>
      ))}

      <TouchableOpacity style={s.addBtn} onPress={addItem}>
        <Text style={s.addBtnText}>+ Add {itemLabel.toLowerCase()}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: { marginTop: 6, marginBottom: 4 },
    card: { backgroundColor: theme.inputBg, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 0.5, borderColor: theme.border },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    cardHeaderText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
    cardHeaderActions: { flexDirection: 'row', gap: 4 },
    iconBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    iconBtnText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
    iconBtnTextDisabled: { color: theme.border },
    removeBtnText: { fontSize: 13, fontWeight: '700', color: '#C0392B' },
    label: { fontSize: 11.5, fontWeight: '600', color: theme.textSecondary, marginBottom: 5, marginTop: 8 },
    input: { backgroundColor: theme.bg, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13.5, color: theme.text, borderWidth: 0.5, borderColor: theme.border },
    textarea: { minHeight: 56, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    rowField: { flex: 1 },
    addBtn: { alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed' },
    addBtnText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  });
}
