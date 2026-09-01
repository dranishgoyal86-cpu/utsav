import { Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// The "registration" equivalent of RSVPCard — corporate-conference and
// product-launch schemas both mark registrationInfo REQUIRED, and the
// brief is explicit: "Do not use wedding-style terminology such as RSVP
// when registration is the more appropriate semantic action." This card
// owns no registration STORAGE of its own (no new database concept) — it
// is presentation/action-only, opening registrationUrl when the host
// supplied a real link, otherwise just surfacing the deadline/note as
// plain text. If no canonical registration-flow URL exists yet for a
// given event, this card still renders usefully (deadline/note visible)
// rather than being a dead button — see the completion report for this
// documented limitation.
export default function RegistrationCard({ tokens, registrationNote, registrationUrl, deadline, onPress }) {
  if (!registrationNote && !registrationUrl && !deadline) return null;
  const c = tokens?.colors;
  const handlePress = () => {
    if (onPress) return onPress();
    if (registrationUrl) Linking.openURL(registrationUrl);
  };
  return (
    <UtilityCardShell tokens={tokens} icon="📝" title="Registration">
      {registrationNote ? <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{registrationNote}</Text> : null}
      {deadline ? <Text style={[s.deadline, { color: c?.dim || '#888' }]}>Register by {deadline}</Text> : null}
      {(registrationUrl || onPress) ? (
        <TouchableOpacity style={[s.btn, { backgroundColor: c?.accent || '#E8A020' }]} onPress={handlePress}>
          <Text style={s.btnText}>Register now</Text>
        </TouchableOpacity>
      ) : null}
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 12.5, lineHeight: 18, marginBottom: 6 },
  deadline: { fontSize: 11.5, marginBottom: 8 },
  btn: { borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
});
