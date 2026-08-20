import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import SlotField, { slotApplies, slotFilled } from '../../components/SlotField';
import AppHeader from '../../components/AppHeader';

// sub_type_slug/event_date/city block — city joins them because too much
// downstream (venue search, provider matching, price-median lookups) quietly
// degrades to "nationwide, generic" without it, the same way it was a
// required field on the old EventPlanner.js form. Everything else
// (venue_type, location, guest_count, theme, dietary_restrictions,
// budget_total) is a soft prompt rendered inline on PlanView.js instead,
// fillable at the host's own pace — and, unlike before, editable again
// afterward too (PlanView.js's "Event details" section).
const BLOCKING_SLOTS = ['sub_type_slug', 'event_date', 'city'];

export default function SlotPrompt({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchEvent(); }, [eventId]);

  async function fetchEvent() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (error) throw error;
      setEvent(data);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const currentSlot = event ? BLOCKING_SLOTS.find(slot => slotApplies(slot, event) && !slotFilled(slot, event)) : null;

  // Both blocking slots filled (or not applicable to this event type) —
  // move on to the live plan. Navigating from an effect, not during render.
  useEffect(() => {
    if (!loading && event && !currentSlot) {
      navigation.replace('PlanView', { eventId });
    }
  }, [loading, event, currentSlot, eventId]);

  async function saveField(patch) {
    setSaving(true);
    try {
      const { data, error } = await supabase.from('events').update(patch).eq('id', eventId).select().single();
      if (error) throw error;
      setEvent(data);

      // saved_plans.event_date/city are what PlanScreen.js's "YOUR PLANS"
      // cards and sort options actually read, not a live join to events —
      // event_date and city are both set here first (they're blocking
      // slots), so without this the card shows "No date set" from the very
      // first save, before the host ever reaches PlanView.
      const planMirror = {};
      if ('event_date' in patch) planMirror.event_date = patch.event_date;
      if ('city' in patch) planMirror.city = patch.city;
      if (Object.keys(planMirror).length > 0) {
        await supabase.from('saved_plans').update(planMirror).eq('event_id', eventId);
      }
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !event || !currentSlot) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title={event.working_title || 'New event'} theme={theme} navigation={navigation} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {saving ? <ActivityIndicator color={theme.accent} style={{ marginBottom: 12 }} /> : null}
        <SlotField slotKey={currentSlot} event={event} onSave={saveField} navigation={navigation} />
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    scroll: { padding: 20 },
  });
}
