import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Batch 2 — extended to cover every SCENE_ROLE id
// resolveUtilityNavFromScenes() can now emit (the pilot screen switched
// from the old hardcoded-array resolveUtilityNav() to this
// lifecycle-priority-driven one as part of this wave's carry-forward
// fix), not just the original 5-item wedding-shaped set.
// Batch 3 fix: resolveUtilityNavFromScenes() emits each SCENE_ROLE's own
// `id` (e.g. 'accommodation' for the Stay role, 'maps' for the Location
// role — see sceneRegistry.js's own id-vs-implementedAs split), NOT the
// working SCENE id resolveUtilityNav() used ('stay'). Found via
// scripts/verifyProductionBatch3.js: 'accommodation' had no label/icon at
// all, so a destination event's Stay item would have rendered blank.
// Both keys are kept — 'stay' for resolveUtilityNav()'s older callers,
// 'accommodation' for resolveUtilityNavFromScenes().
const LABELS = {
  invite: 'Invite', functions: 'Functions', travel: 'Travel', stay: 'Stay', accommodation: 'Stay', rsvp: 'RSVP', more: 'More',
  maps: 'Location', 'guest-access': 'Gate', 'wishing-wall': 'Wishes', gifts: 'Gifts',
  registration: 'Register', speakers: 'Speakers', transport: 'Transport', contact: 'Contact',
};
const ICONS = {
  invite: '✦', functions: '📅', travel: '✈️', stay: '🏨', accommodation: '🏨', rsvp: '💌', more: '⋯',
  maps: '📍', 'guest-access': '🎟️', 'wishing-wall': '💬', gifts: '🎁',
  registration: '📝', speakers: '🎤', transport: '🚌', contact: '✉️',
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
