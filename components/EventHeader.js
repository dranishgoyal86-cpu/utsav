import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ActivityIndicator, Linking } from 'react-native';
import { PencilSimple } from 'phosphor-react-native';
import { showAlert, renameEvent, googleCalendarUrl } from '../helpers';
import { eventTypeName } from '../lib/eventTypeNames';

// Compact, reusable event header — title (tap to rename), type/date/guest
// meta line, venue line, calendar-export button. Takes { context, update }
// straight from hooks/useEventContext.js, so any screen that drops this in
// gets live cross-screen propagation for free instead of rolling its own
// header + rename modal, as screens/customer/PlanView.js did before this
// hook existed.
export default function EventHeader({ context, update, theme, showBack, onBack, compact }) {
  const s = makeStyles(theme);
  const [renameModal, setRenameModal] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [saving, setSaving] = useState(false);

  if (!context) return null;

  async function saveRename() {
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await renameEvent(context.eventId, trimmed);
      await update({ working_title: trimmed });
      setRenameModal(false);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function addToGoogleCalendar() {
    const location = context.venue.source === 'home'
      ? context.venue.address
      : (context.venue.label || context.venue.address || context.city);
    const details = [
      'Planned on Utsav',
      context.guestCount != null ? `${context.guestCount} guests` : null,
      context.budgetTotal != null ? `₹${context.budgetTotal.toLocaleString('en-IN')} budget` : null,
    ].filter(Boolean).join(' — ');
    const url = googleCalendarUrl({
      title: context.workingTitle || eventTypeName(context.eventTypeSlug),
      date: context.date,
      details,
      location,
    });
    Linking.openURL(url);
  }

  return (
    <View style={s.header}>
      <View style={s.headerTopRow}>
        {showBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
        ) : <View />}
        {context.date ? (
          <TouchableOpacity onPress={addToGoogleCalendar} style={s.calendarBtn}>
            <Text style={s.calendarBtnText}>📅</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity
        style={s.titleRow}
        onPress={() => { setRenameInput(context.workingTitle || ''); setRenameModal(true); }}
      >
        <Text style={s.title} numberOfLines={1}>{context.workingTitle || eventTypeName(context.eventTypeSlug)}</Text>
        <PencilSimple size={15} color={theme.textTertiary} />
      </TouchableOpacity>

      {!compact && (
        <Text style={s.metaLine}>
          {eventTypeName(context.eventTypeSlug)}
          {context.dateLabel ? ` · ${context.dateLabel}` : ''}
          {context.guestCount != null ? ` · ${context.guestCount} guests` : ''}
        </Text>
      )}

      {context.venue.isSet ? (
        <Text style={s.metaLine} numberOfLines={1}>📍 {context.venue.label || context.venue.address}</Text>
      ) : null}

      <Modal visible={renameModal} transparent animationType="fade" onRequestClose={() => setRenameModal(false)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Rename event</Text>
            <TextInput
              style={s.modalInput}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Event name"
              placeholderTextColor={theme.textTertiary}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRenameModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={saveRename} disabled={saving}>
                {saving ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.modalSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    header: { marginBottom: 18 },
    headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    backBtn: {},
    backIcon: { fontSize: 20, color: theme.text },
    calendarBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    calendarBtnText: { fontSize: 15 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
    title: { fontSize: 22, fontWeight: '700', color: theme.text, flexShrink: 1 },
    metaLine: { fontSize: 13, color: theme.textSecondary, marginBottom: 2 },

    overlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
    modal: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 22, width: '100%', maxWidth: 420 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 14 },
    modalInput: { backgroundColor: theme.bg, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.text },
    modalCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 0.5, borderColor: theme.border, alignItems: 'center' },
    modalCancelText: { fontSize: 13, fontWeight: '700', color: theme.text },
    modalSaveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: theme.btnPrimary, alignItems: 'center' },
    modalSaveText: { fontSize: 13, fontWeight: '700', color: theme.btnPrimaryText },
  });
}
