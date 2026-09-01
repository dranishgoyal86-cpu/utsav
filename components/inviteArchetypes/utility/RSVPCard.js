import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// A themed CTA, not a themed FORM — the actual RSVP flow stays
// screens/RSVPScreen.js unchanged (the brief's explicit "do not redesign
// RSVP differently for every archetype" rule). onPress is supplied by the
// caller (navigates to the real RSVP screen/route); this component owns
// no RSVP state of its own.
export default function RSVPCard({ tokens, rsvpStatus, onPress }) {
  const c = tokens?.colors;
  const label = rsvpStatus === 'yes' ? "You're attending — tap to update"
    : rsvpStatus === 'no' ? "You've declined — tap to update"
    : rsvpStatus === 'maybe' ? 'You marked Maybe — tap to update'
    : 'Tap to RSVP';
  return (
    <UtilityCardShell tokens={tokens} icon="💌" title="RSVP">
      <TouchableOpacity style={[s.btn, { backgroundColor: c?.accent || '#E8A020' }]} onPress={onPress}>
        <Text style={s.btnText}>{label}</Text>
      </TouchableOpacity>
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  btn: { borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
});
