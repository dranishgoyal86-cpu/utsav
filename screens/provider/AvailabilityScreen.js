import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabase';
import { useTheme } from '../../ThemeContext';
import { showAlert, confirmAction } from '../../helpers';
import AppHeader from '../../components/AppHeader';
import SwipeableRow from '../../components/SwipeableRow';
import CalendarPicker from '../../components/CalendarPicker';
import { ArrowCounterClockwise } from 'phosphor-react-native';

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' },
  { id: 0, label: 'Sun', full: 'Sunday' },
];

export default function AvailabilityScreen({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState(null);
  const [blockedDates, setBlockedDates] = useState([]);
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5, 6, 0]);
  const [advanceBookingDays, setAdvanceBookingDays] = useState(30);
  const [bookedDates, setBookedDates] = useState([]);

  useEffect(() => { fetchAvailability(); }, []);

  async function fetchAvailability() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: provider } = await supabase
        .from('providers')
        .select('id, blocked_dates, working_days, advance_booking_days')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!provider) return;
      setProviderId(provider.id);
      setBlockedDates(provider.blocked_dates || []);
      setWorkingDays(provider.working_days || [1, 2, 3, 4, 5, 6, 0]);
      setAdvanceBookingDays(provider.advance_booking_days || 30);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('event_date')
        .eq('provider_id', provider.id)
        .in('status', ['confirmed', 'pending']);

      setBookedDates((bookings || []).map(b => b.event_date));
    } catch (err) {
      console.log('Availability error:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAvailability() {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('providers')
        .update({
          blocked_dates: blockedDates,
          working_days: workingDays,
          advance_booking_days: advanceBookingDays,
        })
        .eq('id', providerId);
      if (error) throw error;
      showAlert('Saved! ✓', 'Your availability has been updated.');
    } catch (err) {
      console.log('Save availability error:', err.message);
      showAlert('Error', err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleWorkingDay(dayId) {
    setWorkingDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  }

  function toggleDateBlock(dateStr) {
    const isBooked = bookedDates.includes(dateStr);
    if (isBooked) {
      showAlert('Cannot block', 'This date has a confirmed booking.');
      return;
    }
    setBlockedDates(prev =>
      prev.includes(dateStr)
        ? prev.filter(d => d !== dateStr)
        : [...prev, dateStr]
    );
  }

  function confirmUnblockDate(dateStr, label) {
    confirmAction(
      'Unblock this date?',
      `${label} will become available for new bookings once you save.`,
      'Unblock',
      () => setBlockedDates(prev => prev.filter(d => d !== dateStr))
    );
  }

  function getDayStatus(dateStr, dayOfWeek) {
    if (bookedDates.includes(dateStr)) return 'booked';
    if (blockedDates.includes(dateStr)) return 'blocked';
    if (!workingDays.includes(dayOfWeek)) return 'off';
    return 'available';
  }

  // "Available days" stat always reflects the real current month, independent
  // of whichever month CalendarPicker's own internal pagination is showing.
  function computeAvailableCountThisMonth() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = today.getDate(); d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (getDayStatus(dateStr, date.getDay()) === 'available') count++;
    }
    return count;
  }

  const availableCount = computeAvailableCountThisMonth();

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <AppHeader
        title="Availability"
        onBack={() => navigation.goBack()}
        theme={theme}
        navigation={navigation}
        rightActions={[
          <TouchableOpacity key="save" style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={saveAvailability} disabled={saving}>
            {saving ? <ActivityIndicator color={theme.btnPrimaryText} size="small" /> : <Text style={s.saveBtnText}>Save</Text>}
          </TouchableOpacity>,
        ]}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{bookedDates.length}</Text>
            <Text style={s.statLabel}>Booked this month</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: theme.statusConfirmedText }]}>{availableCount}</Text>
            <Text style={s.statLabel}>Available days</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: theme.statusDeclinedText }]}>{blockedDates.length}</Text>
            <Text style={s.statLabel}>Blocked days</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Working days</Text>
          <Text style={s.sectionSub}>
            Days you are available to take bookings by default
          </Text>
          <View style={s.daysRow}>
            {DAYS_OF_WEEK.map(day => (
              <TouchableOpacity
                key={day.id}
                style={[s.dayChip, workingDays.includes(day.id) && s.dayChipActive]}
                onPress={() => toggleWorkingDay(day.id)}
              >
                <Text style={[s.dayChipText, workingDays.includes(day.id) && s.dayChipTextActive]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Advance booking window</Text>
          <Text style={s.sectionSub}>
            How far in advance customers can book you
          </Text>
          <View style={s.advanceRow}>
            {[7, 14, 30, 60, 90].map(days => (
              <TouchableOpacity
                key={days}
                style={[s.advanceChip, advanceBookingDays === days && s.advanceChipActive]}
                onPress={() => setAdvanceBookingDays(days)}
              >
                <Text style={[s.advanceChipText, advanceBookingDays === days && s.advanceChipTextActive]}>
                  {days}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.advanceHint}>
            Customers can book up to {advanceBookingDays} days in advance
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionSub}>
            Tap any date to block or unblock it. Booked dates cannot be changed.
          </Text>

          <CalendarPicker
            value={null}
            onChange={toggleDateBlock}
            getDayStatus={getDayStatus}
            legend={
              <View style={s.legend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.statusConfirmedText }]} />
                  <Text style={s.legendText}>Available</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.accent }]} />
                  <Text style={s.legendText}>Booked</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.statusDeclinedText }]} />
                  <Text style={s.legendText}>Blocked</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.bgSecondary }]} />
                  <Text style={s.legendText}>Day off</Text>
                </View>
              </View>
            }
          />
        </View>

        {blockedDates.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Blocked dates ({blockedDates.length})</Text>
            <View style={s.blockedList}>
              {blockedDates
                .sort()
                .map(dateStr => {
                  const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric',
                    month: 'long', year: 'numeric'
                  });
                  return (
                    <SwipeableRow
                      key={dateStr}
                      deleteLabel="Unblock"
                      actionColor="#3B82F6"
                      actionIcon={ArrowCounterClockwise}
                      onDelete={() => confirmUnblockDate(dateStr, label)}
                    >
                      <View style={s.blockedRow}>
                        <Text style={s.blockedDate}>{label}</Text>
                      </View>
                    </SwipeableRow>
                  );
                })}
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    backIcon: { fontSize: 22, color: theme.text, width: 32 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    saveBtn: { backgroundColor: theme.btnPrimary, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 9 },
    saveBtnText: { color: theme.btnPrimaryText, fontSize: 13, fontWeight: '700' },

    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    statsRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
    statCard: { flex: 1, backgroundColor: theme.cardBg, borderRadius: 16, padding: 13, alignItems: 'center', borderWidth: 0.5, borderColor: theme.border },
    statValue: { fontSize: 22, fontWeight: '700', color: theme.text },
    statLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 3, textAlign: 'center' },

    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 4 },
    sectionSub: { fontSize: 12, color: theme.textSecondary, marginBottom: 13, lineHeight: 18 },

    daysRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    dayChip: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border, minWidth: 52, alignItems: 'center' },
    dayChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    dayChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    dayChipTextActive: { color: theme.bg },

    advanceRow: { flexDirection: 'row', gap: 8, marginBottom: 9 },
    advanceChip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    advanceChipActive: { backgroundColor: theme.text, borderColor: theme.text },
    advanceChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
    advanceChipTextActive: { color: theme.bg },
    advanceHint: { fontSize: 12, color: theme.accent, fontWeight: '600' },

    legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 13, flexWrap: 'wrap' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, color: theme.textSecondary },

    blockedList: { backgroundColor: theme.cardBg, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: theme.border },
    blockedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: theme.border },
    blockedDate: { fontSize: 13, color: theme.text, fontWeight: '500' },
  });
}