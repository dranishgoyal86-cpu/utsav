import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// "So this should be a hierarchy of the planning page" (Anish, Sept 16) —
// three peer, always-reachable destinations for any event, in the order he
// asked for: Event details / Plan the event / Execute & book. All three
// were already separate Stack.Screen entries (App.js) before this; nothing
// about their own data-fetching changed — this is purely a navigation strip
// rendered at the top of all three, so a host can jump straight between
// them instead of the old one-way SlotPrompt → EventScope → PlanView chain.
// Mobile only — desktop already has the same 3 destinations in
// DesktopEventShell.js's own sidebar (see that file's NAV_ITEMS), so this
// component is never rendered when isDesktopWeb is true.
//
// navigation.replace (never .navigate) on every tap: switching tabs is a
// lateral move, not a forward step, so it must never grow the back stack —
// the hardware/header back button from any of the three should always
// return to wherever the host came from before this event (PlanScreen,
// GuestList, a notification, etc.), not walk backward through the other
// two tabs first.
const TABS = [
  { key: 'details', label: 'Event details', screen: 'EventDetailsScreen' },
  { key: 'plan', label: 'Plan the event', screen: 'EventScope' },
  { key: 'execute', label: 'Execute & book', screen: 'PlanView' },
];

export default function EventTabStrip({ active, eventId, navigation, theme }) {
  const s = makeStyles(theme);
  return (
    <View style={s.wrap}>
      {TABS.map(tab => {
        const focused = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[s.pill, focused && s.pillActive]}
            onPress={() => { if (!focused) navigation.replace(tab.screen, { eventId }); }}
            disabled={focused}
          >
            <Text style={[s.pillText, focused && s.pillTextActive]} numberOfLines={1}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row', gap: 8,
      paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    pill: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: theme.bgTertiary },
    pillActive: { backgroundColor: theme.btnPrimary },
    pillText: { fontSize: 11.5, fontWeight: '700', color: theme.textSecondary },
    pillTextActive: { color: theme.btnPrimaryText },
  });
}
