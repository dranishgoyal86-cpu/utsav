import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { MagnifyingGlass, X, CaretRight } from 'phosphor-react-native';
import { supabase } from '../supabase';
import { fetchHostAndDelegateEvents } from '../helpers';
import { SEARCH_REGISTRY } from '../lib/searchRegistry';

function textMatches(text, q) {
  return (text || '').toLowerCase().includes(q);
}

// Full-screen modal, opened from AppHeader's search icon. Visual precedent:
// GuestList.js's contacts-import search / SearchScreen.js's marketplace
// search — TextInput + MagnifyingGlass + clear-X, plain client-side
// substring filtering over an already-fetched, RLS-scoped set (this
// codebase has no server-side text search anywhere — confirmed before
// building this, so this matches the only pattern that exists rather than
// introducing a new one).
//
// Two modes: 'search' (default) and 'pickEvent' — the latter only entered
// when a tapped feature result needs an event and none is known yet
// (eventId prop unset), reusing the SAME myEvents fetch as the Events
// results section (no second query) and the same host-or-delegate merged
// query GuestList.js/EventTodo.js's own pickers already use.
export default function GlobalSearch({ visible, onClose, navigation, eventId, theme }) {
  const s = styles(theme);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [guests, setGuests] = useState([]);

  const [mode, setMode] = useState('search');
  const [pendingEntry, setPendingEntry] = useState(null);
  const inputRef = useRef(null);

  // Role + the user's own events are fetched once per time the modal opens,
  // not on every keystroke — same "fetch broadly, filter in JS" shape as
  // SearchScreen.js. Guests are only fetched when there's a real eventId in
  // context (search is opened from inside a specific event's screens).
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setMode('search');
    setPendingEntry(null);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: userRow } = await supabase.from('users').select('role, is_admin').eq('id', user.id).maybeSingle();
      setRole(userRow?.is_admin ? 'admin' : userRow?.role === 'provider' ? 'provider' : 'customer');

      setEventsLoading(true);
      const events = await fetchHostAndDelegateEvents(user.id);
      setMyEvents(events);
      setEventsLoading(false);

      if (eventId) {
        const { data: guestRows } = await supabase.from('event_invitees').select('id, name').eq('event_id', eventId);
        setGuests(guestRows || []);
      } else {
        setGuests([]);
      }
    })();
  }, [visible, eventId]);

  const q = query.trim().toLowerCase();
  const featureResults = q && role
    ? SEARCH_REGISTRY.filter(r => r.role === role && (textMatches(r.label, q) || (r.keywords || []).some(k => textMatches(k, q))))
    : [];
  const eventResults = q ? myEvents.filter(e => textMatches(e.name, q)) : [];
  const guestResults = q && eventId ? guests.filter(g => textMatches(g.name, q)) : [];
  const hasAnyResults = featureResults.length > 0 || eventResults.length > 0 || guestResults.length > 0;

  function navigateToEntry(entry, ev) {
    onClose();
    if (entry.tab) {
      navigation.navigate('CustomerTabs', { screen: entry.screen });
      return;
    }
    // Both `eventId` and the full `event` object are passed — this app's
    // own event-scoped screens aren't consistent about which one they read
    // (GuestList/EventTodo want `event`, GatePass/SeatingChart/PlanView/... want
    // `eventId`) — passing both covers either convention, the unused one is
    // just ignored.
    const params = entry.needsEvent && ev ? { eventId: ev.id, event: ev, ...(entry.params || {}) } : (entry.params || undefined);
    navigation.navigate(entry.screen, params);
  }

  function handleFeatureTap(entry) {
    if (entry.needsEvent && !eventId) {
      if (myEvents.length === 1) {
        // Only one real choice — skip the picker step entirely.
        navigateToEntry(entry, myEvents[0]);
        return;
      }
      setPendingEntry(entry);
      setMode('pickEvent');
      return;
    }
    navigateToEntry(entry, eventId ? { id: eventId } : null);
  }

  function handleEventResultTap(ev) {
    onClose();
    // No dedicated "event home" search result target exists beyond
    // PlanView — the closest thing this app has to a single per-event hub.
    navigation.navigate('PlanView', { eventId: ev.id, event: ev });
  }

  function handleGuestResultTap() {
    // No per-guest deep-link/scroll-to exists anywhere in this app today —
    // landing on the Guest List for that guest's event is the closest real
    // capability, not a fabricated one.
    onClose();
    navigation.navigate('GuestList', { eventId, event: { id: eventId } });
  }

  function handlePickedEvent(ev) {
    if (pendingEntry) navigateToEntry(pendingEntry, ev);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{mode === 'pickEvent' ? `Which event? — ${pendingEntry?.label}` : 'Search'}</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          {mode === 'pickEvent' ? (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
              {eventsLoading ? (
                <ActivityIndicator size="small" color={theme.accent} style={{ marginTop: 20 }} />
              ) : myEvents.length === 0 ? (
                <Text style={s.emptyText}>No events yet — create one first.</Text>
              ) : (
                myEvents.map(ev => (
                  <TouchableOpacity key={ev.id} style={s.resultRow} onPress={() => handlePickedEvent(ev)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultLabel}>{ev.name}</Text>
                      {ev._delegateAccess ? <Text style={s.resultMeta}>Delegate access</Text> : null}
                    </View>
                    <CaretRight size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity style={s.backToSearchLink} onPress={() => { setMode('search'); setPendingEntry(null); }}>
                <Text style={s.backToSearchLinkText}>← Back to search</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <>
              <View style={s.searchBox}>
                <MagnifyingGlass size={16} color={theme.textSecondary} />
                <TextInput
                  ref={inputRef}
                  style={s.searchInput}
                  placeholder="Search features, events, guests..."
                  placeholderTextColor={theme.textSecondary}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  autoCapitalize="none"
                  onFocus={() => {
                    // react-native-web's KeyboardAvoidingView never wires up
                    // any keyboard/viewport listener (it's a hard no-op), so
                    // on the webapp the mobile browser's virtual keyboard can
                    // still cover this sheet's input — nudge it into view
                    // once the keyboard/visual viewport has actually resized.
                    if (Platform.OS === 'web') {
                      setTimeout(() => inputRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 300);
                    }
                  }}
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <X size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
                {!q ? (
                  <Text style={s.emptyText}>Start typing to search.</Text>
                ) : !hasAnyResults ? (
                  <Text style={s.emptyText}>No matches for "{query.trim()}".</Text>
                ) : (
                  <>
                    {featureResults.length > 0 && (
                      <>
                        <Text style={s.sectionLabel}>Features</Text>
                        {featureResults.map(entry => (
                          <TouchableOpacity key={entry.id} style={s.resultRow} onPress={() => handleFeatureTap(entry)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.resultLabel}>{entry.label}</Text>
                              {entry.note ? <Text style={s.resultMeta} numberOfLines={2}>{entry.note}</Text> : null}
                            </View>
                            <CaretRight size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                    {eventResults.length > 0 && (
                      <>
                        <Text style={s.sectionLabel}>Events</Text>
                        {eventResults.map(ev => (
                          <TouchableOpacity key={ev.id} style={s.resultRow} onPress={() => handleEventResultTap(ev)}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.resultLabel}>{ev.name}</Text>
                              {ev._delegateAccess ? <Text style={s.resultMeta}>Delegate access</Text> : null}
                            </View>
                            <CaretRight size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                    {guestResults.length > 0 && (
                      <>
                        <Text style={s.sectionLabel}>Guests</Text>
                        {guestResults.map(g => (
                          <TouchableOpacity key={g.id} style={s.resultRow} onPress={handleGuestResultTap}>
                            <Text style={s.resultLabel}>{g.name}</Text>
                            <CaretRight size={16} color={theme.textSecondary} />
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function styles(theme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    modal: { backgroundColor: theme.cardBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text, flex: 1, marginRight: 12 },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: theme.bgSecondary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 0.5, borderColor: theme.border, marginBottom: 14,
    },
    searchInput: { flex: 1, fontSize: 15, color: theme.text },

    sectionLabel: { fontSize: 11.5, fontWeight: '700', color: theme.textSecondary, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
    resultRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
      borderWidth: 0.5, borderColor: theme.border,
    },
    resultLabel: { fontSize: 14, fontWeight: '600', color: theme.text },
    resultMeta: { fontSize: 11.5, color: theme.textTertiary, marginTop: 2 },

    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 24 },

    backToSearchLink: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
    backToSearchLinkText: { fontSize: 13, fontWeight: '700', color: theme.accent },
  });
}
