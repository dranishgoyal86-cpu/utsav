import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import { showAlert } from '../helpers';

const PENDING_CODE_KEY = 'pending_delegate_code';

// Reached from a host's "Manage access" share link (theutsavapp.com/delegate/
// :inviteCode — see GuestList.js's inviteDelegate()). A delegate is a full
// app user acting on someone else's behalf, not a guest — so unlike
// GuestSignup.js this always routes through the normal Login/Signup screens,
// never a guest-account credential.
//
// Registered in ALL FOUR App.js branches (same as RSVPScreen — a delegate
// link can land while logged out, or already logged in as any role). When
// reached logged out, the code is stashed in AsyncStorage (survives the
// Login/Signup screen swap, which remounts this whole navigator tree once
// session flips) and App.js's fetchUserRole() picks it back up right after
// sign-in to return here automatically — see resumePendingDelegateInvite()
// in App.js.
export default function DelegateRedeem({ route, navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);
  const inviteCode = route.params?.inviteCode;

  const [session, setSession] = useState(undefined); // undefined = still checking
  const [status, setStatus] = useState('checking'); // checking | needs-login | claiming | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventId, setEventId] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
  }, []);

  useEffect(() => {
    if (session === undefined || !inviteCode) return;
    if (!session) {
      // Persist so App.js can resume this after Login/Signup completes.
      AsyncStorage.setItem(PENDING_CODE_KEY, inviteCode).catch(() => {});
      setStatus('needs-login');
      return;
    }
    claim();
  }, [session, inviteCode]);

  async function claim() {
    setStatus('claiming');
    try {
      const { data, error } = await supabase.rpc('claim_event_delegate', { p_invite_code: inviteCode });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('This delegate invite is invalid, already used, or has been revoked.');
      await AsyncStorage.removeItem(PENDING_CODE_KEY).catch(() => {});
      setEventName(row.event_name);
      setEventId(row.event_id);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }

  async function openGuestList() {
    try {
      const { data, error } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Could not load this event.');
      navigation.replace('GuestList', { event: data });
    } catch (err) {
      showAlert('Error', err.message);
    }
  }

  if (!inviteCode) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={s.title}>Invalid link</Text>
          <Text style={s.body}>This delegate invite link is missing its code.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'checking' || status === 'claiming' || session === undefined) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'needs-login') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🤝</Text>
          <Text style={s.title}>You've been invited to help manage a guest list</Text>
          <Text style={s.body}>Sign in or create an Utsav account to accept this invite.</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={s.primaryBtnText}>Log in</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={() => navigation.navigate('Signup')}>
            <Text style={s.secondaryBtnText}>Create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (status === 'error') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.centerBox}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={s.title}>Couldn't accept this invite</Text>
          <Text style={s.body}>{errorMsg}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.centerBox}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
        <Text style={s.title}>You now manage the guest list for "{eventName}"</Text>
        <Text style={s.body}>You can add/edit guests, send invites, and manage functions — event details like venue and date stay with the host.</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={openGuestList}>
          <Text style={s.primaryBtnText}>Open guest list</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    title: { fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginBottom: 8 },
    body: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center' },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
    secondaryBtn: { marginTop: 12, paddingVertical: 8 },
    secondaryBtnText: { color: theme.accent, fontSize: 14, fontWeight: '700' },
  });
}
