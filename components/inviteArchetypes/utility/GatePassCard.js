import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// A themed CTA into the real gate-pass system — screens/customer/GatePass.js
// (generation/printing) and PassScanner.js/CheckInScanner.js (scanning) stay
// the single canonical implementation. This card never generates or
// displays a QR code itself; it only surfaces "you have a pass, tap to view
// it" using the active archetype's tokens, same pattern as RSVPCard.
// note: an optional override for the default "Show this at the gate for
// check-in." line — housewarming's gateEntryNote (e.g. "Show this at the
// [Society Name] security gate; call the host if security asks for a
// name") is real, host-written guidance for a specific building, not a
// cosmetic label, so it replaces the generic default rather than being
// appended as decorative prose.
export default function GatePassCard({ tokens, passCode, note, onPress }) {
  if (!passCode) return null;
  const c = tokens?.colors;
  return (
    <UtilityCardShell tokens={tokens} icon="🎟️" title="Entry Pass">
      <Text style={[s.note, { color: c?.dim || '#666' }]}>{note || 'Show this at the gate for check-in.'}</Text>
      <TouchableOpacity style={[s.btn, { backgroundColor: c?.accent || '#E8A020' }]} onPress={onPress}>
        <Text style={s.btnText}>View my gate pass</Text>
      </TouchableOpacity>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
  btn: { borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
});
