import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useTheme } from '../ThemeContext';
import CalendarPicker from './CalendarPicker';
import SuggestionChips from './SuggestionChips';
import { useInputHistory } from '../hooks/useInputHistory';
import { getSubTypeOptions } from '../lib/eventSubTypes';
import { getThemeOptions } from '../lib/eventThemes';
import { CITY_GROUPS } from '../planLogic';
import { isHomeVenueType, formatTimeLabel, formatTimeRangeLabel, computeAgeOn, eventTypeForAge } from '../lib/eventContext';

// Same convention already used by CalendarPicker.js/GuestList.js/
// ProviderERP.js for their own desktop-specific sizing — kept identical
// (768) so a screen never straddles two different breakpoints depending on
// which component happens to be rendering.
const DESKTOP_BREAKPOINT = 768;

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
    case 'birthday_person':
      return <BirthdayPersonField event={event} onSave={onSave} theme={theme} s={s} />;
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
const BIRTHDAY_EVENT_TYPES = ['kids-birthday', 'adult-birthday'];

export function slotApplies(slotKey, event) {
  if (!event) return false;
  if (slotKey === 'sub_type_slug') return getSubTypeOptions(event.event_type_slug).length > 0;
  if (slotKey === 'theme') return getThemeOptions(event.event_type_slug).length > 0;
  if (slotKey === 'location') return isHomeVenueType(event.venue_type) || event.venue_type === 'venue';
  // Sept 2026 — "differentiation between kids birthday and normal birthday
  // has to be placed in the event plan itself": applies to both birthday
  // event types (not just kids-birthday) since a wrong initial guess needs
  // a way back the other direction too, not just kids->adult.
  if (slotKey === 'birthday_person') return BIRTHDAY_EVENT_TYPES.includes(event.event_type_slug);
  return true;
}

// Human-readable label for a section's "Modify" button, and the value shown
// in PlanView.js's read-only summary before the host taps it — the summary
// mirrors whatever the live editor below it would show as selected/typed.
export const SLOT_LABELS = {
  sub_type_slug: 'Kind of event',
  birthday_person: 'Birthday person',
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
    case 'birthday_person': {
      if (!event.birthday_person_dob) return event.birthday_person_name || null;
      const age = computeAgeOn(event.birthday_person_dob, event.event_date);
      const ageText = age != null ? `Turning ${age}` : null;
      return [event.birthday_person_name, ageText].filter(Boolean).join(' · ') || null;
    }
    case 'event_date':
      return event.event_date
        ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;
    case 'event_time':
      return formatTimeRangeLabel(event.event_time, event.event_duration_hours);
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
    case 'theme': {
      if (!event.theme) return null;
      return event.theme_palette ? `${event.theme} · ${event.theme_palette}` : event.theme;
    }
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
    case 'birthday_person': return !!event.birthday_person_dob;
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

// "differentiation between kids birthday and normal birthday has to be
// placed in the event plan itself, like whose birthday and birthdate, so
// we get to know the age... kids theme if below 15" — previously the only
// signal was matchEventTypeText() guessing from the event's free-text
// description at creation time, with no way to fix a wrong guess. This
// field is the fix: a real birthdate, entered here, silently corrects
// event.event_type_slug between 'kids-birthday' and 'adult-birthday'
// (lib/eventContext.js's eventTypeForAge — see there for the exact age
// cutoff), which is what unlocks/hides ThemeField and ActivityIdeasLibrary
// elsewhere on this screen. Shown for both birthday types (not just
// kids-birthday) since a wrong guess needs a way back in either direction.
function BirthdayPersonField({ event, onSave, theme, s }) {
  const [name, setName] = useState(event.birthday_person_name || '');
  const todayStr = new Date().toISOString().slice(0, 10);
  const age = computeAgeOn(event.birthday_person_dob, event.event_date || todayStr);
  const impliedType = eventTypeForAge(age);

  function saveName() {
    onSave({ birthday_person_name: name.trim() || null });
  }

  function saveDob(dateStr) {
    const patch = { birthday_person_dob: dateStr };
    const newAge = computeAgeOn(dateStr, event.event_date || todayStr);
    const newType = eventTypeForAge(newAge);
    // Only ever touches event_type_slug when the computed type actually
    // differs — never clobbers it back to itself, and never fires for an
    // event type this field doesn't apply to in the first place (gated by
    // slotApplies() before this component even renders).
    if (newType && newType !== event.event_type_slug) patch.event_type_slug = newType;
    onSave(patch);
  }

  return (
    <View>
      <Text style={s.label}>Whose birthday is it?</Text>
      <TextInput
        style={s.input}
        placeholder="Name (optional, just for your own reference)"
        placeholderTextColor={theme.textTertiary}
        value={name}
        onChangeText={setName}
        onBlur={saveName}
      />
      <Text style={[s.label, { marginTop: 14, fontSize: 12 }]}>Their birthdate</Text>
      <Text style={[s.chipText, { color: theme.textSecondary, fontWeight: '500', marginBottom: 10, fontSize: 12.5, lineHeight: 17 }]}>
        This is what decides whether kids-party themes and activity ideas show up below, instead of guessing from typed text.
      </Text>
      <CalendarPicker value={event.birthday_person_dob} minDate="1900-01-01" maxDate={todayStr} onChange={saveDob} />
      {age != null && (
        <Text style={[s.chipText, { color: theme.textSecondary, fontWeight: '600', marginTop: 10 }]}>
          {event.event_date ? `Turning ${age} on the event date` : `${age} years old today`}
          {' → '}
          {impliedType === 'kids-birthday' ? "Kids' Birthday mode (themes + activity ideas unlocked)" : 'Birthday mode'}
        </Text>
      )}
    </View>
  );
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

// Sept 2026 UX pass — "calendar should be collapsible": starts collapsed
// whenever a date is already set (nothing to fix, no reason to take up
// space), and open the first time there's no date yet, same "only show the
// full control when there's a real decision left to make" idea as
// ThemeField's grid/palette/other modes above. Re-collapses itself right
// after a date is picked, since at that point the summary line already
// shows the answer and staying open just means an extra tap to get past it
// next time this section scrolls into view.
function EventDateField({ event, onSave, theme, s }) {
  const [open, setOpen] = useState(!event.event_date);
  const dateLabel = event.event_date
    ? new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <View>
      <Text style={s.label}>When is it?</Text>
      <TouchableOpacity style={s.dateSummaryBtn} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Text style={s.dateSummaryText}>📅 {dateLabel || 'Choose a date'}</Text>
        <Text style={s.dateSummaryCaret}>{open ? 'Hide ▲' : 'Change ▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: 12 }}>
          <CalendarPicker
            value={event.event_date}
            onChange={dateStr => { onSave({ event_date: dateStr }); setOpen(false); }}
          />
        </View>
      )}
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

// Sept 2026 UX pass — "time is too complex, make it easy to just put time
// of event": the old control was three stacked chip rows (12 hour chips +
// 4 minute chips + 2 AM/PM chips = 18 taps' worth of options just to see),
// on top of the quick presets above it. Replaced with one horizontal row
// of real clock times in 30-minute steps, 6:00 AM through 11:30 PM — a
// single tap sets the exact time, same as the quick presets already did,
// just covering the rest of the day too instead of a second whole
// interaction pattern next to them.
function buildTimeSlots() {
  const slots = [];
  for (let h = 6; h <= 23; h++) {
    for (const m of ['00', '30']) {
      slots.push(`${String(h).padStart(2, '0')}:${m}`);
    }
  }
  return slots;
}
const TIME_SLOTS = buildTimeSlots();

// "timings/duration of event should also be confirmed in the plan only, to
// be intimated to guests through invites" — event_duration_hours (new
// column) is optional, and once set, lib/eventContext.js's
// formatTimeRangeLabel turns it + the start time into the "6:00 PM –
// 9:00 PM" guests actually see on their invite, so there's nowhere else in
// the app a host has to re-enter or re-confirm this.
const DURATION_OPTIONS = [
  { label: '1 hr', value: 1 },
  { label: '2 hrs', value: 2 },
  { label: '3 hrs', value: 3 },
  { label: '4 hrs', value: 4 },
  { label: '5+ hrs', value: 5 },
];

function EventTimeField({ event, onSave, theme, s }) {
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

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

      <Text style={[s.label, { marginTop: 14, fontSize: 12 }]}>Or pick the exact time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.timeSlotScroll, isDesktopWeb && { maxWidth: 420 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TIME_SLOTS.map(slot => (
            <TouchableOpacity
              key={slot}
              style={[s.chip, event.event_time === slot && s.chipActive]}
              onPress={() => onSave({ event_time: slot })}
            >
              <Text style={[s.chipText, event.event_time === slot && s.chipTextActive]}>{formatTimeLabel(slot)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={[s.label, { marginTop: 14, fontSize: 12 }]}>How long does it run? (optional — this is what guests see on the invite)</Text>
      <View style={s.chipsWrap}>
        {DURATION_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[s.chip, event.event_duration_hours === opt.value && s.chipActive]}
            onPress={() => onSave({ event_duration_hours: opt.value })}
          >
            <Text style={[s.chipText, event.event_duration_hours === opt.value && s.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {event.event_time && (
        <Text style={[s.chipText, { color: theme.textSecondary, fontWeight: '500', marginTop: 10, fontSize: 12.5 }]}>
          Guests will see: {formatTimeRangeLabel(event.event_time, event.event_duration_hours)}
        </Text>
      )}
    </View>
  );
}

// Sept 2026 UX pass — "which city should also have an option to add any
// city possible": CITY_GROUPS (planLogic.js) is a fixed shortlist of the
// cities this app actively markets in, which is fine as a fast path but
// was previously the only path — a host planning an event anywhere else
// had no way to answer this slot at all. The free-text row below is always
// visible (not hidden behind "Other"), and takes over as the shown value
// whenever event.city isn't one of the listed cities, so a typed city
// reads back correctly next time this field renders.
function CityField({ event, onSave, theme, s }) {
  // cityGroup is UI-only scaffolding (which chip row to show), same as the
  // old EventPlanner.js form — only the resolved city itself is persisted.
  const [cityGroup, setCityGroup] = useState(CITY_GROUPS.find(g => g.cities.includes(event.city))?.id || '');
  const activeGroup = CITY_GROUPS.find(g => g.id === cityGroup);
  const isListedCity = CITY_GROUPS.some(g => g.cities.includes(event.city));
  const [customCity, setCustomCity] = useState(!isListedCity ? (event.city || '') : '');

  function selectGroup(group) {
    setCityGroup(group.id);
    setCustomCity('');
    if (group.cities.length === 1) onSave({ city: group.cities[0] });
  }

  function saveCustomCity() {
    if (!customCity.trim()) return;
    setCityGroup('');
    onSave({ city: customCity.trim() });
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

      <Text style={[s.label, { marginTop: 14, fontSize: 12 }]}>Don't see your city? Type it in</Text>
      <TextInput
        style={s.input}
        placeholder="e.g. Bhopal, Kochi, Dehradun…"
        placeholderTextColor={theme.textTertiary}
        value={customCity}
        onChangeText={setCustomCity}
        onBlur={saveCustomCity}
        onSubmitEditing={saveCustomCity}
      />
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
      {/* is_veg_only is read everywhere food preference matters — RSVPScreen.js
          (guest food-pref options), GuestDetailModal.js (host meal-preference
          editor), submit-rsvp's edge function (server-side clamp), and
          ItemDetail.js (hides pure non-veg caterers from the marketplace
          results for this event's checklist). This stays a plain toggle —
          switching it back off immediately un-restricts all of those again —
          the hint just makes the downstream effect visible at the point
          where it's turned on. */}
      {event.is_veg_only && (
        <Text style={[s.chipText, { color: theme.textSecondary, fontWeight: '500', marginTop: 10, fontSize: 12.5, lineHeight: 17 }]}>
          Guests won't be able to pick non-veg on RSVP, and caterers who only serve non-veg won't show up when you search for catering for this event.
        </Text>
      )}
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

// Three-screen flow, all inline (no navigation): theme grid → color palette
// for whichever theme was picked → an "Other" free-text screen for a
// host's own custom name (including any branded name they want privately —
// see lib/eventThemes.js's file header for why the app's own list only ever
// offers generic names). `mode` is local UI state only; the actual answer
// lives in event.theme/theme_slug/theme_palette, which is why it's seeded
// from those on mount rather than always starting at 'grid'.
function ThemeField({ event, onSave, theme, s }) {
  const options = getThemeOptions(event.event_type_slug);
  const selectedOption = options.find(o => o.slug === event.theme_slug);
  const [mode, setMode] = useState(selectedOption ? 'palette' : (event.theme ? 'other' : 'grid'));
  const [customText, setCustomText] = useState(event.theme_slug ? '' : (event.theme || ''));

  function pickTheme(opt) {
    onSave({ theme: opt.label, theme_slug: opt.slug, theme_palette: null });
    setMode('palette');
  }

  function saveCustom() {
    if (!customText.trim()) return;
    onSave({ theme: customText.trim(), theme_slug: null, theme_palette: null });
  }

  if (mode === 'palette' && selectedOption) {
    return (
      <View>
        <TouchableOpacity onPress={() => setMode('grid')} style={{ marginBottom: 10 }}>
          <Text style={[s.chipText, { color: theme.textSecondary }]}>‹ Change theme</Text>
        </TouchableOpacity>
        <Text style={s.label}>{selectedOption.emoji} {selectedOption.label}</Text>
        {selectedOption.motifs?.length > 0 && (
          <Text style={[s.chipText, { color: theme.textSecondary, fontWeight: '500', marginBottom: 12, fontSize: 12.5 }]}>
            Ideas: {selectedOption.motifs.join(', ')}
          </Text>
        )}
        <Text style={[s.label, { fontSize: 13 }]}>Pick a color palette</Text>
        <View style={s.chipsWrap}>
          {selectedOption.palettes.map(p => (
            <TouchableOpacity
              key={p.name}
              style={[s.chip, event.theme_palette === p.name && s.chipActive, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
              onPress={() => onSave({ theme_palette: p.name })}
            >
              <View style={{ flexDirection: 'row' }}>
                {p.colors.map((c, i) => (
                  <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c, marginLeft: i > 0 ? -4 : 0, borderWidth: 1, borderColor: theme.bg }} />
                ))}
              </View>
              <Text style={[s.chipText, event.theme_palette === p.name && s.chipTextActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  if (mode === 'other') {
    return (
      <View>
        <TouchableOpacity onPress={() => setMode('grid')} style={{ marginBottom: 10 }}>
          <Text style={[s.chipText, { color: theme.textSecondary }]}>‹ Choose from list instead</Text>
        </TouchableOpacity>
        <Text style={s.label}>Your own theme</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. Wizarding World, Frozen, Cricket Stars"
          placeholderTextColor={theme.textTertiary}
          value={customText}
          onChangeText={setCustomText}
          onBlur={saveCustom}
        />
      </View>
    );
  }

  return (
    <View>
      <Text style={s.label}>Pick a theme</Text>
      <View style={s.chipsWrap}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.slug}
            style={[s.chip, event.theme_slug === opt.slug && s.chipActive]}
            onPress={() => pickTheme(opt)}
          >
            <Text style={[s.chipText, event.theme_slug === opt.slug && s.chipTextActive]}>{opt.emoji} {opt.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.chip} onPress={() => setMode('other')}>
          <Text style={s.chipText}>✏️ Other (type your own)</Text>
        </TouchableOpacity>
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
    dateSummaryBtn: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: theme.cardBg, borderRadius: 14, borderWidth: 0.5, borderColor: theme.border,
      paddingHorizontal: 14, paddingVertical: 13,
    },
    dateSummaryText: { fontSize: 14, fontWeight: '700', color: theme.text },
    dateSummaryCaret: { fontSize: 12.5, fontWeight: '600', color: theme.textSecondary },
    timeSlotScroll: { marginBottom: 8 },
  });
}
