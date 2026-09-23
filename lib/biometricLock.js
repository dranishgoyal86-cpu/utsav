// App-lock via the phone's own fingerprint/Face ID, layered on top of the
// session Supabase already keeps signed in on this device. This does NOT
// replace email/password or Google/Apple login — it just asks "prove it's
// you" again before showing an already-logged-in person's event and guest
// data, the same way a banking app locks itself. Off by default; a person
// turns it on from Profile > Settings.
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'utsav_biometric_lock_enabled';

export async function isBiometricLockEnabled() {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setBiometricLockEnabled(enabled) {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  } catch {
    // best-effort — if this fails the toggle just won't stick, not a crash
  }
}

// True only when the phone both has the hardware AND already has at least
// one fingerprint/face enrolled in its own Settings app. We don't offer the
// toggle at all when this is false, since turning it on would lock someone
// out with no way to unlock.
export async function isBiometricAvailable() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics() {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Utsav',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // phone PIN/pattern as fallback, same as most banking apps
    });
    return !!result.success;
  } catch {
    return false;
  }
}
