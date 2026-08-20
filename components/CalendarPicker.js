import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Shared month-grid calendar, extracted from AvailabilityScreen.js so there
// is one implementation instead of two. Basic mode (no getDayStatus) is a
// single-date picker: tap a day -> onChange(dateStr), past dates and dates
// in blockedDates are disabled. AvailabilityScreen.js's richer 4-state
// (available/booked/blocked/off) behavior is layered on top via the
// optional getDayStatus callback — 'booked' days are always non-tappable
// (a real booking can't be toggled away), everything else calls onChange.
export default function CalendarPicker({
  value, onChange, minDate, blockedDates = [], getDayStatus, legend,
}) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());

  const floor = minDate ? new Date(minDate) : new Date();
  floor.setHours(0, 0, 0, 0);

  function buildCalendarDays() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = formatDate(year, month, d);
      days.push({ day: d, dateStr, isPast: date < floor, dayOfWeek: date.getDay() });
    }
    return days;
  }

  function statusFor(dateStr, dayOfWeek) {
    if (getDayStatus) return getDayStatus(dateStr, dayOfWeek);
    if (blockedDates.includes(dateStr)) return 'blocked';
    if (value === dateStr) return 'selected';
    return 'available';
  }

  function handlePress(item, status) {
    if (item.isPast || status === 'booked') return;
    onChange(item.dateStr);
  }

  const calendarDays = buildCalendarDays();
  const todayStr = formatDate(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <View>
      <View style={s.calendarHeader}>
        <TouchableOpacity style={s.monthBtn} onPress={() => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))}>
          <Text style={s.monthBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={s.monthTitle}>{MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}</Text>
        <TouchableOpacity style={s.monthBtn} onPress={() => setCurrentMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))}>
          <Text style={s.monthBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={s.weekRow}>
        {WEEK_LABELS.map(d => <Text key={d} style={s.weekDay}>{d}</Text>)}
      </View>

      <View style={s.calendarGrid}>
        {calendarDays.map((item, i) => {
          if (!item) return <View key={`empty-${i}`} style={s.calendarCell} />;
          const status = statusFor(item.dateStr, item.dayOfWeek);
          const isToday = item.dateStr === todayStr;
          return (
            <TouchableOpacity
              key={item.dateStr}
              style={[
                s.calendarCell, s.calendarCellBtn,
                isToday && s.calendarCellToday,
                status === 'selected' && s.calendarCellSelected,
                status === 'booked' && s.calendarCellBooked,
                status === 'blocked' && s.calendarCellBlocked,
                status === 'off' && s.calendarCellOff,
                item.isPast && s.calendarCellPast,
              ]}
              onPress={() => handlePress(item, status)}
              disabled={item.isPast || status === 'booked'}
            >
              <Text style={[
                s.calendarNum,
                isToday && s.calendarNumToday,
                status === 'selected' && s.calendarNumSelected,
                status === 'booked' && s.calendarNumBooked,
                status === 'blocked' && s.calendarNumBlocked,
                item.isPast && s.calendarNumPast,
              ]}>
                {item.day}
              </Text>
              {status === 'booked' && <View style={s.bookedDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {legend || null}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
    monthBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.cardBg, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: theme.border },
    monthBtnText: { fontSize: 20, color: theme.text, lineHeight: 24 },
    monthTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    weekRow: { flexDirection: 'row', marginBottom: 7 },
    weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.textTertiary, paddingVertical: 4 },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarCell: { width: '14.28%', aspectRatio: 1, padding: 2 },
    calendarCellBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    calendarCellToday: { borderWidth: 1.5, borderColor: theme.text },
    calendarCellSelected: { backgroundColor: theme.accent },
    calendarCellBooked: { backgroundColor: '#FCEFD9' },
    calendarCellBlocked: { backgroundColor: theme.statusDeclined },
    calendarCellOff: { backgroundColor: theme.bgSecondary },
    calendarCellPast: { opacity: 0.3 },
    calendarNum: { fontSize: 13, fontWeight: '600', color: theme.text },
    calendarNumToday: { fontWeight: '700' },
    calendarNumSelected: { color: '#fff', fontWeight: '700' },
    calendarNumBooked: { color: theme.accent, fontWeight: '700' },
    calendarNumBlocked: { color: theme.statusDeclinedText },
    calendarNumPast: { color: theme.textTertiary },
    bookedDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.accent, marginTop: 2 },
  });
}
