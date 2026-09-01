import { View, Text, StyleSheet } from 'react-native';

// Guest-facing gate/arrival guidance — a plain summary sentence
// (guestAccessNote, caller-supplied), never a shadow of the real gate-pass
// credential system (guest_passes/gate_pass.sql). If a real pass code
// exists for this guest, presenting/scanning it stays entirely in the
// existing GatePass/PassCard screens, not duplicated here.
export default function GuestAccessScene({ tokens, guestAccessNote }) {
  if (!guestAccessNote) return null;
  const c = tokens?.colors;
  return (
    <View style={s.wrap}>
      <Text style={[s.kicker, { color: c?.accent || '#B8862F' }]}>GETTING IN</Text>
      <Text style={[s.text, { color: c?.ink || '#1A1A1A' }]}>{guestAccessNote}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 18, paddingHorizontal: 24, alignItems: 'center' },
  kicker: { fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  text: { fontSize: 12.5, textAlign: 'center' },
});
