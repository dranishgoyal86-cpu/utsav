import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import SparkleIcon from '../components/SparkleIcon';
import { isPasswordStrong, PASSWORD_POLICY_HINT } from '../helpers';
import { syncCachedDesktopThemeId } from '../lib/desktopThemePalettes';
import { signInWithGoogle } from '../lib/googleAuth';

export default function SignupScreen({ navigation }) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const s = makeStyles(theme);

  async function handleSignup() {
    if (!name || !email || !phone || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (!isPasswordStrong(password)) {
      setError(PASSWORD_POLICY_HINT);
      return;
    }
    try {
      setLoading(true);
      setError('');

      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, phone, role: 'customer' }
        }
      });

      if (signupError) throw signupError;
      if (!data.user) throw new Error('Signup failed — no user returned');

      // The on_auth_user_created trigger already created a base public.users row.
      // This upsert refines it with the exact values from the form. Every
      // self-serve signup is a customer account — provider access is granted
      // only via the admin-reviewed Claim Business flow (see ClaimRequests.js),
      // which promotes role to 'provider' on approval.
      const { error: profileError } = await supabase
        .from('users')
        .upsert({
          id: data.user.id,
          name,
          email,
          phone,
          role: 'customer',
          city: 'Delhi',
        });

      if (profileError) {
        // Non-fatal: trigger already guaranteed a profile row exists.
        console.log('Profile refine error (non-fatal, trigger already created base row):', profileError.message);
      }

      // Ten desktop themes (Sept 16) — lib/desktopTheme.js resolves which
      // palette to export at MODULE LOAD, from a cache read synchronously
      // before any Supabase call could finish. On web, this page never
      // reloads on its own after signup (client-side navigation, same SPA
      // instance that loaded before this account existed, when the cache
      // fallback was 'toran') — so without this, a brand-new signup would
      // still see Toran until they happened to reload some other way. The
      // real users.desktop_theme is already 'simple' (the column's actual
      // default — this upsert never sets it), so caching that value here
      // and reloading once is what makes the very first screen a new
      // customer sees actually show Simple, per Anish's ask.
      if (Platform.OS === 'web') {
        syncCachedDesktopThemeId('simple');
        if (typeof window !== 'undefined' && window.location) {
          window.location.reload();
          return;
        }
      }

      // Success — auth state change will trigger navigation
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // "work on adding through google login in the app" (Anish, Sept 22) --
  // supabase.auth.signInWithOAuth creates the account on first use, same
  // call as logging in with Google later, so Signup and Login share the
  // exact same handler (see lib/googleAuth.js) -- there's no separate
  // "Google signup" step. Native only for now, same as LoginScreen.js.
  async function handleGoogleSignup() {
    try {
      setGoogleLoading(true);
      setError('');
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.logoBox}>
            <SparkleIcon style={s.logoIcon} />
            <Text style={s.appName}>Utsav</Text>
          </View>

          <View style={s.form}>
            <Text style={s.formTitle}>Create your account</Text>
            <Text style={s.label}>Full name</Text>
            <TextInput style={s.input} placeholder="Anish Kumar" placeholderTextColor={theme.textTertiary} value={name} onChangeText={setName} />
            <Text style={s.label}>Email</Text>
            <TextInput style={s.input} placeholder="you@example.com" placeholderTextColor={theme.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.label}>Phone number</Text>
            <TextInput style={s.input} placeholder="9999999999" placeholderTextColor={theme.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Text style={s.label}>Password</Text>
            <TextInput style={s.input} placeholder="8+ chars, 1 capital, 1 number, 1 special" placeholderTextColor={theme.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
            <Text style={s.passwordHint}>{PASSWORD_POLICY_HINT}</Text>
            {error ? <Text style={s.errorText}>{error}</Text> : null}
            <TouchableOpacity
              style={[s.signupBtn, loading && { opacity: 0.7 }]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={theme.btnPrimaryText} />
                : <Text style={s.signupBtnText}>Create account</Text>
              }
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <>
                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or</Text>
                  <View style={s.dividerLine} />
                </View>
                <TouchableOpacity
                  style={[s.googleBtn, googleLoading && { opacity: 0.7 }]}
                  onPress={handleGoogleSignup}
                  disabled={googleLoading}
                >
                  {googleLoading
                    ? <ActivityIndicator color={theme.text} />
                    : <Text style={s.googleBtnText}>Continue with Google</Text>
                  }
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={s.switchBtn} onPress={() => navigation.navigate('Login')}>
              <Text style={s.switchText}>
                Already have an account?{' '}
                <Text style={s.switchLink}>Log in</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.claimLink} onPress={() => navigation.navigate('ClaimVendorFlow')}>
            <Text style={s.claimLinkText}>🎪 Own a business? Claim it</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 44, paddingBottom: 20 },

    logoBox: { alignItems: 'center', marginBottom: 28 },
    logoIcon: { fontSize: 34, color: theme.accent, marginBottom: 8 },
    appName: { fontSize: 28, fontWeight: '700', color: theme.text, letterSpacing: -0.4 },

    form: {
      backgroundColor: theme.cardBg, borderRadius: 26, padding: 24,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 },
    },
    formTitle: { fontSize: 19, fontWeight: '700', color: theme.text, marginBottom: 18, letterSpacing: -0.3 },
    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 13 },
    input: { backgroundColor: theme.bg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },
    passwordHint: { fontSize: 11.5, color: theme.textTertiary, marginTop: 6, lineHeight: 15 },
    errorText: { fontSize: 13, color: theme.statusDeclinedText, marginTop: 11, textAlign: 'center' },
    signupBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    signupBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
    switchBtn: { marginTop: 18, alignItems: 'center' },
    switchText: { fontSize: 14, color: theme.textSecondary },
    switchLink: { color: theme.accent, fontWeight: '700' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 10 },
    dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
    dividerText: { fontSize: 12, fontWeight: '600', color: theme.textTertiary },
    googleBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      backgroundColor: theme.bg, borderRadius: 16, paddingVertical: 14, marginTop: 16,
      borderWidth: 1, borderColor: theme.border,
    },
    googleBtnText: { color: theme.text, fontSize: 15, fontWeight: '700' },

    claimLink: { alignItems: 'center', marginTop: 22 },
    claimLinkText: { fontSize: 12.5, fontWeight: '600', color: theme.textTertiary },
  });
}