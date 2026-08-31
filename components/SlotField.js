import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../ThemeContext';
import CalendarPicker from './CalendarPicker';
import SuggestionChips from './SuggestionChips';
import { useInputHistory } from '../hooks/useInputHistory';
import { getSubTypeOptions } from '../lib/eventSubTypes';
import { getThemeOptions } from '../lib/eventThemes';
import { CITY_GROUPS } from '../planLogic';
import { isHomeVenueType, formatTimeLabel } from '../lib/eventContext';

const VENUE_TYPE_OPTIONS = [
  { value: 'home', label: '🏠 At home' },
  { value: 'venue', label: '🏛️ At a venue' },
  { value: 'undecided', label: '🤔 Not decided yet' },
];

// Asked once "At home" is picked — restores the granularity the
// society_gate_pass capability rule and the old EventPlanner.js flow both
// already relied on (venue_type = one of these three, not the generic
// 'home'), which the new flow's single broad chip never collected.
const HOME_TYPE_OPTIONS = [
  { value: 'independent_house', label: '🏡 Independent house' },
  { value: 'society_flat', label: '🏠 Society flat' },
  { value: 'society_clubhouse', label: '🏘️ Society clubhouse' },
];

// Renders the input widget for one plan slot and autosaves on change (no
// save button) — shared by SlotPrompt.js (the two blocking slots, one
// full screen each) and PlanView.js (the remaining slots, as inline soft
// prompts). onSave receives a partial events-row patch to persist.
export default function SlotField({ slotKey, event, onSave, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  switch (slotKey) {
    case 'sub_type_slug':
      return <SubTypeField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'event_date':
      return <EventDateField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'event_time':
      return <EventTimeField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'city':
      return <CityField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'venue_type':
      return <VenueTypeField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'location':
      return <LocationField event={event} onSave={onSave} navigation={navigation} theme={theme} s={s} />;
    case 'guest_count':
      return <GuestCountField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'theme':
      return <ThemeField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'dietary_restrictions':
      return <DryVegField event={event} onSave={onSave} theme={theme} s={s} />;
    case 'budget_total':
      return <BudgetField event={event} onSave={onSave} theme={theme} s={s} />;
    default:
      return null;
  }
}

// Whether this slot has anything to ask for this event type — SlotPrompt.js
// and PlanView.js both use this instead of hardcoding per-event-type checks.
export function slotApplies(slotKey, event) {
  if (!event) return false;
  if (slotKey === 'sub_type_slug') return getSubTypeOptions(event.event_type_slug).length > 0;
  if (slotKey === 'theme') return getThemeOptions(event.event_type_slug).length > 0;
  if (slotKey === 'location') return isHomeVenueType(event.venue_type) || event.venue_type === 'venue';
  return true;
}

// Human-readable label for a section's "Modify" button, and the value shown
// in PlanView.js's read-only summary before the host taps it — the summary
// mirrors whatever the live editor below it would show as selected/typed.
export const SLOT_LABELS = {
  sub_type_slug: 'Kind of event',
  event_date: 'Date',
  event_time: 'Time',
  city: 'City',
  venue_type: 'Venue',
  location: 'Address / venue',
  guest_count: 'Guests',
  theme: 'Theme',
  dietary_restrictions: 'Restrictions',
  budget_total: 'Budget',
};

// venue is optional — only used for the 'location' slot when venue_type is
// 'venue' (a booked marketplace venue, not a home address), since its name
// lives on the venues row, not on the event itself.
export function slotDisplayValue(slotKey, event, venue) {
  if (!event) return null;
  switch (slotKey) {
    case 'sub_type_slug': {
      const opt = getSubTypeOptions(event.event_type_slug).find(o => o.slug === event.sub_type_slug);
      return opt?.label || null;
    }
    case 'event_date':
      return event.event_date
        ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;
    case 'event_time':
      return formatTimeLabel(event.event_time);
    case 'city':
      return event.city || null;
    case 'venue_type': {
      if (!event.venue_type) return null;
      const homeOpt = HOME_TYPE_OPTIONS.find(o => o.value === event.venue_type);
      if (homeOpt) return homeOpt.label;
      const opt = VENUE_TYPE_OPTIONS.find(o => o.value === event.venue_type);
      return opt?.label || event.venue_type;
    }
    case 'location':
      if (isHomeVenueType(event.venue_type)) return event.venue || null;
      return venue?.name || (event.venue_id ? 'Venue selected' : null);
    case 'guest_count':
      return event.guest_count != null ? `${event.guest_count} guests` : null;
    case 'theme':
      return event.theme || null;
    case 'dietary_restrictions': {
      const parts = [];
      if (event.is_dry_event) parts.push('Dry event');
      if (event.is_veg_only) parts.push('Vegetarian only');
      return parts.length > 0 ? parts.join(' · ') : 'No restrictions';
    }
    case 'budget_total':
      return event.budget_total != null ? `₹${event.budget_total.toLocaleString('en-IN')}` : null;
    default:
      return null;
  }
}

export function slotFilled(slotKey, event) {
  if (!event) return false;
  switch (slotKey) {
    case 'sub_type_slug': return !!event.sub_type_slug;
    case 'event_date': return !!event.event_date;
    case 'event_time': return !!event.event_time;
    case 'city': return !!event.city;
    case 'venue_type': return !!event.venue_type;
    case 'location': return isHomeVenueType(event.venue_type) ? !!event.venue : !!event.venue_id;
    case 'guest_count': return event.guest_count != null;
    case 'theme': return !!event.theme;
    // Booleans are always in a complete state (false is a real answer, not
    // a missing one) — never worth nudging for, only ever edited directly.
    case 'dietary_restrictions': return true;
    case 'budget_total': return event.budget_total != null;
    default: return true;
  }
}

function SubTypeField({ event, onSave, theme, s }) {
  const options = getSubTypeOptions(event.event_type_slug);
  return (
    <View>
      <Text style={s.label}>Which kind of {event.working_title ? 'this' : 'the'} event is it?</Text>
      <View style={s.chipsWrap}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.slug}
            style={[s.chip, event.sub_type_slug === opt.slug && s.chipActive]}
            onPress={() => onSave({ sub_type_slug: opt.slug, child_age: opt.childAge })}
          >
            <Text style={[s.chipText, event.sub_type_slug === opt.slug && s.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function EventDateField({ event, onSave, theme, s }) {
  return (
    <View>
      <Text style={s.label}>When is it?</Text>
      <CalendarPicker value={event.event_date} onChange={dateStr => onSave({ event_date: dateStr })} />
    </View>
  );
}

// Re-exported so existing `import { formatTimeLabel } from '.../SlotField'`
// call sites keep working — the actual implementation now lives in
// lib/eventContext.js (see there for why: keeps it out of screens that only
// need the pure formatter, like the unauthed guest-facing RSVPScreen.js).
export { formatTimeLabel };

const QUICK_TIME_PRESETS = [
  { label: 'Morning · 10:00 AM', value: '10:00' },
  { label: 'Afternoon · 1:00 PM', value: '13:00' },
  { label: 'Evening · 6:00 PM', value: '18:00' },
  { label: 'Night · 8:00 PM', value: '20:00' },
];
const HOUR_OPTIONS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_OPTIONS = ['00', '15', '30', '45'];

// No @react-native-community/datetimepicker anywhere in this project (same
// constraint the date picker already works around) — three short horizontal
// chip rows (hour / minute / AM-PM) instead of a native wheel, plus one-tap
// common-time presets above them for the typical case.
function EventTimeField({ event, onSave, theme, s }) {
  const [hh, mm] = (event.event_time || '').split(':');
  const parsedHour = parseInt(hh, 10);
  const selectedHour24 = Number.isInteger(parsedHour) ? parsedHour : null;
  const selectedHour12 = selectedHour24 == null ? null : (selectedHour24 % 12 === 0 ? 12 : selectedHour24 % 12);
  const selectedPeriod = selectedHour24 == null ? null : (selectedHour24 >= 12 ? 'PM' : 'AM');
  const selectedMinute = mm || null;

  function commit(hour12, minute, period) {
    if (hour12 == null || !minute || !period) return;
    let hour24 = hour12 % 12;
    if (period === 'PM') hour24 += 12;
    onSave({ event_time: `${String(hour24).padStart(2, '0')}:${minute}` });
  }

  return (
    <View>
      <Text style={s.label}>What time?</Text>
      <View style={s.chipsWrap}>
        {QUICK_TIME_PRESETS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[s.chip, event.event_time === opt.value && s.chipActive]}
            onPress={() => onSave({ event_time: opt.value })}
          >
            <Text style={[s.chipText, event.event_time === opt.value && s.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[s.label, { marginTop: 14, fontSize: 12 }]}>Or pick exactly</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {HOUR_OPTIONS.map(h => (
            <TouchableOpacity
              key={h}
              style={[s.chip, selectedHour12 === h && s.chipActive]}
              onPress={() => commit(h, selectedMinute || '00', selectedPeriod || 'AM')}
            >
              <Text style={[s.chipText, selectedHour12 === h && s.chipTextActive]}>{h}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {MINUTE_OPTIONS.map(m => (
          <TouchableOpacity
            key={m}
            style={[s.chip, selectedMinute === m && s.chipActive]}
            onPress={() => commit(selectedHour12 || 12, m, selectedPeriod || 'AM')}
          >
            <Text style={[s.chipText, selectedMinute === m && s.chipTextActive]}>:{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['AM', 'PM'].map(p => (
          <TouchableOpacity
            key={p}
            style={[s.chip, selectedPeriod === p && s.chipActive]}
            onPress={() => commit(selectedHour12 || 12, selectedMinute || '00', p)}
          >
            <Text style={[s.chipText, selectedPeriod === p && s.chipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function CityField({ event, onSave, theme, s }) {
  // cityGroup is UI-only scaffolding (which chip row to show), same as the
  // old EventPlanner.js form — only the resolved city itself is persisted.
  const [cityGroup, setCityGroup] = useState(CITY_GROUPS.find(g => g.cities.includes(event.city))?.id || '');
  const activeGroup = CITY_GROUPS.find(g => g.id === cityGroup);

  function selectGroup(group) {
    setCityGroup(group.id);
    if (group.cities.length === 1) onSave({ city: group.cities[0] });
  }

  return (
    <View>
      <Text style={s.label}>Which city?</Text>
      <View style={s.chipsWrap}>
        {CITY_GROUPS.map(group => (
          <TouchableOpacity
            key={group.id}
            style={[s.chip, cityGroup === group.id && s.chipActive]}
            onPress={() => selectGroup(group)}
          >
            <Text style={[s.chipText, cityGroup === group.id && s.chipTextActive]}>{group.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeGroup && activeGroup.cities.length > 1 && (
        <View style={[s.chipsWrap, { marginTop: 10 }]}>
          {activeGroup.cities.map(city => (
            <TouchableOpacity
              key={city}
              style={[s.chip, event.city === city && s.chipActive]}
              onPress={() => onSave({ city })}
            >
              <Text style={[s.chipText, event.city === city && s.chipTextActive]}>{city}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function DryVegField({ event, onSave, theme, s }) {
  return (
    <View>
      <Text style={s.label}>Any restrictions?</Text>
      <View style={s.chipsWrap}>
        <TouchableOpacity
          style={[s.chip, event.is_dry_event && s.chipActive]}
          onPress={() => onSave({ is_dry_event: !event.is_dry_event })}
        >
          <Text style={[s.chipText, event.is_dry_event && s.chipTextActive]}>🚫 Dry event (no alcohol)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.chip, event.is_veg_only && s.chipActive]}
          onPress={() => onSave({ is_veg_only: !event.is_veg_only })}
        >
          <Text style={[s.chipText, event.is_veg_only && s.chipTextActive]}>🥦 Vegetarian only</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function VenueTypeField({ event, onSave, theme, s }) {
  const isHome = isHomeVenueType(event.venue_type);
  return (
    <View>
      <Text style={s.label}>Where will it be held?</Text>
      <View style={s.chipsWrap}>
        {VENUE_TYPE_OPTIONS.map(opt => {
          const selected = opt.value === 'home' ? isHome : event.venue_type === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, selected && s.chipActive]}
              onPress={() => onSave({ venue_type: opt.value })}
            >
              <Text style={[s.chipText, selected && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {isHome && (
        <View style={[s.chipsWrap, { marginTop: 10 }]}>
          {HOME_TYPE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.chip, event.venue_type === opt.value && s.chipActive]}
              onPress={() => onSave({ venue_type: opt.value })}
            >
              <Text style={[s.chipText, event.venue_type === opt.value && s.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function LocationField({ event, onSave, navigation, theme, s }) {
  const [address, setAddress] = useState(event.venue || '');
  const [mapsLink, setMapsLink] = useState(event.maps_link || '');
  const { suggestions, record } = useInputHistory('home_address');

  if (event.venue_type === 'venue') {
    return (
      <View>
        <Text style={s.label}>Which venue?</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('VenuePicker', { eventId: event.id })}>
          <Text style={s.primaryBtnText}>{event.venue_id ? 'Change venue' : 'Browse venues →'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isHomeVenueType(event.venue_type)) return null;

  function saveAddress() {
    if (!address.trim()) return;
    record(address.trim());
    onSave({ venue: address.trim(), maps_link: mapsLink.trim() || null });
  }

  return (
    <View>
      <Text style={s.label}>Home address</Text>
      <SuggestionChips suggestions={suggestions} onSelect={v => { setAddress(v); onSave({ venue: v, maps_link: mapsLink.trim() || null }); }} />
      <TextInput
        style={s.input}
        placeholder="Street address"
        placeholderTextColor={theme.textTertiary}
        value={address}
        onChangeText={setAddress}
        onBlur={saveAddress}
      />
      <Text style={[s.label, { marginTop: 10 }]}>Google Maps link (optional)</Text>
      <TextInput
        style={s.input}
        placeholder="Paste a Google Maps link"
        placeholderTextColor={theme.textTertiary}
        value={mapsLink}
        onChangeText={setMapsLink}
        onBlur={saveAddress}
        autoCapitalize="none"
      />
    </View>
  );
}

function GuestCountField({ event, onSave, theme, s }) {
  const [value, setValue] = useState(event.guest_count != null ? String(event.guest_count) : '');
  const { suggestions, record } = useInputHistory('guest_count');

  function commit(v) {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1) return;
    record(String(n));
    onSave({ guest_count: n });
  }

  return (
    <View>
      <Text style={s.label}>How many guests?</Text>
      <SuggestionChips suggestions={suggestions} onSelect={v => { setValue(v); commit(v); }} />
      <TextInput
        style={s.input}
        placeholder="e.g. 150"
        placeholderTextColor={theme.textTertiary}
        value={value}
        onChangeText={setValue}
        onBlur={() => commit(value)}
        keyboardType="number-pad"
      />
    </View>
  );
}

function ThemeField({ event, onSave, theme, s }) {
  const options = getThemeOptions(event.event_type_slug);
  return (
    <View>
      <Text style={s.label}>Pick a theme</Text>
      <View style={s.chipsWrap}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[s.chip, event.theme === opt && s.chipActive]}
            onPress={() => onSave({ theme: opt })}
          >
            <Text style={[s.chipText, event.theme === opt && s.chipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function BudgetField({ event, onSave, theme, s }) {
  const [value, setValue] = useState(event.budget_total != null ? String(event.budget_total) : '');
  const { suggestions, record } = useInputHistory('budget_total');

  function commit(v) {
    const n = parseInt(v, 10);
    if (!Number.isInteger(n) || n < 0) return;
    record(String(n));
    onSave({ budget_total: n });
  }

  return (
    <View>
      <Text style={s.label}>Total budget (optional)</Text>
      <SuggestionChips suggestions={suggestions} onSelect={v => { setValue(v); commit(v); }} />
      <TextInput
        style={s.input}
        placeholder="e.g. 1500000"
        placeholderTextColor={theme.textTertiary}
        value={value}
        onChangeText={setValue}
        onBlur={() => commit(value)}
        keyboardType="number-pad"
      />
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    label: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.cardBg, borderWidth: 0.5, borderColor: theme.border },
    chipActive: { backgroundColor: theme.text, borderColor: theme.text },
    // Was theme.textSecondary (grey) -- every one of these chips (time
    // presets, hour/minute/AM-PM, city, venue type, theme, etc.) is a
    // real selectable option, not a disabled one, so it reads better in
    // the same near-black theme.text everything else in this form uses.
    // chipTextActive (theme.bg, light-on-dark) is untouched -- selected
    // chips already have strong contrast via chipActive's dark background.
    chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    chipTextActive: { color: theme.bg },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, color: theme.text },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 14, fontWeight: '700' },
  });
}
