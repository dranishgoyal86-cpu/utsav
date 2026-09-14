import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTheme } from '../ThemeContext';
import SparkleIcon from './SparkleIcon';

// Shown once, full-screen, the first time a guest who already has the
// Utsav app opens it after being linked to an invite (see App.js's
// MainApp — checks for a `guest_invited` notification with
// celebrated_at still null). Deliberately NOT the same as a plain
// notification row: this is the "big celebratory welcome" moment asked
// for specifically, on top of (not instead of) the normal entry that
// still sits in the Notifications tab.
export default function CelebratoryInviteModal({ visible, eventName, hostName, onView, onDismiss }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={s.overlay}>
        <View style={[s.card, { borderColor: theme.accent }]}>
          <Text style={s.confetti}>🎉 🎊 🎉</Text>
          <SparkleIcon style={[s.sparkle, { color: theme.accent }]} />
          <Text style={s.title}>You're invited!</Text>
          <Text style={s.body}>
            {hostName ? `${hostName} has invited you to ` : "You've been invited to "}
            <Text style={{ fontWeight: '800' }}>{eventName || 'an event'}</Text>.
          </Text>
          <TouchableOpacity style={[s.viewBtn, { backgroundColor: theme.btnPrimary }]} onPress={onView}>
            <Text style={[s.viewBtnText, { color: theme.btnPrimaryText }]}>View invite</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.laterBtn} onPress={onDismiss}>
            <Text style={s.laterBtnText}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 },
    card: {
      width: '100%', maxWidth: 380, backgroundColor: theme.cardBg, borderRadius: 28, padding: 30,
      alignItems: 'center', borderWidth: 2,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
    },
    confetti: { fontSize: 22, marginBottom: 6 },
    sparkle: { fontSize: 30, marginBottom: 10 },
    title: { fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: 10, letterSpacing: -0.4 },
    body: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    viewBtn: { width: '100%', paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
    viewBtnText: { fontSize: 15, fontWeight: '700' },
    laterBtn: { marginTop: 14, paddingVertical: 6 },
    laterBtnText: { fontSize: 13.5, color: theme.textTertiary, fontWeight: '600' },
  });
}
