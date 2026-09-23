// Sign in with Apple. Only ever runs on iOS — Apple doesn't offer this on
// Android, and Apple requires it (App Store rule 4.8) on any iOS app that
// also offers a third-party login like our Google sign-in. Unlike Google's
// flow (a browser redirect, see googleAuth.js), Apple hands back a signed
// identity token directly from the OS — no browser step needed.
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

export async function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return a sign-in token. Please try again.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Same role-safety note as googleAuth.js: we never write to the `role`
  // column here. The existing on_auth_user_created DB trigger creates the
  // base users row, and App.js's fetchUserRole() already treats anything
  // other than role === 'provider' as a customer — so this can't silently
  // turn an existing provider account into a customer one.
}
