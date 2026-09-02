import { Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import UtilityCardShell from './UtilityCardShell';

// The ticket/entry-status equivalent of RegistrationCard — for concert/
// festival/sports events whose canonical action is "get a ticket" or
// "check the entry fee" rather than RSVP or a registration form. Same
// presentation/action-only shape as RegistrationCard (no ticket-commerce
// backend): opens ticketUrl when the host supplied a real link, otherwise
// just surfaces whatever entry/tier text exists (including a simple
// "Free Entry" case with no button at all).
export default function TicketCard({ tokens, entryNote, tierNote, ticketUrl, onPress }) {
  if (!entryNote && !tierNote && !ticketUrl) return null;
  const c = tokens?.colors;
  const handlePress = () => {
    if (onPress) return onPress();
    if (ticketUrl) Linking.openURL(ticketUrl);
  };
  return (
    <UtilityCardShell tokens={tokens} icon="🎫" title="Tickets">
      {entryNote ? <Text style={[s.note, { color: c?.ink || '#1A1A1A' }]}>{entryNote}</Text> : null}
      {tierNote ? <Text style={[s.tier, { color: c?.dim || '#888' }]}>{tierNote}</Text> : null}
      {(ticketUrl || onPress) ? (
        <TouchableOpacity style={[s.btn, { backgroundColor: c?.accent || '#E8A020' }]} onPress={handlePress}>
          <Text style={s.btnText}>Get tickets</Text>
        </TouchableOpacity>
      ) : null}
    </UtilityCardShell>
  );
}

const s = StyleSheet.create({
  note: { fontSize: 12.5, lineHeight: 18, marginBottom: 4 },
  tier: { fontSize: 11.5, lineHeight: 16, marginBottom: 8 },
  btn: { borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
});
