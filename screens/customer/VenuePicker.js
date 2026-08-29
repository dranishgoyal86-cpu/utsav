import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../ThemeContext';
import { supabase } from '../../supabase';
import { showAlert } from '../../helpers';
import { billableGuests } from '../../lib/priceEngine';
import AppHeader from '../../components/AppHeader';
import DesktopStandalonePage from '../../components/desktop/DesktopStandalonePage';
import { MAROON, CARD, LINE, TEXT, MUTED } from '../../lib/desktopTheme';

const DESKTOP_BREAKPOINT = 768;

export default function VenuePicker({ route, navigation }) {
  const { eventId } = route.params;
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [event, setEvent] = useState(null);
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => { fetchData(); }, [eventId]);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: eventData, error: eventError } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (eventError) throw eventError;
      setEvent(eventData);

      let query = supabase.from('venues').select('*').eq('is_active', true);
      if (eventData.city) query = query.eq('city', eventData.city);
      const { data: venueRows, error: venuesError } = await query;
      if (venuesError) throw venuesError;

      const matching = (venueRows || []).filter(v =>
        (v.capacity_min == null || eventData.guest_count == null || eventData.guest_count >= v.capacity_min) &&
        (v.capacity_max == null || eventData.guest_count == null || eventData.guest_count <= v.capacity_max)
      );
      setVenues(matching);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function venueTotal(v) {
    const billable = billableGuests(event?.guest_count, v);
    const plateRate = event?.is_veg_only ? v.plate_rate_veg : v.plate_rate_nonveg;
    if (v.pricing_model === 'rental_only') return v.rental_amount || 0;
    if (v.pricing_model === 'per_plate_only') return (plateRate || 0) * billable;
    if (v.pricing_model === 'rental_plus_plate') return (v.rental_amount || 0) + (plateRate || 0) * billable;
    return 0;
  }

  async function selectVenue(v) {
    setSelecting(v.id);
    try {
      const { error } = await supabase.from('events').update({ venue_id: v.id, venue_type: v.venue_type }).eq('id', eventId);
      if (error) throw error;
      navigation.goBack();
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSelecting(null);
    }
  }

  async function decideLater() {
    try {
      const { error } = await supabase.from('events').update({ venue_id: null, venue_type: null }).eq('id', eventId);
      if (error) throw error;
      navigation.goBack();
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  if (isDesktopWeb) {
    return (
      <DesktopStandalonePage onBack={() => navigation.goBack()} title="Choose a venue" maxWidth={1000}>
        <TouchableOpacity style={ds.decideLaterBtn} onPress={decideLater}>
          <Text style={ds.decideLaterText}>I'll decide later →</Text>
        </TouchableOpacity>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={MAROON} /></View>
        ) : venues.length === 0 ? (
          <Text style={ds.emptyText}>
            No venues listed yet for {event?.city || 'this city'}{event?.guest_count ? ` at ${event.guest_count} guests` : ''}. Check back soon, or decide later.
          </Text>
        ) : (
          <View style={ds.grid}>
            {venues.map(item => {
              const total = venueTotal(item);
              const exceedsGuarantee = item.min_guest_guarantee != null && event?.guest_count != null && item.min_guest_guarantee > event.guest_count;
              return (
                <TouchableOpacity key={item.id} style={ds.card} onPress={() => selectVenue(item)} disabled={!!selecting}>
                  <Text style={ds.cardName}>{item.name}</Text>
                  <Text style={ds.cardMeta}>
                    {item.venue_type} · {item.city}
                    {item.capacity_min != null || item.capacity_max != null ? ` · ${item.capacity_min ?? '0'}–${item.capacity_max ?? '∞'} guests` : ''}
                  </Text>
                  <Text style={ds.cardPrice}>₹{total.toLocaleString('en-IN')}</Text>
                  {exceedsGuarantee && (
                    <Text style={ds.warningText}>Bills for a minimum of {item.min_guest_guarantee} plates — you've planned for {event.guest_count}.</Text>
                  )}
                  {selecting === item.id && <ActivityIndicator color={MAROON} style={{ marginTop: 8 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </DesktopStandalonePage>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader title="Choose a venue" onBack={() => navigation.goBack()} theme={theme} navigation={navigation} />

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={venues}
          keyExtractor={v => v.id}
          contentContainerStyle={s.scroll}
          ListHeaderComponent={
            <TouchableOpacity style={s.decideLaterBtn} onPress={decideLater}>
              <Text style={s.decideLaterText}>I'll decide later →</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <Text style={s.emptyText}>
              No venues listed yet for {event?.city || 'this city'}{event?.guest_count ? ` at ${event.guest_count} guests` : ''}. Check back soon, or decide later.
            </Text>
          }
          renderItem={({ item }) => {
            const total = venueTotal(item);
            const exceedsGuarantee = item.min_guest_guarantee != null && event?.guest_count != null && item.min_guest_guarantee > event.guest_count;
            return (
              <TouchableOpacity style={s.card} onPress={() => selectVenue(item)} disabled={!!selecting}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardMeta}>
                  {item.venue_type} · {item.city}
                  {item.capacity_min != null || item.capacity_max != null ? ` · ${item.capacity_min ?? '0'}–${item.capacity_max ?? '∞'} guests` : ''}
                </Text>
                <Text style={s.cardPrice}>₹{total.toLocaleString('en-IN')}</Text>
                {exceedsGuarantee && (
                  <Text style={s.warningText}>
                    Bills for a minimum of {item.min_guest_guarantee} plates — you've planned for {event.guest_count}.
                  </Text>
                )}
                {selecting === item.id && <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} />}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backBtn: { width: 30 },
    backIcon: { fontSize: 20, color: theme.text },
    headerTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    scroll: { padding: 16, paddingBottom: 60 },

    decideLaterBtn: { alignItems: 'center', paddingVertical: 14, marginBottom: 8 },
    decideLaterText: { fontSize: 13, fontWeight: '700', color: theme.accent },

    card: { backgroundColor: theme.cardBg, borderRadius: 16, borderWidth: 0.5, borderColor: theme.border, padding: 16, marginBottom: 10 },
    cardName: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
    cardMeta: { fontSize: 12, color: theme.textSecondary, marginBottom: 8, textTransform: 'capitalize' },
    cardPrice: { fontSize: 16, fontWeight: '700', color: theme.text },
    warningText: { fontSize: 11.5, color: '#B45309', marginTop: 8, fontWeight: '600' },

    emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', paddingVertical: 30, lineHeight: 19 },
  });
}

const ds = StyleSheet.create({
  decideLaterBtn: { alignSelf: 'flex-start', marginBottom: 18 },
  decideLaterText: { fontSize: 13, fontWeight: '700', color: MAROON },
  emptyText: { fontSize: 13.5, color: MUTED, textAlign: 'center', paddingVertical: 40, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  card: { width: 300, backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 18 },
  cardName: { fontFamily: 'Fraunces-SemiBold', fontSize: 16, color: TEXT, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: MUTED, marginBottom: 8, textTransform: 'capitalize' },
  cardPrice: { fontSize: 17, fontWeight: '700', color: MAROON },
  warningText: { fontSize: 11.5, color: '#B45309', marginTop: 8, fontWeight: '600' },
});
