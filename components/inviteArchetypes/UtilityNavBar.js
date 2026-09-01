import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const LABELS = {
  invite: 'Invite', functions: 'Functions', travel: 'Travel', stay: 'Stay', rsvp: 'RSVP', more: 'More',
};
const ICONS = {
  invite: '✦', functions: '📅', travel: '✈️', stay: '🏨', rsvp: '💌', more: '⋯',
};

// Persistent utility nav — items come entirely from
// lib/inviteUtilityNav.js's resolveUtilityNav() output (already derived
// from active capabilities/content by the caller); this component just
// renders whatever list it's handed, in order, never inventing or
// hardcoding wedding-only items itself.
export default function UtilityNavBar({ tokens, items = [], activeItem, onSelect }) {
  if (items.length === 0) return null;
  const c = tokens?.colors;
  return (
    <View style={[s.bar, { borderTopColor: c?.line || '#EEE', backgroundColor: c?.bg || '#FFF' }]}>
      {items.map((item) => {
        const focused = item === activeItem;
        return (
          <TouchableOpacity key={item} style={s.item} onPress={() => onSelect?.(item)}>
            <Text style={[s.icon, { opacity: focused ? 1 : 0.6 }]}>{ICONS[item]}</Text>
            <Text style={[s.label, { color: focused ? (c?.accent || '#E8A020') : (c?.dim || '#888'), fontWeight: focused ? '700' : '600' }]}>
              {LABELS[item]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 8, paddingHorizontal: 4 },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 15 },
  label: { fontSize: 10 },
});
