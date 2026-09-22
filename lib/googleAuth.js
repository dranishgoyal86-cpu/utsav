import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../supabase';

WebBrowser.maybeCompleteAuthSession();

// "work on adding through google login in the app" (Anish, Sept 22) --
// shared by both LoginScreen.js and SignupScreen.js (customer + provider
// both sign in through the same two screens already, role is picked
// later). Native app only for now (iOS/Android) -- WebBrowser's auth-
// session redirect doesn't map cleanly onto Expo web, and supabase.js's
// detectSessionInUrl is deliberately off, so wiring this into the web
// build is a separate follow-up, not silently bundled into this change.
//
// Role safety: this never writes to the users table at all. The
// on_auth_user_created DB trigger already creates a base users row for
// every new auth user (Google included, same as email/password signup),
// and App.js's fetchUserRole() already treats anything other than
// role === 'provider' as 'customer' -- so a first-time Google sign-in
// safely lands as a customer with zero code here, and signing in with
// Google can never flip an EXISTING provider account back to customer,
// because nothing here ever touches the role column.
function parseFragmentParams(url) {
  const params = {};
  const cut = url.indexOf('#') >= 0 ? url.indexOf('#') : url.indexOf('?');
  if (cut === -1) return params;
  for (const pair of url.slice(cut + 1).split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return params;
}

export async function signInWithGoogle() {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    // User backed out of the Google screen -- not a real error, just no-op.
    if (result.type === 'cancel' || result.type === 'dismiss') return;
    throw new Error('Google sign-in did not complete. Please try again.');
  }

  const params = parseFragmentParams(result.url);
  if (params.error) throw new Error(params.error_description || params.error);
  if (!params.access_token || !params.refresh_token) {
    throw new Error('Google sign-in did not return a session. Please try again.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  });
  if (sessionError) throw sessionError;
  // Success -- App.js's onAuthStateChange picks up the new session and
  // navigates away from Login/Signup on its own, same as email/password.
}
