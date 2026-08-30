import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { callEdgeFunction } from '../helpers';

// Provider verification, Task 1 (email) -- the landing screen for the link
// sent by request-email-verification. Registered in every App.js branch
// (see RSVPScreen precedent) since the recipient may open this logged out,
// as a provider, or on a different device entirely -- the token itself is
// the only thing that matters, verify-email-token doesn't check auth.
export default function VerifyEmailToken({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const token = route?.params?.token || '';

  const [status, setStatus] = useState('checking'); // checking | success | invalid | expired | error
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    (async () => {
      try {
        const data = await callEdgeFunction('verify-email-token', { token });
        setEmail(data.email || '');
        setStatus('success');
      } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('expired')) setStatus('expired');
        else if (msg.includes('invalid')) setStatus('invalid');
        else setStatus('error');
      }
    })();
  }, [token]);

  function goHome() {
    // No session guarantee either way -- App.js's own auth-state routing
    // decides where this actually lands (login screen if logged out, the
    // right tab set if logged in), same as every other cross-auth-state
    // link in this app.
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        {status === 'checking' && (
          <>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={s.title}>Verifying your email…</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Text style={s.icon}>✓</Text>
            <Text style={s.title}>Email verified</Text>
            <Text style={s.sub}>{email ? `${email} is now confirmed` : 'Your email is now confirmed'} on your Utsav provider profile.</Text>
            <TouchableOpacity style={s.btn} onPress={goHome}>
              <Text style={s.btnText}>Continue to Utsav</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'expired' && (
          <>
            <Text style={s.icon}>⏳</Text>
            <Text style={s.title}>This link has expired</Text>
            <Text style={s.sub}>Verification links are only valid for 24 hours. Open Utsav and request a new one from your verification screen.</Text>
            <TouchableOpacity style={s.btn} onPress={goHome}>
              <Text style={s.btnText}>Open Utsav</Text>
            </TouchableOpacity>
          </>
        )}

        {(status === 'invalid' || status === 'error') && (
          <>
            <Text style={s.icon}>✗</Text>
            <Text style={s.title}>{status === 'invalid' ? 'Invalid verification link' : 'Something went wrong'}</Text>
            <Text style={s.sub}>{status === 'invalid' ? "This link doesn't match a pending verification — it may have already been used." : 'Please try again in a moment.'}</Text>
            <TouchableOpacity style={s.btn} onPress={goHome}>
              <Text style={s.btnText}>Open Utsav</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    icon: { fontSize: 52, color: theme.accent, marginBottom: 18 },
    title: { fontSize: 20, fontWeight: '700', color: theme.text, marginTop: 18, textAlign: 'center' },
    sub: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 20, maxWidth: 340 },
    btn: { backgroundColor: theme.btnPrimary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 26 },
    btnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
  });
}
