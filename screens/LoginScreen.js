import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import SparkleIcon from '../components/SparkleIcon';

export default function LoginScreen({ navigation }) {
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const s = makeStyles(theme);

  async function handleLogin() {
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.inner}
      >
        <View style={s.logoBox}>
          <SparkleIcon style={s.logoIcon} />
          <Text style={s.appName}>Utsav</Text>
          <Text style={s.tagline}>Find the best for your celebration</Text>
        </View>
        <View style={s.form}>
          <Text style={s.formTitle}>Welcome back</Text>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="Your password"
            placeholderTextColor={theme.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={s.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[s.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={theme.btnPrimaryText} />
              : <Text style={s.loginBtnText}>Log in</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={s.switchBtn}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={s.switchText}>
              New to Utsav?{' '}
              <Text style={s.switchLink}>Create account</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    inner: { flex: 1, paddingHorizontal: 26, justifyContent: 'center' },

    logoBox: { alignItems: 'center', marginBottom: 40 },
    logoIcon: { fontSize: 40, color: theme.accent, marginBottom: 12 },
    appName: { fontSize: 34, fontWeight: '700', color: theme.text, marginBottom: 8, letterSpacing: -0.5 },
    tagline: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' },

    form: {
      backgroundColor: theme.cardBg, borderRadius: 26, padding: 26,
      borderWidth: 0.5, borderColor: theme.border,
      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    },
    formTitle: { fontSize: 21, fontWeight: '700', color: theme.text, marginBottom: 22, letterSpacing: -0.3 },
    label: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 8, marginTop: 14 },
    input: { backgroundColor: theme.bg, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontSize: 14, borderWidth: 1, borderColor: theme.border, color: theme.text },
    errorText: { fontSize: 13, color: theme.statusDeclinedText, marginTop: 12, textAlign: 'center' },
    loginBtn: { backgroundColor: theme.btnPrimary, borderRadius: 16, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
    loginBtnText: { color: theme.btnPrimaryText, fontSize: 15, fontWeight: '700' },
    switchBtn: { marginTop: 18, alignItems: 'center' },
    switchText: { fontSize: 14, color: theme.textSecondary },
    switchLink: { color: theme.accent, fontWeight: '700' },
  });
}