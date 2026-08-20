import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import { showAlert, linkGuestAccountByPhone } from '../helpers';
import { OTP_ENABLED } from './ClaimVendorFlow';
import SparkleIcon from '../components/SparkleIcon';

// A lightweight, phone-first entry point for guests (reached from a gate
// pass / invite context, not the main "browse vendors" funnel SignupScreen
// serves) — but the account it creates is the SAME underlying type as any
// other Utsav customer account (confirmed against SignupScreen.js: same
// `users` row shape — id/name/email/phone/role:'customer'/city — no
// separate "guest" role exists anywhere in this schema).
//
// Phone OTP here is verification-only, never the account's identity —
// LoginScreen.js is email+password-only and stays that way (no separate
// phone-login path), so the account itself always ends up with a real
// email+password credential either way:
//  - OTP_ENABLED path: verifyPhoneOtp() creates a session via phone (that's
//    unavoidable — verifyOtp() always returns a session), then
//    supabase.auth.updateUser({email, password}) attaches an email+password
//    credential onto that SAME account (same auth.users.id) — mirrors
//    ClaimVendorFlow.js's own handleSubmit()'s updateUser({password}) call,
//    which does exactly this kind of "add a credential to an existing
//    session" for the identical reason. This is NOT auth.signUp() a second
//    time — that would create a disconnected second account.
//  - OTP disabled (current state): straight to auth.signUp({email,
//    password}) — same call SignupScreen.js's normal customer signup uses,
//    unchanged from before.
export default function GuestSignup({ navigation }) {
  const { theme } = useTheme();
  const s = makeStyles(theme);

  const [step, setStep] = useState('details'); // details | phone-otp
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneCooldown, setPhoneCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const cooldownTimer = useRef(null);
  useEffect(() => () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); }, []);

  function startCooldown() {
    setPhoneCooldown(60);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setPhoneCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownTimer.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  function validateDetails() {
    if (!name.trim()) {
      showAlert('Required', 'Please enter your name.');
      return false;
    }
    if (phone.trim().replace(/\D/g, '').length < 10) {
      showAlert('Invalid phone', 'Please enter a valid 10-digit phone number.');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      showAlert('Invalid email', 'Please enter a valid email address.');
      return false;
    }
    if (password.length < 6) {
      showAlert('Password too short', 'Password must be at least 6 characters.');
      return false;
    }
    return true;
  }

  function continueFromDetails() {
    if (!validateDetails()) return;
    if (OTP_ENABLED) {
      setStep('phone-otp');
    } else {
      createAccountNoOtp();
    }
  }

  // ── Shared: writes the users row + links existing event_invitees rows —
  // identical regardless of which path created the auth session/account. ──
  async function finishAccountSetup(userId) {
    const { error: upsertError } = await supabase.from('users').upsert({
      id: userId,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      role: 'customer',
      city: 'Delhi',
    });
    if (upsertError) console.log('users upsert (non-fatal):', upsertError.message);

    // Best-effort — App.js's fetchUserRole() also calls this on every
    // SIGNED_IN/session-restore, so this isn't the only place it happens,
    // just the earliest (idempotent either way).
    await linkGuestAccountByPhone(phone.trim());
    // Success — auth state change (this screen is only reachable logged
    // out) takes over navigation from here, same as SignupScreen.js.
  }

  // ── Phone OTP path (held behind OTP_ENABLED — see ClaimVendorFlow.js).
  // Verification only — the resulting phone-based session gets an
  // email+password credential attached right after, in verifyPhoneOtp(). ──
  async function sendPhoneOtp() {
    setPhoneSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: '+91' + phone.trim().replace(/\D/g, '') });
      if (error) throw error;
      setPhoneOtpSent(true);
      startCooldown();
    } catch (err) {
      showAlert('Could not send code', err.message);
    } finally {
      setPhoneSending(false);
    }
  }

  async function verifyPhoneOtp() {
    if (!phoneCode.trim()) {
      showAlert('Enter the code', 'Enter the code sent to your phone.');
      return;
    }
    setPhoneVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: '+91' + phone.trim().replace(/\D/g, ''),
        token: phoneCode.trim(),
        type: 'sms',
      });
      if (error) throw error;
      if (!data.session) throw new Error('Verification failed — no session returned.');

      // Attaches email+password to the SAME account verifyOtp() just
      // authenticated — not a second auth.signUp(), which would create an
      // unrelated second account with a different id.
      const { error: credError } = await supabase.auth.updateUser({ email: email.trim(), password });
      if (credError) throw credError;

      await finishAccountSetup(data.session.user.id);
    } catch (err) {
      showAlert('Verification failed', err.message);
    } finally {
      setPhoneVerifying(false);
    }
  }

  // ── OTP disabled (current state): create the account directly, same
  // call SignupScreen.js's normal customer signup already uses. ──
  async function createAccountNoOtp() {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: phone.trim(), role: 'customer' } },
      });
      if (error) throw error;
      if (!data.session) throw new Error('Account created — please check your email to confirm, then log in.');

      await finishAccountSetup(data.session.user.id);
    } catch (err) {
      showAlert('Error', err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function goBackStep() {
    if (step === 'phone-otp') setStep('details');
    else navigation.goBack();
  }

  const STEP_TITLES = {
    details: 'Create your Utsav account',
    'phone-otp': 'Verify your phone',
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={goBackStep} style={s.backBtn}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>{STEP_TITLES[step]}</Text>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {step === 'details' && (
            <>
              <View style={s.logoBox}>
                <SparkleIcon style={s.logoIcon} />
              </View>
              <Text style={s.fieldHint}>
                One account works across every event you're invited to — no need to sign up again next time.
              </Text>
              <Text style={s.label}>Your name</Text>
              <TextInput style={s.input} placeholder="Anish Kumar" placeholderTextColor={theme.textTertiary} value={name} onChangeText={setName} />
              <Text style={s.label}>Phone number</Text>
              <TextInput style={s.input} placeholder="9999999999" placeholderTextColor={theme.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Text style={s.label}>Email address</Text>
              <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={theme.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              <Text style={s.label}>Password</Text>
              <TextInput style={s.input} placeholder="At least 6 characters" placeholderTextColor={theme.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
              <TouchableOpacity style={s.primaryBtn} onPress={continueFromDetails} disabled={submitting}>
                {submitting ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>{OTP_ENABLED ? 'Continue' : 'Create account'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.switchBtn} onPress={() => navigation.navigate('Login')}>
                <Text style={s.switchText}>
                  Already have an account?{' '}
                  <Text style={s.switchLink}>Log in</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'phone-otp' && (
            <>
              {!phoneOtpSent ? (
                <>
                  <Text style={s.otpIntro}>We'll text a verification code to +91 {phone.trim()}</Text>
                  <TouchableOpacity style={s.primaryBtn} onPress={sendPhoneOtp} disabled={phoneSending}>
                    {phoneSending ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Send code</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.label}>Enter the 6-digit code</Text>
                  <TextInput style={[s.input, s.otpInput]} placeholder="123456" placeholderTextColor={theme.textTertiary} value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" maxLength={6} />
                  <TouchableOpacity style={s.primaryBtn} onPress={verifyPhoneOtp} disabled={phoneVerifying}>
                    {phoneVerifying ? <ActivityIndicator color={theme.btnPrimaryText} /> : <Text style={s.primaryBtnText}>Verify & create account</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={sendPhoneOtp} disabled={phoneCooldown > 0 || phoneSending} style={{ marginTop: 14, alignItems: 'center' }}>
                    <Text style={[s.resendText, phoneCooldown > 0 && { opacity: 0.5 }]}>
                      {phoneCooldown > 0 ? `Resend code in ${phoneCooldown}s` : 'Resend code'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
      borderBottomWidth: 0.5, borderBottomColor: theme.border,
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
    backBtn: { padding: 4 },
    backIcon: { fontSize: 20, color: theme.text },
    scroll: { padding: 20, flexGrow: 1 },

    logoBox: { alignItems: 'center', marginBottom: 16 },
    logoIcon: { fontSize: 28, color: theme.accent, marginBottom: 8 },

    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 16 },
    fieldHint: { fontSize: 12.5, color: theme.textSecondary, lineHeight: 18, marginBottom: 4 },
    input: { backgroundColor: theme.cardBg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },
    otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '700' },
    otpIntro: { fontSize: 14, color: theme.textSecondary, marginBottom: 18, lineHeight: 20 },
    resendText: { fontSize: 13, color: theme.accent, fontWeight: '600' },

    primaryBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    primaryBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
    switchBtn: { marginTop: 18, alignItems: 'center' },
    switchText: { fontSize: 14, color: theme.textSecondary },
    switchLink: { color: theme.accent, fontWeight: '700' },
  });
}
